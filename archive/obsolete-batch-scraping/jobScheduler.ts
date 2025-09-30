import cron from 'node-cron';
import { logger } from '../logger';
import { operationalControls } from './operationalControls';
import { jobScraperService } from './jobScraper';
import { QualityMetricsTracker } from './qualityMetrics';
import { randomUUID } from 'crypto';
import type { JobScrapingSession } from './jobScraper';

export interface SchedulingConfig {
  // Scheduling frequencies
  defaultFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  enabled: boolean;
  
  // Conservative scheduling to start
  schedules: {
    daily: string;    // Cron expression for daily
    weekly: string;   // Cron expression for weekly
    biweekly: string; // Cron expression for bi-weekly
    monthly: string;  // Cron expression for monthly
  };
  
  // Operational settings
  maxConcurrentSessions: number;
  sessionTimeoutMinutes: number;
  retryFailedSessions: boolean;
  retryDelayMinutes: number;
}

// Conservative default configuration for production safety
const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  defaultFrequency: 'weekly', // Start conservative
  enabled: false, // Disabled by default for safety
  
  schedules: {
    daily: '0 2 * * *',        // 2 AM daily
    weekly: '0 2 * * 0',       // 2 AM on Sundays
    biweekly: '0 2 * * 0',     // 2 AM on Sundays (logic handled in execution)
    monthly: '0 2 1 * *'       // 2 AM on 1st of month
  },
  
  maxConcurrentSessions: 1,   // Only one session at a time
  sessionTimeoutMinutes: 60,  // 1 hour timeout
  retryFailedSessions: true,
  retryDelayMinutes: 30       // Wait 30 minutes before retry
};

export interface SchedulerStatus {
  enabled: boolean;
  currentFrequency: string;
  nextExecution?: Date;
  currentSession?: {
    sessionId: string;
    startTime: Date;
    status: 'running' | 'completed' | 'failed' | 'timeout';
  };
  lastExecution?: {
    sessionId: string;
    startTime: Date;
    endTime: Date;
    status: 'completed' | 'failed' | 'timeout';
    jobsScraped: number;
    jobsSaved: number;
    errors: string[];
  };
  statistics: {
    totalSessions: number;
    successfulSessions: number;
    failedSessions: number;
    averageJobsPerSession: number;
    averageQuality: number;
  };
}

export class JobScheduler {
  private config: SchedulingConfig;
  private cronJob: any = null;
  private currentSession: JobScrapingSession | null = null;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private lastBiweeklyExecution: Date | null = null;
  private statistics = {
    totalSessions: 0,
    successfulSessions: 0,
    failedSessions: 0,
    totalJobsScraped: 0,
    totalJobsSaved: 0
  };
  private lastExecution: SchedulerStatus['lastExecution'] | null = null;

  constructor(configOverrides?: Partial<SchedulingConfig>) {
    this.config = { ...DEFAULT_SCHEDULING_CONFIG, ...configOverrides };
    
    logger.info('Job scheduler initialized', {
      operation: 'scheduler_init',
      config: {
        defaultFrequency: this.config.defaultFrequency,
        enabled: this.config.enabled,
        maxConcurrentSessions: this.config.maxConcurrentSessions
      }
    });
  }

  /**
   * Start the scheduled job scraping
   */
  async start(frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly'): Promise<{ 
    success: boolean; 
    message: string; 
    nextExecution?: Date; 
  }> {
    try {
      // Check operational controls
      const canProceed = operationalControls.canProceedWithScraping();
      if (!canProceed.canProceed) {
        logger.error('Cannot start scheduler - operational controls prevent execution', {
          operation: 'scheduler_start_blocked',
          reason: canProceed.reason,
          recommendations: canProceed.recommendations
        });
        
        return {
          success: false,
          message: `Cannot start scheduler: ${canProceed.reason}`
        };
      }

      const targetFrequency = frequency || this.config.defaultFrequency;
      const cronExpression = this.config.schedules[targetFrequency];

      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression for ${targetFrequency}: ${cronExpression}`);
      }

      // Stop existing cron job if running
      if (this.cronJob) {
        this.cronJob.stop();
        this.cronJob = null;
      }

      // Create new cron job
      this.cronJob = cron.schedule(cronExpression, async () => {
        await this.executeScheduledScraping(false, targetFrequency);
      }, {
        timezone: process.env.TZ || 'America/New_York' // Default to EST
      });

      // Start the cron job
      this.cronJob.start();
      this.config.enabled = true;
      this.config.defaultFrequency = targetFrequency;

      // Calculate next execution time
      const nextExecution = this.getNextExecutionTime();

      logger.info('Job scheduler started successfully', {
        operation: 'scheduler_started',
        frequency: targetFrequency,
        cronExpression,
        nextExecution,
        timezone: process.env.TZ || 'America/New_York'
      });

      return {
        success: true,
        message: `Scheduler started with ${targetFrequency} frequency`,
        nextExecution
      };

    } catch (error) {
      logger.error('Failed to start job scheduler', error, {
        operation: 'scheduler_start_failed',
        frequency
      });

      return {
        success: false,
        message: `Failed to start scheduler: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Stop the scheduled job scraping
   */
  async stop(): Promise<{ success: boolean; message: string }> {
    try {
      // Stop cron job
      if (this.cronJob) {
        this.cronJob.stop();
        this.cronJob = null;
      }

      this.config.enabled = false;

      // If there's a current session, let it complete but don't schedule more
      const message = this.currentSession 
        ? 'Scheduler stopped, current session will complete'
        : 'Scheduler stopped';

      logger.info('Job scheduler stopped', {
        operation: 'scheduler_stopped',
        hasCurrentSession: !!this.currentSession,
        currentSessionId: this.currentSession?.sessionId
      });

      return {
        success: true,
        message
      };

    } catch (error) {
      logger.error('Error stopping job scheduler', error, {
        operation: 'scheduler_stop_failed'
      });

      return {
        success: false,
        message: `Failed to stop scheduler: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute a manual job scraping session
   */
  async executeManual(): Promise<JobScrapingSession> {
    logger.info('Manual job scraping execution requested', {
      operation: 'manual_execution_requested'
    });

    return await this.executeScheduledScraping(true, 'manual');
  }

  /**
   * Main execution method for scheduled job scraping
   */
  private async executeScheduledScraping(isManual: boolean = false, frequency?: string): Promise<JobScrapingSession> {
    const sessionId = randomUUID();
    
    logger.info(`${isManual ? 'Manual' : 'Scheduled'} job scraping session starting`, {
      operation: 'scheduled_scraping_start',
      sessionId,
      isManual,
      frequency,
      currentSessionActive: !!this.currentSession
    });

    // Check if there's already a session running (race condition prevention)
    if (this.currentSession) {
      logger.warn('Scraping session already in progress, skipping this execution', {
        operation: 'scraping_session_skipped',
        sessionId,
        activeSessionId: this.currentSession.sessionId,
        activeSessionStart: this.currentSession.startTime
      });
      
      return this.currentSession;
    }

    // Handle biweekly scheduling logic
    if (!isManual && frequency === 'biweekly') {
      const now = new Date();
      if (this.lastBiweeklyExecution) {
        const daysSinceLastBiweekly = Math.floor((now.getTime() - this.lastBiweeklyExecution.getTime()) / (24 * 60 * 60 * 1000));
        if (daysSinceLastBiweekly < 14) {
          logger.info('Biweekly execution skipped - not yet 14 days since last run', {
            operation: 'biweekly_execution_skipped',
            sessionId,
            daysSinceLastBiweekly,
            lastBiweeklyExecution: this.lastBiweeklyExecution
          });
          
          // Return a minimal session indicating skip
          return {
            sessionId,
            startTime: now,
            totalUsers: 0,
            processedUsers: 0,
            totalJobsScraped: 0,
            totalJobsSaved: 0,
            totalJobsSkipped: 0,
            errors: ['Biweekly execution skipped - interval not met']
          };
        }
      }
    }

    // Set session mutex immediately to prevent race conditions
    this.currentSession = {
      sessionId,
      startTime: new Date(),
      totalUsers: 0,
      processedUsers: 0,
      totalJobsScraped: 0,
      totalJobsSaved: 0,
      totalJobsSkipped: 0,
      errors: []
    };

    try {
      // Pre-execution operational checks
      const canProceed = operationalControls.canProceedWithScraping();
      if (!canProceed.canProceed) {
        logger.error('Scraping execution blocked by operational controls', {
          operation: 'scraping_blocked',
          sessionId,
          reason: canProceed.reason,
          recommendations: canProceed.recommendations
        });

        // Create a minimal session result to track the failure
        const failedSession: JobScrapingSession = {
          sessionId,
          startTime: new Date(),
          totalUsers: 0,
          processedUsers: 0,
          totalJobsScraped: 0,
          totalJobsSaved: 0,
          totalJobsSkipped: 0,
          errors: [canProceed.reason || 'Operational controls prevented execution']
        };

        this.recordSessionResult(failedSession, 'failed');
        return failedSession;
      }

      // Start operational session tracking
      operationalControls.startSession(sessionId);

      // Set up session timeout
      this.sessionTimeout = setTimeout(() => {
        this.handleSessionTimeout(sessionId);
      }, this.config.sessionTimeoutMinutes * 60 * 1000);

      // Execute the actual job scraping
      logger.info('Starting job scraping execution', {
        operation: 'job_scraping_execution',
        sessionId
      });

      const session = await jobScraperService.scrapeJobsForAllUsers();
      // Update current session with results
      this.currentSession = { ...this.currentSession, ...session };

      // Clear timeout since session completed successfully
      if (this.sessionTimeout) {
        clearTimeout(this.sessionTimeout);
        this.sessionTimeout = null;
      }

      // Determine session result status
      const hasErrors = session.errors.length > 0;
      const hasJobs = session.totalJobsSaved > 0;
      const status = hasErrors ? (hasJobs ? 'completed' : 'failed') : 'completed';

      // Record results and track biweekly execution
      this.recordSessionResult(session, status);
      
      // Track biweekly execution for proper interval spacing
      if (!isManual && frequency === 'biweekly' && status === 'completed') {
        this.lastBiweeklyExecution = new Date();
        logger.info('Biweekly execution timestamp updated', {
          operation: 'biweekly_timestamp_updated',
          sessionId,
          timestamp: this.lastBiweeklyExecution
        });
      }
      
      this.currentSession = null;

      logger.info('Scheduled job scraping session completed', {
        operation: 'scheduled_scraping_completed',
        sessionId,
        isManual,
        status,
        totalUsers: session.totalUsers,
        processedUsers: session.processedUsers,
        jobsScraped: session.totalJobsScraped,
        jobsSaved: session.totalJobsSaved,
        jobsSkipped: session.totalJobsSkipped,
        errorCount: session.errors.length,
        duration: Date.now() - session.startTime.getTime()
      });

      return session;

    } catch (error) {
      // Clear timeout and clean up
      if (this.sessionTimeout) {
        clearTimeout(this.sessionTimeout);
        this.sessionTimeout = null;
      }

      this.currentSession = null;

      logger.error('Scheduled job scraping session failed', error, {
        operation: 'scheduled_scraping_failed',
        sessionId,
        isManual
      });

      // Create error session for tracking
      const errorSession: JobScrapingSession = {
        sessionId,
        startTime: new Date(),
        totalUsers: 0,
        processedUsers: 0,
        totalJobsScraped: 0,
        totalJobsSaved: 0,
        totalJobsSkipped: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error during execution']
      };

      this.recordSessionResult(errorSession, 'failed');
      
      // Record error in operational controls
      operationalControls.recordError(error instanceof Error ? error.message : 'Unknown error');

      return errorSession;
    }
  }

  /**
   * Handle session timeout
   */
  private handleSessionTimeout(sessionId: string): void {
    logger.error('Job scraping session timed out', {
      operation: 'session_timeout',
      sessionId,
      timeoutMinutes: this.config.sessionTimeoutMinutes
    });

    // Clean up
    this.currentSession = null;
    this.sessionTimeout = null;

    // Record timeout
    this.statistics.failedSessions++;
    this.statistics.totalSessions++;

    // Consider disabling scheduler if too many timeouts
    operationalControls.recordError(`Session timeout after ${this.config.sessionTimeoutMinutes} minutes`);
  }

  /**
   * Record session results for statistics and monitoring
   */
  private recordSessionResult(
    session: JobScrapingSession, 
    status: 'completed' | 'failed' | 'timeout'
  ): void {
    // Update statistics
    this.statistics.totalSessions++;
    this.statistics.totalJobsScraped += session.totalJobsScraped;
    this.statistics.totalJobsSaved += session.totalJobsSaved;

    if (status === 'completed') {
      this.statistics.successfulSessions++;
    } else {
      this.statistics.failedSessions++;
    }

    // Store last execution details
    this.lastExecution = {
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: new Date(),
      status,
      jobsScraped: session.totalJobsScraped,
      jobsSaved: session.totalJobsSaved,
      errors: session.errors
    };

    logger.info('Session result recorded', {
      operation: 'session_result_recorded',
      sessionId: session.sessionId,
      status,
      statistics: this.getStatisticsSummary()
    });
  }

  /**
   * Get current scheduler status
   */
  getStatus(): SchedulerStatus {
    const qualityStats = QualityMetricsTracker.getQualityStats(24);
    
    return {
      enabled: this.config.enabled,
      currentFrequency: this.config.defaultFrequency,
      nextExecution: this.getNextExecutionTime(),
      currentSession: this.currentSession ? {
        sessionId: this.currentSession.sessionId,
        startTime: this.currentSession.startTime,
        status: 'running'
      } : undefined,
      lastExecution: this.lastExecution || undefined,
      statistics: {
        totalSessions: this.statistics.totalSessions,
        successfulSessions: this.statistics.successfulSessions,
        failedSessions: this.statistics.failedSessions,
        averageJobsPerSession: this.statistics.totalSessions > 0 
          ? Math.round(this.statistics.totalJobsSaved / this.statistics.totalSessions)
          : 0,
        averageQuality: qualityStats.averageQuality
      }
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(updates: Partial<SchedulingConfig>): { success: boolean; message: string } {
    try {
      const oldConfig = { ...this.config };
      this.config = { ...this.config, ...updates };

      // If frequency changed and scheduler is running, restart it
      if (this.config.enabled && oldConfig.defaultFrequency !== this.config.defaultFrequency) {
        logger.info('Restarting scheduler with new frequency', {
          operation: 'scheduler_config_restart',
          oldFrequency: oldConfig.defaultFrequency,
          newFrequency: this.config.defaultFrequency
        });

        // Stop current job
        if (this.cronJob) {
          this.cronJob.stop();
        }

        // Start with new frequency
        this.start(this.config.defaultFrequency);
      }

      logger.info('Scheduler configuration updated', {
        operation: 'scheduler_config_updated',
        updates,
        newConfig: {
          defaultFrequency: this.config.defaultFrequency,
          enabled: this.config.enabled,
          maxConcurrentSessions: this.config.maxConcurrentSessions
        }
      });

      return {
        success: true,
        message: 'Configuration updated successfully'
      };

    } catch (error) {
      logger.error('Failed to update scheduler configuration', error, {
        operation: 'scheduler_config_update_failed'
      });

      return {
        success: false,
        message: `Failed to update configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get next execution time
   */
  private getNextExecutionTime(): Date | undefined {
    if (!this.cronJob || !this.config.enabled) {
      return undefined;
    }

    // This is a simplified calculation - in production you might want to use a cron parsing library
    const now = new Date();
    const cronExpression = this.config.schedules[this.config.defaultFrequency];
    
    // For now, return a rough estimate based on frequency
    switch (this.config.defaultFrequency) {
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(2, 0, 0, 0);
        return tomorrow;
        
      case 'weekly':
        const nextSunday = new Date(now);
        const daysUntilSunday = (7 - now.getDay()) % 7;
        nextSunday.setDate(now.getDate() + (daysUntilSunday || 7));
        nextSunday.setHours(2, 0, 0, 0);
        return nextSunday;
        
      case 'biweekly':
        const nextBiweekly = new Date(now);
        if (this.lastBiweeklyExecution) {
          // Calculate next execution based on last biweekly execution + 14 days
          const nextExecution = new Date(this.lastBiweeklyExecution);
          nextExecution.setDate(nextExecution.getDate() + 14);
          nextExecution.setHours(2, 0, 0, 0);
          return nextExecution;
        } else {
          // First biweekly execution - next Sunday
          const daysUntilSunday = (7 - now.getDay()) % 7;
          nextBiweekly.setDate(now.getDate() + (daysUntilSunday || 7));
          nextBiweekly.setHours(2, 0, 0, 0);
          return nextBiweekly;
        }
        
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(2, 0, 0, 0);
        return nextMonth;
        
      default:
        return undefined;
    }
  }

  /**
   * Get statistics summary
   */
  private getStatisticsSummary() {
    return {
      totalSessions: this.statistics.totalSessions,
      successfulSessions: this.statistics.successfulSessions,
      failedSessions: this.statistics.failedSessions,
      successRate: this.statistics.totalSessions > 0 
        ? Math.round((this.statistics.successfulSessions / this.statistics.totalSessions) * 100)
        : 0,
      averageJobsPerSession: this.statistics.totalSessions > 0
        ? Math.round(this.statistics.totalJobsSaved / this.statistics.totalSessions)
        : 0
    };
  }

  /**
   * Reset statistics (admin function)
   */
  resetStatistics(): void {
    this.statistics = {
      totalSessions: 0,
      successfulSessions: 0,
      failedSessions: 0,
      totalJobsScraped: 0,
      totalJobsSaved: 0
    };
    
    this.lastExecution = null;

    logger.info('Scheduler statistics reset', {
      operation: 'scheduler_stats_reset'
    });
  }
}

// Create singleton instance with environment-based configuration
const envConfig: Partial<SchedulingConfig> = {
  enabled: process.env.JOB_SCHEDULER_ENABLED === 'true',
  defaultFrequency: (process.env.JOB_SCHEDULER_FREQUENCY as any) || 'weekly',
  maxConcurrentSessions: process.env.MAX_CONCURRENT_SESSIONS ? parseInt(process.env.MAX_CONCURRENT_SESSIONS) : undefined,
  sessionTimeoutMinutes: process.env.SESSION_TIMEOUT_MINUTES ? parseInt(process.env.SESSION_TIMEOUT_MINUTES) : undefined,
  retryFailedSessions: process.env.RETRY_FAILED_SESSIONS !== 'false',
  retryDelayMinutes: process.env.RETRY_DELAY_MINUTES ? parseInt(process.env.RETRY_DELAY_MINUTES) : undefined
};

// Log environment variable parsing for debugging
logger.info('Job scheduler environment variables parsed', {
  operation: 'env_vars_parsed',
  envConfig: {
    JOB_SCHEDULER_ENABLED: process.env.JOB_SCHEDULER_ENABLED,
    JOB_SCHEDULER_FREQUENCY: process.env.JOB_SCHEDULER_FREQUENCY,
    MAX_CONCURRENT_SESSIONS: process.env.MAX_CONCURRENT_SESSIONS,
    SESSION_TIMEOUT_MINUTES: process.env.SESSION_TIMEOUT_MINUTES,
    RETRY_FAILED_SESSIONS: process.env.RETRY_FAILED_SESSIONS,
    RETRY_DELAY_MINUTES: process.env.RETRY_DELAY_MINUTES,
    TZ: process.env.TZ
  },
  parsedConfig: {
    enabled: envConfig.enabled,
    defaultFrequency: envConfig.defaultFrequency,
    maxConcurrentSessions: envConfig.maxConcurrentSessions,
    sessionTimeoutMinutes: envConfig.sessionTimeoutMinutes,
    retryFailedSessions: envConfig.retryFailedSessions,
    retryDelayMinutes: envConfig.retryDelayMinutes
  }
});

export const jobScheduler = new JobScheduler(envConfig);
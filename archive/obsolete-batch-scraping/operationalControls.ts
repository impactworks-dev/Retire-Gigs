import { logger } from '../logger';
import { QualityMetricsTracker, type JobQualityMetrics } from './qualityMetrics';

// Operational configuration and limits
export interface OperationalConfig {
  // Per-site limits
  maxJobsPerSite: number;
  maxJobsPerUserPerSite: number;
  maxUsersPerBatch: number;
  
  // Quality thresholds
  minQualityThreshold: number; // Below this, stop scraping
  warningQualityThreshold: number; // Below this, log warnings
  qualityCheckHours: number; // Hours to look back for quality assessment
  
  // Rate limiting
  delayBetweenSites: number; // ms delay between different sites
  delayBetweenQueries: number; // ms delay between queries on same site
  delayBetweenBatches: number; // ms delay between user batches
  
  // Feature flags
  sitesEnabled: {
    indeed: boolean;
    aarp: boolean;
    usajobs: boolean;
  };
  
  // Emergency controls
  globalKillSwitch: boolean;
  maxErrorsBeforeStop: number;
  
  // Deduplication settings
  duplicateThreshold: number; // Similarity threshold for detecting duplicates
  deduplicationWindowHours: number; // Hours to look back for duplicates
}

// Default configuration - conservative settings for production safety
const DEFAULT_CONFIG: OperationalConfig = {
  // Conservative per-site limits
  maxJobsPerSite: 50, // Maximum jobs from any single site per scraping session
  maxJobsPerUserPerSite: 5, // Maximum jobs per user per site
  maxUsersPerBatch: 3, // Small batches to avoid overwhelming systems
  
  // Quality thresholds
  minQualityThreshold: 40, // Stop scraping if quality drops below 40%
  warningQualityThreshold: 60, // Warning if below 60%
  qualityCheckHours: 24, // Check quality over last 24 hours
  
  // Conservative rate limiting
  delayBetweenSites: 2000, // 2 second delay between sites
  delayBetweenQueries: 1000, // 1 second delay between queries
  delayBetweenBatches: 5000, // 5 second delay between batches
  
  // All sites enabled by default
  sitesEnabled: {
    indeed: true,
    aarp: true,
    usajobs: true
  },
  
  // Emergency controls
  globalKillSwitch: false,
  maxErrorsBeforeStop: 10, // Stop if more than 10 errors in a session
  
  // Deduplication settings
  duplicateThreshold: 0.85, // 85% similarity threshold
  deduplicationWindowHours: 168 // 7 days lookback for duplicates
};

export class OperationalControls {
  private config: OperationalConfig;
  private sessionStats: {
    sessionId: string;
    startTime: Date;
    errorCount: number;
    siteCounts: Record<string, number>;
    qualityChecked: boolean;
  } | null = null;

  constructor(configOverrides?: Partial<OperationalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...configOverrides };
    
    logger.info('Operational controls initialized', {
      operation: 'operational_controls_init',
      config: {
        maxJobsPerSite: this.config.maxJobsPerSite,
        minQualityThreshold: this.config.minQualityThreshold,
        sitesEnabled: this.config.sitesEnabled,
        globalKillSwitch: this.config.globalKillSwitch
      }
    });
  }

  /**
   * Start a new operational session with tracking
   */
  startSession(sessionId: string): void {
    this.sessionStats = {
      sessionId,
      startTime: new Date(),
      errorCount: 0,
      siteCounts: { indeed: 0, aarp: 0, usajobs: 0 },
      qualityChecked: false
    };

    logger.info('Operational session started', {
      operation: 'operational_session_start',
      sessionId,
      config: this.getPublicConfig()
    });
  }

  /**
   * Check if scraping should proceed based on all operational controls
   */
  canProceedWithScraping(): {
    canProceed: boolean;
    reason?: string;
    recommendations?: string[];
  } {
    // Check global kill switch
    if (this.config.globalKillSwitch) {
      return {
        canProceed: false,
        reason: 'Global kill switch is enabled',
        recommendations: ['Disable kill switch to resume scraping']
      };
    }

    // Check quality metrics if not already checked this session
    if (this.sessionStats && !this.sessionStats.qualityChecked) {
      const qualityCheck = this.checkQualityThresholds();
      this.sessionStats.qualityChecked = true;
      
      if (!qualityCheck.canProceed) {
        return qualityCheck;
      }
    }

    // Check session error count
    if (this.sessionStats && this.sessionStats.errorCount >= this.config.maxErrorsBeforeStop) {
      return {
        canProceed: false,
        reason: `Too many errors in session: ${this.sessionStats.errorCount}`,
        recommendations: [
          'Check logs for error patterns',
          'Consider reducing batch size',
          'Check external API availability'
        ]
      };
    }

    return { canProceed: true };
  }

  /**
   * Check if scraping from a specific site is allowed
   */
  canScrapeFromSite(site: string): {
    canScrape: boolean;
    reason?: string;
    remainingQuota?: number;
  } {
    // Check if site is enabled
    const siteEnabled = this.config.sitesEnabled[site as keyof typeof this.config.sitesEnabled];
    if (!siteEnabled) {
      return {
        canScrape: false,
        reason: `Site ${site} is disabled via feature flag`
      };
    }

    // Check site-specific quota
    if (this.sessionStats) {
      const currentCount = this.sessionStats.siteCounts[site] || 0;
      const remaining = this.config.maxJobsPerSite - currentCount;
      
      if (remaining <= 0) {
        return {
          canScrape: false,
          reason: `Site quota exceeded for ${site}: ${currentCount}/${this.config.maxJobsPerSite}`,
          remainingQuota: 0
        };
      }

      return {
        canScrape: true,
        remainingQuota: remaining
      };
    }

    return { canScrape: true, remainingQuota: this.config.maxJobsPerSite };
  }

  /**
   * Record jobs scraped from a site for quota tracking
   */
  recordJobsScraped(site: string, count: number): void {
    if (this.sessionStats) {
      this.sessionStats.siteCounts[site] = (this.sessionStats.siteCounts[site] || 0) + count;
      
      logger.info('Jobs scraped recorded for site', {
        operation: 'jobs_scraped_recorded',
        sessionId: this.sessionStats.sessionId,
        site,
        count,
        totalForSite: this.sessionStats.siteCounts[site],
        quota: this.config.maxJobsPerSite
      });
    }
  }

  /**
   * Record an error for session tracking
   */
  recordError(error: string, site?: string): void {
    if (this.sessionStats) {
      this.sessionStats.errorCount++;
      
      logger.warn('Error recorded in operational session', {
        operation: 'operational_error_recorded',
        sessionId: this.sessionStats.sessionId,
        error,
        site,
        totalErrors: this.sessionStats.errorCount,
        maxErrors: this.config.maxErrorsBeforeStop
      });

      // Check if we should stop due to too many errors
      if (this.sessionStats.errorCount >= this.config.maxErrorsBeforeStop) {
        logger.error('Maximum error threshold reached, scraping should stop', {
          operation: 'max_errors_reached',
          sessionId: this.sessionStats.sessionId,
          errorCount: this.sessionStats.errorCount,
          threshold: this.config.maxErrorsBeforeStop
        });
      }
    }
  }

  /**
   * Get appropriate delays for rate limiting
   */
  getDelays(): {
    betweenSites: number;
    betweenQueries: number;
    betweenBatches: number;
  } {
    return {
      betweenSites: this.config.delayBetweenSites,
      betweenQueries: this.config.delayBetweenQueries,
      betweenBatches: this.config.delayBetweenBatches
    };
  }

  /**
   * Check quality thresholds and determine if scraping should continue
   */
  private checkQualityThresholds(): {
    canProceed: boolean;
    reason?: string;
    recommendations?: string[];
  } {
    const qualityStats = QualityMetricsTracker.getQualityStats(this.config.qualityCheckHours);
    
    if (qualityStats.totalSessions === 0) {
      logger.info('No quality data available, proceeding with scraping', {
        operation: 'quality_check_no_data',
        checkHours: this.config.qualityCheckHours
      });
      return { canProceed: true };
    }

    // Check if quality is below minimum threshold
    if (qualityStats.averageQuality < this.config.minQualityThreshold) {
      logger.error('Quality below minimum threshold, stopping scraping', {
        operation: 'quality_threshold_violation',
        currentQuality: qualityStats.averageQuality,
        minThreshold: this.config.minQualityThreshold,
        checkHours: this.config.qualityCheckHours,
        totalSessions: qualityStats.totalSessions
      });

      return {
        canProceed: false,
        reason: `Quality too low: ${qualityStats.averageQuality}% (minimum: ${this.config.minQualityThreshold}%)`,
        recommendations: [
          'Check DOM selectors for job sites',
          'Review parsing logic for common failures',
          'Consider disabling low-quality sites temporarily',
          'Investigate site structure changes'
        ]
      };
    }

    // Log warning if quality is concerning but not critical
    if (qualityStats.averageQuality < this.config.warningQualityThreshold) {
      logger.warn('Quality below warning threshold', {
        operation: 'quality_warning',
        currentQuality: qualityStats.averageQuality,
        warningThreshold: this.config.warningQualityThreshold,
        checkHours: this.config.qualityCheckHours,
        lowQualitySites: qualityStats.siteBreakdown.filter(s => s.quality < this.config.warningQualityThreshold)
      });
    } else {
      logger.info('Quality check passed', {
        operation: 'quality_check_passed',
        currentQuality: qualityStats.averageQuality,
        checkHours: this.config.qualityCheckHours,
        totalSessions: qualityStats.totalSessions
      });
    }

    return { canProceed: true };
  }

  /**
   * Update configuration (for admin controls)
   */
  updateConfig(updates: Partial<OperationalConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };
    
    logger.info('Operational configuration updated', {
      operation: 'config_updated',
      updates,
      oldConfig: {
        globalKillSwitch: oldConfig.globalKillSwitch,
        sitesEnabled: oldConfig.sitesEnabled,
        minQualityThreshold: oldConfig.minQualityThreshold
      },
      newConfig: {
        globalKillSwitch: this.config.globalKillSwitch,
        sitesEnabled: this.config.sitesEnabled,
        minQualityThreshold: this.config.minQualityThreshold
      }
    });
  }

  /**
   * Get current configuration (for admin endpoints)
   */
  getConfig(): OperationalConfig {
    return { ...this.config };
  }

  /**
   * Get public configuration (excluding sensitive details)
   */
  getPublicConfig(): Partial<OperationalConfig> {
    return {
      maxJobsPerSite: this.config.maxJobsPerSite,
      maxJobsPerUserPerSite: this.config.maxJobsPerUserPerSite,
      minQualityThreshold: this.config.minQualityThreshold,
      sitesEnabled: this.config.sitesEnabled,
      globalKillSwitch: this.config.globalKillSwitch
    };
  }

  /**
   * Get current session statistics
   */
  getSessionStats() {
    return this.sessionStats ? { ...this.sessionStats } : null;
  }

  /**
   * Emergency stop - immediately disable all scraping
   */
  emergencyStop(reason: string): void {
    this.config.globalKillSwitch = true;
    
    logger.error('Emergency stop activated', {
      operation: 'emergency_stop',
      reason,
      sessionId: this.sessionStats?.sessionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Re-enable scraping after emergency stop
   */
  resumeOperations(reason: string): void {
    this.config.globalKillSwitch = false;
    
    logger.info('Operations resumed', {
      operation: 'operations_resumed',
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Enable or disable a specific site
   */
  setSiteEnabled(site: keyof OperationalConfig['sitesEnabled'], enabled: boolean, reason?: string): void {
    const oldState = this.config.sitesEnabled[site];
    this.config.sitesEnabled[site] = enabled;
    
    logger.info(`Site ${enabled ? 'enabled' : 'disabled'}`, {
      operation: 'site_toggle',
      site,
      enabled,
      reason,
      oldState,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get operational health summary
   */
  getHealthSummary(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
    currentSession?: any;
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check kill switch
    if (this.config.globalKillSwitch) {
      issues.push('Global kill switch is enabled');
      recommendations.push('Disable kill switch to resume operations');
      status = 'critical';
    }

    // Check disabled sites
    const disabledSites = Object.entries(this.config.sitesEnabled)
      .filter(([_, enabled]) => !enabled)
      .map(([site]) => site);
    
    if (disabledSites.length > 0) {
      issues.push(`Disabled sites: ${disabledSites.join(', ')}`);
      if (disabledSites.length === Object.keys(this.config.sitesEnabled).length) {
        status = 'critical';
      } else if (status === 'healthy') {
        status = 'warning';
      }
    }

    // Check quality
    const qualityStats = QualityMetricsTracker.getQualityStats(this.config.qualityCheckHours);
    if (qualityStats.totalSessions > 0) {
      if (qualityStats.averageQuality < this.config.minQualityThreshold) {
        issues.push(`Quality too low: ${qualityStats.averageQuality}%`);
        status = 'critical';
      } else if (qualityStats.averageQuality < this.config.warningQualityThreshold) {
        issues.push(`Quality concerning: ${qualityStats.averageQuality}%`);
        if (status === 'healthy') status = 'warning';
      }
    }

    // Check session errors
    if (this.sessionStats && this.sessionStats.errorCount >= this.config.maxErrorsBeforeStop * 0.8) {
      issues.push(`High error count: ${this.sessionStats.errorCount}`);
      recommendations.push('Check logs for error patterns');
      if (status === 'healthy') status = 'warning';
    }

    return {
      status,
      issues,
      recommendations,
      currentSession: this.sessionStats ? {
        sessionId: this.sessionStats.sessionId,
        duration: Date.now() - this.sessionStats.startTime.getTime(),
        errorCount: this.sessionStats.errorCount,
        siteCounts: this.sessionStats.siteCounts
      } : undefined
    };
  }
}

// Create singleton instance with environment-based configuration
const envConfig: Partial<OperationalConfig> = {
  // Allow environment overrides for operational settings
  globalKillSwitch: process.env.SCRAPING_KILL_SWITCH === 'true',
  minQualityThreshold: process.env.MIN_QUALITY_THRESHOLD ? parseInt(process.env.MIN_QUALITY_THRESHOLD) : undefined,
  warningQualityThreshold: process.env.WARNING_QUALITY_THRESHOLD ? parseInt(process.env.WARNING_QUALITY_THRESHOLD) : undefined,
  qualityCheckHours: process.env.QUALITY_CHECK_HOURS ? parseInt(process.env.QUALITY_CHECK_HOURS) : undefined,
  maxJobsPerSite: process.env.MAX_JOBS_PER_SITE ? parseInt(process.env.MAX_JOBS_PER_SITE) : undefined,
  maxJobsPerUserPerSite: process.env.MAX_JOBS_PER_USER_PER_SITE ? parseInt(process.env.MAX_JOBS_PER_USER_PER_SITE) : undefined,
  maxUsersPerBatch: process.env.MAX_USERS_PER_BATCH ? parseInt(process.env.MAX_USERS_PER_BATCH) : undefined,
  maxErrorsBeforeStop: process.env.MAX_ERRORS_BEFORE_STOP ? parseInt(process.env.MAX_ERRORS_BEFORE_STOP) : undefined,
  delayBetweenSites: process.env.DELAY_BETWEEN_SITES ? parseInt(process.env.DELAY_BETWEEN_SITES) : undefined,
  delayBetweenQueries: process.env.DELAY_BETWEEN_QUERIES ? parseInt(process.env.DELAY_BETWEEN_QUERIES) : undefined,
  delayBetweenBatches: process.env.DELAY_BETWEEN_BATCHES ? parseInt(process.env.DELAY_BETWEEN_BATCHES) : undefined,
  duplicateThreshold: process.env.DUPLICATE_THRESHOLD ? parseFloat(process.env.DUPLICATE_THRESHOLD) : undefined,
  deduplicationWindowHours: process.env.DEDUPLICATION_WINDOW_HOURS ? parseInt(process.env.DEDUPLICATION_WINDOW_HOURS) : undefined,
  sitesEnabled: {
    indeed: process.env.INDEED_ENABLED !== 'false',
    aarp: process.env.AARP_ENABLED !== 'false', 
    usajobs: process.env.USAJOBS_ENABLED !== 'false'
  }
};

// Log environment variable parsing for debugging
logger.info('Operational controls environment variables parsed', {
  operation: 'env_vars_parsed',
  envVars: {
    SCRAPING_KILL_SWITCH: process.env.SCRAPING_KILL_SWITCH,
    MIN_QUALITY_THRESHOLD: process.env.MIN_QUALITY_THRESHOLD,
    WARNING_QUALITY_THRESHOLD: process.env.WARNING_QUALITY_THRESHOLD,
    QUALITY_CHECK_HOURS: process.env.QUALITY_CHECK_HOURS,
    MAX_JOBS_PER_SITE: process.env.MAX_JOBS_PER_SITE,
    MAX_JOBS_PER_USER_PER_SITE: process.env.MAX_JOBS_PER_USER_PER_SITE,
    MAX_USERS_PER_BATCH: process.env.MAX_USERS_PER_BATCH,
    MAX_ERRORS_BEFORE_STOP: process.env.MAX_ERRORS_BEFORE_STOP,
    DELAY_BETWEEN_SITES: process.env.DELAY_BETWEEN_SITES,
    DELAY_BETWEEN_QUERIES: process.env.DELAY_BETWEEN_QUERIES,
    DELAY_BETWEEN_BATCHES: process.env.DELAY_BETWEEN_BATCHES,
    DUPLICATE_THRESHOLD: process.env.DUPLICATE_THRESHOLD,
    DEDUPLICATION_WINDOW_HOURS: process.env.DEDUPLICATION_WINDOW_HOURS,
    INDEED_ENABLED: process.env.INDEED_ENABLED,
    AARP_ENABLED: process.env.AARP_ENABLED,
    USAJOBS_ENABLED: process.env.USAJOBS_ENABLED
  },
  parsedConfig: {
    globalKillSwitch: envConfig.globalKillSwitch,
    minQualityThreshold: envConfig.minQualityThreshold,
    warningQualityThreshold: envConfig.warningQualityThreshold,
    qualityCheckHours: envConfig.qualityCheckHours,
    maxJobsPerSite: envConfig.maxJobsPerSite,
    maxJobsPerUserPerSite: envConfig.maxJobsPerUserPerSite,
    maxUsersPerBatch: envConfig.maxUsersPerBatch,
    maxErrorsBeforeStop: envConfig.maxErrorsBeforeStop,
    sitesEnabled: envConfig.sitesEnabled
  }
});

export const operationalControls = new OperationalControls(envConfig);
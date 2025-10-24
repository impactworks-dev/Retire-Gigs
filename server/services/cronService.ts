import * as cron from 'node-cron';
import { ApifyService } from './apifyService';
import { storage } from '../storage';
import { logger } from '../logger';

export class CronService {
  private apifyService: ApifyService;
  private isRunning: boolean = false;

  constructor() {
    this.apifyService = new ApifyService();
  }

  /**
   * Start the cron job service
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Cron service is already running');
      return;
    }

    logger.info('Starting cron service for automatic job scraping');

    // Schedule job scraping every day  9 AM
    cron.schedule('0 9 * * *', async () => {
      await this.scrapeJobs();
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Also run once immediately on startup
    setTimeout(() => {
      this.scrapeJobs();
    }, 5000); // Wait 5 seconds after startup

    this.isRunning = true;
    logger.info('Cron service started successfully - jobs will be scraped every 3 minutes');
  }

  /**
   * Stop the cron job service
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn('Cron service is not running');
      return;
    }

    cron.destroy();
    this.isRunning = false;
    logger.info('Cron service stopped');
  }

  /**
   * Execute job scraping
   */
  private async scrapeJobs(): Promise<void> {
    try {
      logger.info('Starting scheduled job scraping', {
        operation: 'cron_scrape_jobs',
        timestamp: new Date().toISOString()
      });

      // Check if Apify service is available
      if (!this.apifyService.isServiceAvailable()) {
        logger.warn('Apify service not available, skipping scheduled scraping');
        return;
      }

      // Age-friendly job search queries targeting 55+ demographic
      const searchQueries = [
        // Core flexible work arrangements
        { query: 'part-time remote work', location: 'New York', count: 5 },
        { query: 'flexible schedule work from home', location: 'New York', count: 5 },
        { query: 'contract work remote', location: 'New York', count: 3 },
        { query: 'seasonal work flexible hours', location: 'New York', count: 3 },
        
        // Age-friendly professional roles
        { query: 'customer service remote part-time', location: 'New York', count: 4 },
        { query: 'administrative assistant flexible schedule', location: 'New York', count: 4 },
        { query: 'data entry work from home', location: 'New York', count: 3 },
        { query: 'virtual assistant remote', location: 'New York', count: 3 },
        
        // Consulting and expertise roles
        { query: 'consultant part-time remote', location: 'New York', count: 3 },
        { query: 'tutor online flexible hours', location: 'New York', count: 3 },
        { query: 'advisor consultant remote', location: 'New York', count: 2 },
        
        // Local community roles
        { query: 'local jobs part-time flexible', location: 'New York', count: 4 },
        { query: 'library aide community work', location: 'New York', count: 2 },
        { query: 'school support flexible hours', location: 'New York', count: 2 },
        
        // Experience-based roles
        { query: 'senior-friendly jobs remote', location: 'New York', count: 3 },
        { query: 'mature workers welcome', location: 'New York', count: 3 },
        { query: 'retirement jobs flexible', location: 'New York', count: 2 },
      ];

      let totalScraped = 0;
      let totalSaved = 0;

      // Scrape jobs for each query
      for (const searchParams of searchQueries) {
        try {
          logger.info('Scraping jobs for query', {
            operation: 'cron_scrape_query',
            query: searchParams.query,
            location: searchParams.location,
            count: searchParams.count
          });

          const jobs = await this.apifyService.scrapeJobs(
            searchParams.query,
            searchParams.location,
            searchParams.count
          );

          if (jobs && jobs.length > 0) {
            // Save jobs to database with delay to prevent connection overload
            for (const job of jobs) {
              try {
                await storage.createJobOpportunity(job);
                totalSaved++;
                
                // Small delay between saves to prevent database connection overload
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (saveError: any) {
                // Skip duplicate jobs (ignore unique constraint errors)
                if (!saveError.message?.includes('unique constraint') && 
                    !saveError.message?.includes('duplicate key') &&
                    !saveError.message?.includes('already exists')) {
                  logger.error('Failed to save job', {
                    operation: 'cron_save_job',
                    error: saveError.message || String(saveError),
                    jobTitle: job.title,
                    stack: saveError.stack
                  });
                }
              }
            }
            totalScraped += jobs.length;
          }

          // Add delay between queries to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (queryError: any) {
          logger.error('Failed to scrape jobs for query', {
            operation: 'cron_scrape_query_error',
            query: searchParams.query,
            error: queryError.message
          });
        }
      }

      logger.info('Scheduled job scraping completed', {
        operation: 'cron_scrape_complete',
        totalScraped,
        totalSaved,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Scheduled job scraping failed', {
        operation: 'cron_scrape_error',
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Get cron service status
   */
  public getStatus(): { isRunning: boolean; nextRun?: string } {
    return {
      isRunning: this.isRunning,
      nextRun: this.isRunning ? 'Every 3 minutes' : undefined
    };
  }

  /**
   * Manually trigger job scraping (for testing)
   */
  public async triggerScraping(): Promise<{ success: boolean; message: string }> {
    try {
      await this.scrapeJobs();
      return {
        success: true,
        message: 'Manual job scraping completed successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Manual job scraping failed: ${error.message}`
      };
    }
  }
}

// Export singleton instance
export const cronService = new CronService();

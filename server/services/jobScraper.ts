import { firecrawlService, type JobScrapingOptions, type ScrapedJobData } from './firecrawl';
import { storage } from '../storage';
import { logger } from '../logger';
import type { User, UserPreferences, InsertJobOpportunity, JobOpportunity } from '@shared/schema';
import { randomUUID } from 'crypto';

interface UserWithPreferences {
  user: User;
  preferences: UserPreferences | null;
  hasCompletedPreferences: boolean;
}

interface JobScrapingResult {
  userId: string;
  scrapedCount: number;
  savedCount: number;
  skippedCount: number;
  errors: string[];
}

interface JobScrapingSession {
  sessionId: string;
  startTime: Date;
  totalUsers: number;
  processedUsers: number;
  totalJobsScraped: number;
  totalJobsSaved: number;
  totalJobsSkipped: number;
  errors: string[];
}

// Configuration constants
const SCRAPING_CONFIG = {
  MAX_JOBS_PER_USER: 10,
  MAX_JOBS_PER_SITE: 5,
  BATCH_SIZE: 5, // Process users in batches
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 2000,
  JOB_SIMILARITY_THRESHOLD: 0.8, // For deduplication
};

// Job sites to scrape from
const JOB_SITES = ['indeed', 'aarp', 'usajobs'] as const;
type JobSite = typeof JOB_SITES[number];

export class JobScraperService {
  private currentSession: JobScrapingSession | null = null;

  /**
   * Main orchestration method - scrape jobs for all users with preferences
   */
  async scrapeJobsForAllUsers(): Promise<JobScrapingSession> {
    const sessionId = randomUUID();
    const startTime = new Date();
    
    this.currentSession = {
      sessionId,
      startTime,
      totalUsers: 0,
      processedUsers: 0,
      totalJobsScraped: 0,
      totalJobsSaved: 0,
      totalJobsSkipped: 0,
      errors: []
    };

    logger.info('Starting job scraping session for all users', {
      operation: 'scrapeJobsForAllUsers',
      sessionId
    });

    try {
      // Check if Firecrawl service is configured
      if (!firecrawlService.isConfigured()) {
        const error = 'Firecrawl service not configured - cannot scrape jobs';
        logger.error(error);
        this.currentSession.errors.push(error);
        return this.currentSession;
      }

      // Fetch users with preferences who want notifications
      const usersWithPrefs = await this.fetchUsersForJobScraping();
      this.currentSession.totalUsers = usersWithPrefs.length;

      logger.info(`Found ${usersWithPrefs.length} users eligible for job scraping`, {
        operation: 'scrapeJobsForAllUsers',
        sessionId,
        eligibleUsers: usersWithPrefs.length
      });

      if (usersWithPrefs.length === 0) {
        logger.info('No users found who need job scraping');
        return this.currentSession;
      }

      // Process users in batches to avoid overwhelming the system
      for (let i = 0; i < usersWithPrefs.length; i += SCRAPING_CONFIG.BATCH_SIZE) {
        const batch = usersWithPrefs.slice(i, i + SCRAPING_CONFIG.BATCH_SIZE);
        
        logger.info(`Processing batch ${Math.floor(i / SCRAPING_CONFIG.BATCH_SIZE) + 1}`, {
          operation: 'scrapeJobsForAllUsers',
          sessionId,
          batchSize: batch.length,
          batchStart: i
        });

        // Process batch users concurrently
        const batchPromises = batch.map(userWithPrefs => 
          this.scrapeJobsForUser(userWithPrefs.user.id)
            .catch(error => {
              logger.error('Error processing user in batch', error, {
                operation: 'scrapeJobsForAllUsers',
                sessionId,
                userId: userWithPrefs.user.id
              });
              return { userId: userWithPrefs.user.id, scrapedCount: 0, savedCount: 0, skippedCount: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
            })
        );

        const batchResults = await Promise.all(batchPromises);
        
        // Aggregate batch results
        for (const result of batchResults) {
          this.currentSession.processedUsers++;
          this.currentSession.totalJobsScraped += result.scrapedCount;
          this.currentSession.totalJobsSaved += result.savedCount;
          this.currentSession.totalJobsSkipped += result.skippedCount;
          this.currentSession.errors.push(...result.errors);
        }

        // Add delay between batches to be respectful to external APIs
        if (i + SCRAPING_CONFIG.BATCH_SIZE < usersWithPrefs.length) {
          await this.delay(1000);
        }
      }

      const duration = Date.now() - startTime.getTime();
      logger.info('Job scraping session completed', {
        operation: 'scrapeJobsForAllUsers',
        sessionId,
        durationMs: duration,
        totalUsers: this.currentSession.totalUsers,
        processedUsers: this.currentSession.processedUsers,
        totalJobsScraped: this.currentSession.totalJobsScraped,
        totalJobsSaved: this.currentSession.totalJobsSaved,
        totalJobsSkipped: this.currentSession.totalJobsSkipped,
        errorCount: this.currentSession.errors.length
      });

      return this.currentSession;

    } catch (error) {
      logger.error('Fatal error in job scraping session', error, {
        operation: 'scrapeJobsForAllUsers',
        sessionId
      });
      this.currentSession.errors.push(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.currentSession;
    }
  }

  /**
   * Scrape jobs for a specific user based on their preferences
   */
  async scrapeJobsForUser(userId: string): Promise<JobScrapingResult> {
    const result: JobScrapingResult = {
      userId,
      scrapedCount: 0,
      savedCount: 0,
      skippedCount: 0,
      errors: [] as string[]
    };

    try {
      logger.info('Starting job scraping for user', {
        operation: 'scrapeJobsForUser',
        userId
      });

      // Get user and their preferences
      const user = await storage.getUser(userId);
      const preferences = await storage.getUserPreferences(userId);

      if (!user) {
        const error = `User not found: ${userId}`;
        result.errors.push(error);
        logger.error(error, null, { operation: 'scrapeJobsForUser', userId });
        return result;
      }

      if (!preferences) {
        const error = `User preferences not found: ${userId}`;
        result.errors.push(error);
        logger.error(error, null, { operation: 'scrapeJobsForUser', userId });
        return result;
      }

      // Check if user wants notifications
      if (!preferences.notificationsEnabled) {
        logger.info('User has notifications disabled, skipping job scraping', {
          operation: 'scrapeJobsForUser',
          userId
        });
        return result;
      }

      // Build search queries based on user preferences
      const searchQueries = this.buildSearchQueries(preferences, user);
      logger.info('Built search queries for user', {
        operation: 'scrapeJobsForUser',
        userId,
        queryCount: searchQueries.length
      });

      // Scrape jobs from all configured job sites
      const allScrapedJobs: ScrapedJobData[] = [];

      for (const query of searchQueries) {
        for (const site of JOB_SITES) {
          try {
            const jobs = await this.scrapeJobsFromSite(site, query);
            allScrapedJobs.push(...jobs);
            result.scrapedCount += jobs.length;

            logger.info(`Scraped jobs from ${site} for user`, {
              operation: 'scrapeJobsForUser',
              userId,
              site,
              jobCount: jobs.length,
              query: JSON.stringify(query)
            });

            // Add delay between API calls
            await this.delay(500);
          } catch (error) {
            const errorMsg = `Failed to scrape from ${site}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            result.errors.push(errorMsg);
            logger.error(errorMsg, error, {
              operation: 'scrapeJobsForUser',
              userId,
              site
            });
          }
        }
      }

      // Process and save scraped jobs
      const processingResult = await this.processAndSaveJobs(allScrapedJobs, userId, preferences);
      result.savedCount = processingResult.savedCount;
      result.skippedCount = processingResult.skippedCount;
      result.errors.push(...processingResult.errors);

      logger.info('Completed job scraping for user', {
        operation: 'scrapeJobsForUser',
        userId,
        scrapedCount: result.scrapedCount,
        savedCount: result.savedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errors.length
      });

      return result;

    } catch (error) {
      const errorMsg = `Fatal error scraping jobs for user: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg, error, {
        operation: 'scrapeJobsForUser',
        userId
      });
      return result;
    }
  }

  /**
   * Process scraped jobs and save them to storage with deduplication
   */
  async processAndSaveJobs(
    scrapedJobs: ScrapedJobData[],
    userId: string,
    preferences: UserPreferences
  ): Promise<{ savedCount: number; skippedCount: number; errors: string[] }> {
    const result = { savedCount: 0, skippedCount: 0, errors: [] as string[] };

    try {
      if (scrapedJobs.length === 0) {
        logger.info('No jobs to process', {
          operation: 'processAndSaveJobs',
          userId
        });
        return result;
      }

      // Get existing jobs for deduplication
      const existingJobs = await storage.getJobOpportunities();
      
      // Filter and deduplicate jobs
      const filteredJobs = this.filterAndDeduplicateJobs(scrapedJobs, existingJobs, preferences);
      
      logger.info('Filtered and deduplicated jobs', {
        operation: 'processAndSaveJobs',
        userId,
        originalCount: scrapedJobs.length,
        filteredCount: filteredJobs.length
      });

      // Limit jobs per user to prevent overwhelming them
      const jobsToSave = filteredJobs.slice(0, SCRAPING_CONFIG.MAX_JOBS_PER_USER);
      result.skippedCount = filteredJobs.length - jobsToSave.length;

      // Save each job
      for (const scrapedJob of jobsToSave) {
        try {
          const jobOpportunity = this.convertScrapedJobToJobOpportunity(scrapedJob, preferences);
          await storage.createJobOpportunity(jobOpportunity);
          result.savedCount++;

          logger.debug('Saved job opportunity', {
            operation: 'processAndSaveJobs',
            userId,
            jobTitle: jobOpportunity.title,
            jobCompany: jobOpportunity.company
          });

        } catch (error) {
          const errorMsg = `Failed to save job "${scrapedJob.title}": ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, error, {
            operation: 'processAndSaveJobs',
            userId,
            jobTitle: scrapedJob.title
          });
        }
      }

      logger.info('Completed processing jobs for user', {
        operation: 'processAndSaveJobs',
        userId,
        savedCount: result.savedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errors.length
      });

      return result;

    } catch (error) {
      const errorMsg = `Fatal error processing jobs: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg, error, {
        operation: 'processAndSaveJobs',
        userId
      });
      return result;
    }
  }

  /**
   * Build search queries based on user preferences
   */
  private buildSearchQueries(preferences: UserPreferences, user: User): JobScrapingOptions[] {
    const queries: JobScrapingOptions[] = [];

    // Get preferred job types
    const preferredJobTypes = Array.isArray(preferences.preferredJobTypes) 
      ? preferences.preferredJobTypes 
      : [];

    // Get preferred locations
    const preferredLocations = Array.isArray(preferences.preferredLocations) 
      ? preferences.preferredLocations 
      : [];

    // Map our job types to search terms
    const jobTypeMapping: Record<string, string[]> = {
      'hands-on': ['maintenance', 'repair', 'construction', 'crafts'],
      'outdoor': ['gardening', 'landscaping', 'outdoor', 'nature'],
      'creative': ['arts', 'crafts', 'design', 'creative'],
      'helping': ['customer service', 'support', 'assistance', 'tutor'],
      'social': ['community', 'events', 'social work', 'volunteer'],
      'quiet': ['data entry', 'reading', 'library', 'bookkeeping'],
      'tech': ['computer', 'technology', 'IT', 'software'],
      'professional': ['office', 'administrative', 'professional', 'management']
    };

    // Build location string for search
    let locationQuery = '';
    if (preferredLocations.includes('closetohome') && user.city && user.state) {
      locationQuery = `${user.city}, ${user.state}`;
    } else if (preferredLocations.includes('remote')) {
      locationQuery = 'remote';
    }

    // Create search queries for each preferred job type
    for (const jobType of preferredJobTypes) {
      const searchTerms = jobTypeMapping[jobType] || [jobType];
      
      for (const searchTerm of searchTerms) {
        queries.push({
          jobType: searchTerm,
          location: locationQuery,
          remote: preferredLocations.includes('remote'),
          partTime: preferences.schedulePreference !== 'daily', // Assume non-daily preference indicates part-time preference
          maxResults: SCRAPING_CONFIG.MAX_JOBS_PER_SITE
        });
      }
    }

    // If no specific preferences, create a general query
    if (queries.length === 0) {
      queries.push({
        jobType: 'part time',
        location: locationQuery,
        remote: false,
        partTime: true,
        maxResults: SCRAPING_CONFIG.MAX_JOBS_PER_SITE
      });
    }

    return queries;
  }

  /**
   * Scrape jobs from a specific site
   */
  private async scrapeJobsFromSite(site: JobSite, options: JobScrapingOptions): Promise<ScrapedJobData[]> {
    let retryCount = 0;
    
    while (retryCount < SCRAPING_CONFIG.RETRY_ATTEMPTS) {
      try {
        switch (site) {
          case 'indeed':
            return await firecrawlService.scrapeIndeedJobs(options);
          case 'aarp':
            return await firecrawlService.scrapeAARPJobs(options);
          case 'usajobs':
            return await firecrawlService.scrapeUSAJobs(options);
          default:
            throw new Error(`Unknown job site: ${site}`);
        }
      } catch (error) {
        retryCount++;
        if (retryCount >= SCRAPING_CONFIG.RETRY_ATTEMPTS) {
          throw error;
        }
        
        logger.warn(`Retry ${retryCount} for ${site} scraping`, {
          operation: 'scrapeJobsFromSite',
          site,
          retryCount,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        await this.delay(SCRAPING_CONFIG.RETRY_DELAY_MS * retryCount);
      }
    }
    
    return [];
  }

  /**
   * Filter and deduplicate jobs against existing jobs
   */
  private filterAndDeduplicateJobs(
    scrapedJobs: ScrapedJobData[],
    existingJobs: JobOpportunity[],
    preferences: UserPreferences
  ): ScrapedJobData[] {
    const filtered: ScrapedJobData[] = [];

    for (const scrapedJob of scrapedJobs) {
      // Basic validation
      if (!this.isValidScrapedJob(scrapedJob)) {
        continue;
      }

      // Check for duplicates against existing jobs
      const isDuplicate = existingJobs.some(existingJob => 
        this.calculateJobSimilarity(scrapedJob, existingJob) > SCRAPING_CONFIG.JOB_SIMILARITY_THRESHOLD
      );

      if (isDuplicate) {
        continue;
      }

      // Check for duplicates within the current batch
      const isDuplicateInBatch = filtered.some(filteredJob => 
        this.calculateJobSimilarity(scrapedJob, filteredJob) > SCRAPING_CONFIG.JOB_SIMILARITY_THRESHOLD
      );

      if (isDuplicateInBatch) {
        continue;
      }

      filtered.push(scrapedJob);
    }

    return filtered;
  }

  /**
   * Validate scraped job data
   */
  private isValidScrapedJob(job: ScrapedJobData): boolean {
    return !!(
      job.title && 
      job.company && 
      job.description && 
      job.title.length > 3 && 
      job.company.length > 1 && 
      job.description.length > 10
    );
  }

  /**
   * Calculate similarity between two jobs for deduplication
   */
  private calculateJobSimilarity(job1: ScrapedJobData | JobOpportunity, job2: ScrapedJobData | JobOpportunity): number {
    // Simple similarity calculation based on title and company
    const title1 = job1.title.toLowerCase().trim();
    const title2 = job2.title.toLowerCase().trim();
    const company1 = job1.company.toLowerCase().trim();
    const company2 = job2.company.toLowerCase().trim();

    // Exact match
    if (title1 === title2 && company1 === company2) {
      return 1.0;
    }

    // Company match with similar title
    if (company1 === company2) {
      const titleSimilarity = this.calculateStringSimilarity(title1, title2);
      return titleSimilarity > 0.8 ? 0.9 : titleSimilarity * 0.7;
    }

    // Similar title with different company
    const titleSimilarity = this.calculateStringSimilarity(title1, title2);
    if (titleSimilarity > 0.9) {
      return titleSimilarity * 0.6;
    }

    return 0;
  }

  /**
   * Calculate string similarity using a simple algorithm
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Convert scraped job data to job opportunity format
   */
  private convertScrapedJobToJobOpportunity(scrapedJob: ScrapedJobData, preferences: UserPreferences): InsertJobOpportunity {
    // Generate tags based on job content and user preferences
    const tags = this.generateJobTags(scrapedJob, preferences);
    
    // Calculate match score based on how well the job aligns with preferences
    const matchScore = this.calculateMatchScore(scrapedJob, preferences);
    
    // Format time ago
    const timeAgo = this.formatTimeAgo(scrapedJob.datePosted);

    return {
      title: scrapedJob.title.trim(),
      company: scrapedJob.company.trim(),
      location: scrapedJob.location || 'Location not specified',
      pay: scrapedJob.pay || 'Salary not specified',
      schedule: scrapedJob.schedule || 'Schedule not specified',
      description: scrapedJob.description.trim(),
      tags,
      matchScore,
      timeAgo,
      isActive: true
    };
  }

  /**
   * Generate job tags based on content analysis and user preferences
   */
  private generateJobTags(scrapedJob: ScrapedJobData, preferences: UserPreferences): string[] {
    const tags: string[] = [];
    const jobText = `${scrapedJob.title} ${scrapedJob.description}`.toLowerCase();

    // Map keywords to tags
    const keywordMap: Record<string, string[]> = {
      'outdoor': ['outdoor', 'outside', 'garden', 'landscaping', 'nature', 'park'],
      'hands-on': ['hands-on', 'manual', 'craft', 'build', 'repair', 'maintenance'],
      'creative': ['creative', 'art', 'design', 'writing', 'artistic', 'craft'],
      'helping': ['help', 'assist', 'support', 'care', 'service', 'volunteer'],
      'social': ['social', 'community', 'team', 'people', 'group', 'network'],
      'quiet': ['quiet', 'independent', 'solo', 'individual', 'peaceful', 'calm'],
      'tech': ['computer', 'technology', 'software', 'digital', 'IT', 'technical'],
      'professional': ['professional', 'office', 'business', 'corporate', 'admin']
    };

    // Check for keyword matches
    for (const [tag, keywords] of Object.entries(keywordMap)) {
      if (keywords.some(keyword => jobText.includes(keyword))) {
        tags.push(tag);
      }
    }

    // Add tags based on user preferences that might be relevant
    const preferredJobTypes = Array.isArray(preferences.preferredJobTypes) 
      ? preferences.preferredJobTypes 
      : [];

    for (const preferredType of preferredJobTypes) {
      if (!tags.includes(preferredType)) {
        // Add preferred types if they seem relevant to the job
        const typeKeywords = keywordMap[preferredType] || [];
        if (typeKeywords.some(keyword => jobText.includes(keyword))) {
          tags.push(preferredType);
        }
      }
    }

    // Ensure at least one tag
    if (tags.length === 0) {
      tags.push('professional');
    }

    return Array.from(new Set(tags)); // Remove duplicates
  }

  /**
   * Calculate match score based on alignment with user preferences
   */
  private calculateMatchScore(scrapedJob: ScrapedJobData, preferences: UserPreferences): string {
    let score = 0;
    let maxScore = 0;

    // Job type matching (weight: 40%)
    const preferredJobTypes = Array.isArray(preferences.preferredJobTypes) 
      ? preferences.preferredJobTypes 
      : [];
    
    if (preferredJobTypes.length > 0) {
      maxScore += 40;
      const jobText = `${scrapedJob.title} ${scrapedJob.description}`.toLowerCase();
      
      for (const jobType of preferredJobTypes) {
        // Simple keyword matching for job types
        const keywords = this.getKeywordsForJobType(jobType);
        if (keywords.some(keyword => jobText.includes(keyword))) {
          score += 40 / preferredJobTypes.length;
        }
      }
    }

    // Location matching (weight: 30%)
    const preferredLocations = Array.isArray(preferences.preferredLocations) 
      ? preferences.preferredLocations 
      : [];
    
    if (preferredLocations.length > 0) {
      maxScore += 30;
      const locationText = scrapedJob.location?.toLowerCase() || '';
      
      if (preferredLocations.includes('remote') && locationText.includes('remote')) {
        score += 30;
      } else if (preferredLocations.includes('closetohome') && 
                 (locationText.includes('local') || locationText.includes('nearby'))) {
        score += 30;
      } else if (preferredLocations.includes('anywhere')) {
        score += 15; // Partial score for flexible location
      }
    }

    // Schedule matching (weight: 30%)
    if (preferences.schedulePreference) {
      maxScore += 30;
      const scheduleText = scrapedJob.schedule?.toLowerCase() || '';
      
      if (preferences.schedulePreference === 'daily' && scheduleText.includes('full-time')) {
        score += 30;
      } else if (preferences.schedulePreference !== 'daily' && 
                 (scheduleText.includes('part-time') || scheduleText.includes('flexible'))) {
        score += 30;
      }
    }

    // Convert to categorical score
    if (maxScore === 0) return 'potential';
    
    const percentage = (score / maxScore) * 100;
    
    if (percentage >= 75) return 'great';
    if (percentage >= 50) return 'good';
    return 'potential';
  }

  /**
   * Get keywords for job type matching
   */
  private getKeywordsForJobType(jobType: string): string[] {
    const keywordMap: Record<string, string[]> = {
      'hands-on': ['hands-on', 'manual', 'craft', 'build', 'repair', 'maintenance', 'construction'],
      'outdoor': ['outdoor', 'outside', 'garden', 'landscaping', 'nature', 'park', 'environmental'],
      'creative': ['creative', 'art', 'design', 'writing', 'artistic', 'craft', 'marketing'],
      'helping': ['help', 'assist', 'support', 'care', 'service', 'volunteer', 'teaching'],
      'social': ['social', 'community', 'team', 'people', 'group', 'network', 'events'],
      'quiet': ['quiet', 'independent', 'solo', 'individual', 'data entry', 'research'],
      'tech': ['computer', 'technology', 'software', 'digital', 'IT', 'technical'],
      'professional': ['professional', 'office', 'business', 'corporate', 'admin', 'management']
    };

    return keywordMap[jobType] || [jobType];
  }

  /**
   * Format time ago string
   */
  private formatTimeAgo(datePosted?: string): string {
    if (!datePosted) {
      return 'Recently posted';
    }

    try {
      const postedDate = new Date(datePosted);
      const now = new Date();
      const diffMs = now.getTime() - postedDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return '1 day ago';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return `${Math.floor(diffDays / 30)} months ago`;
    } catch {
      return 'Recently posted';
    }
  }

  /**
   * Fetch users who need job scraping based on their preferences
   */
  private async fetchUsersForJobScraping(): Promise<UserWithPreferences[]> {
    try {
      // This mimics the admin endpoint logic for fetching users with preferences
      const { users: usersWithPrefs } = await storage.getUsersWithPreferences(0, 1000);
      
      // Filter for users who want notifications and have completed preferences
      return usersWithPrefs
        .filter(({ preferences }) => preferences?.notificationsEnabled === true)
        .map(({ user, preferences }) => ({
          user,
          preferences,
          hasCompletedPreferences: !!preferences
        }));
    } catch (error) {
      logger.error('Error fetching users for job scraping', error, {
        operation: 'fetchUsersForJobScraping'
      });
      throw error;
    }
  }

  /**
   * Utility method to add delays between operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current session status
   */
  getCurrentSession(): JobScrapingSession | null {
    return this.currentSession;
  }

  /**
   * Check if Firecrawl service is available
   */
  isServiceAvailable(): boolean {
    return firecrawlService.isConfigured();
  }

  /**
   * Test the complete job scraping pipeline for a single user (useful for debugging)
   */
  async testJobScrapingForUser(userId: string): Promise<JobScrapingResult> {
    logger.info('Testing job scraping pipeline for user', {
      operation: 'testJobScrapingForUser',
      userId
    });

    try {
      // Test Firecrawl connection first
      const connectionTest = await firecrawlService.testConnection();
      if (!connectionTest) {
        throw new Error('Firecrawl service connection test failed');
      }

      // Run the normal scraping process
      const result = await this.scrapeJobsForUser(userId);

      logger.info('Job scraping test completed', {
        operation: 'testJobScrapingForUser',
        userId,
        result
      });

      return result;
    } catch (error) {
      logger.error('Job scraping test failed', error, {
        operation: 'testJobScrapingForUser',
        userId
      });
      
      return {
        userId,
        scrapedCount: 0,
        savedCount: 0,
        skippedCount: 0,
        errors: [`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
}

// Export singleton instance
export const jobScraperService = new JobScraperService();
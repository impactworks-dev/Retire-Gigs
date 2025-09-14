import FirecrawlApp from '@mendable/firecrawl-js';
import type { InsertJobOpportunity, JobOpportunity } from '@shared/schema';
import { logger } from '../logger';

// Use the official types from @mendable/firecrawl-js
// No need for custom FirecrawlResponse interface

export interface ScrapedJobData {
  title: string;
  company: string;
  location: string;
  pay?: string;
  schedule?: string;
  description: string;
  url?: string;
  datePosted?: string;
}

export interface JobScrapingOptions {
  location?: string;
  jobType?: string;
  remote?: boolean;
  partTime?: boolean;
  maxResults?: number;
}

export class FirecrawlService {
  private firecrawl: FirecrawlApp | null = null;
  private readonly baseUrl = 'https://api.firecrawl.dev';

  constructor() {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    
    if (apiKey) {
      try {
        this.firecrawl = new FirecrawlApp({ apiKey });
        logger.info('Firecrawl service initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Firecrawl service', error);
        this.firecrawl = null;
      }
    } else {
      logger.warn('FIRECRAWL_API_KEY not configured - job scraping will be disabled');
    }
  }

  /**
   * Test the Firecrawl API connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.firecrawl) {
      logger.error('Firecrawl service not configured');
      return false;
    }

    try {
      // Test with a simple URL scrape
      const testUrl = 'https://httpbin.org/status/200';
      const response = await this.firecrawl.scrapeUrl(testUrl);
      
      if (response.success) {
        logger.info('Firecrawl API connection test successful');
        return true;
      } else {
        logger.error('Firecrawl API connection test failed', { error: response.error });
        return false;
      }
    } catch (error) {
      logger.error('Error testing Firecrawl API connection', error);
      return false;
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.firecrawl !== null;
  }

  /**
   * Scrape jobs from Indeed based on search criteria
   */
  async scrapeIndeedJobs(options: JobScrapingOptions = {}): Promise<ScrapedJobData[]> {
    if (!this.firecrawl) {
      logger.error('Firecrawl service not configured');
      return [];
    }

    const { location = '', jobType = '', remote = false, partTime = false, maxResults = 20 } = options;

    try {
      // Build Indeed search URL
      const baseUrl = 'https://www.indeed.com/jobs';
      const params = new URLSearchParams();
      
      if (jobType) params.append('q', jobType);
      if (location && !remote) params.append('l', location);
      if (remote) params.append('remotejob', '032b3046-06a3-4876-8dfd-474eb5e7ed11'); // Indeed's remote job filter
      if (partTime) params.append('jt', 'parttime');
      
      const searchUrl = `${baseUrl}?${params.toString()}`;
      
      logger.info('Scraping Indeed jobs', { 
        url: searchUrl, 
        location, 
        jobType, 
        remote, 
        partTime,
        operation: 'scrapeIndeedJobs'
      });

      const response = await this.firecrawl.scrapeUrl(searchUrl, {
        formats: ['markdown', 'html'],
        onlyMainContent: true
      });

      if (!response.success) {
        logger.error('Failed to scrape Indeed jobs', { error: response.error });
        return [];
      }

      // Debug logging to verify response structure
      logger.info('Firecrawl response structure', {
        hasMarkdown: !!response.markdown,
        hasHtml: !!response.html,
        responseKeys: Object.keys(response)
      });

      const markdown = response.markdown || '';
      const html = response.html;
      
      if (!markdown && !html) {
        logger.warn('No content found in Firecrawl response for Indeed jobs', { url: searchUrl });
        return [];
      }

      const jobs = this.parseIndeedJobs(markdown, html);
      logger.info(`Successfully scraped ${jobs.length} jobs from Indeed`);
      
      return jobs.slice(0, maxResults);
    } catch (error) {
      logger.error('Error scraping Indeed jobs', error, { location, jobType });
      return [];
    }
  }

  /**
   * Scrape jobs from AARP job board
   */
  async scrapeAARPJobs(options: JobScrapingOptions = {}): Promise<ScrapedJobData[]> {
    if (!this.firecrawl) {
      logger.error('Firecrawl service not configured');
      return [];
    }

    const { location = '', jobType = '', maxResults = 20 } = options;

    try {
      // AARP job board URL with search parameters
      const baseUrl = 'https://jobs.aarp.org/jobs/search';
      const params = new URLSearchParams();
      
      if (jobType) params.append('keywords', jobType);
      if (location) params.append('location', location);
      params.append('age-friendly', 'true'); // Filter for age-friendly jobs
      
      const searchUrl = `${baseUrl}?${params.toString()}`;
      
      logger.info('Scraping AARP jobs', { 
        url: searchUrl, 
        location, 
        jobType,
        operation: 'scrapeAARPJobs'
      });

      const response = await this.firecrawl.scrapeUrl(searchUrl, {
        formats: ['markdown', 'html'],
        onlyMainContent: true
      });

      if (!response.success) {
        logger.error('Failed to scrape AARP jobs', { error: response.error });
        return [];
      }

      // Debug logging to verify response structure
      logger.info('Firecrawl response structure for AARP', {
        hasMarkdown: !!response.markdown,
        hasHtml: !!response.html
      });

      const markdown = response.markdown || '';
      const html = response.html;
      
      if (!markdown && !html) {
        logger.warn('No content found in Firecrawl response for AARP jobs', { url: searchUrl });
        return [];
      }

      const jobs = this.parseAARPJobs(markdown, html);
      logger.info(`Successfully scraped ${jobs.length} jobs from AARP`);
      
      return jobs.slice(0, maxResults);
    } catch (error) {
      logger.error('Error scraping AARP jobs', error, { location, jobType });
      return [];
    }
  }

  /**
   * Scrape jobs from USAJobs (government jobs)
   */
  async scrapeUSAJobs(options: JobScrapingOptions = {}): Promise<ScrapedJobData[]> {
    if (!this.firecrawl) {
      logger.error('Firecrawl service not configured');
      return [];
    }

    const { location = '', jobType = '', maxResults = 20 } = options;

    try {
      // USAJobs search URL
      const baseUrl = 'https://www.usajobs.gov/Search/Results';
      const params = new URLSearchParams();
      
      if (jobType) params.append('k', jobType);
      if (location) params.append('l', location);
      params.append('p', '1'); // First page
      
      const searchUrl = `${baseUrl}?${params.toString()}`;
      
      logger.info('Scraping USAJobs', { 
        url: searchUrl, 
        location, 
        jobType,
        operation: 'scrapeUSAJobs'
      });

      const response = await this.firecrawl.scrapeUrl(searchUrl, {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000 // USAJobs might need more time to load
      });

      if (!response.success) {
        logger.error('Failed to scrape USAJobs', { error: response.error });
        return [];
      }

      // Debug logging to verify response structure
      logger.info('Firecrawl response structure for USAJobs', {
        hasMarkdown: !!response.markdown,
        hasHtml: !!response.html
      });

      const markdown = response.markdown || '';
      const html = response.html;
      
      if (!markdown && !html) {
        logger.warn('No content found in Firecrawl response for USAJobs', { url: searchUrl });
        return [];
      }

      const jobs = this.parseUSAJobs(markdown, html);
      logger.info(`Successfully scraped ${jobs.length} jobs from USAJobs`);
      
      return jobs.slice(0, maxResults);
    } catch (error) {
      logger.error('Error scraping USAJobs', error, { location, jobType });
      return [];
    }
  }

  /**
   * Parse Indeed job listings from markdown content
   */
  private parseIndeedJobs(markdown: string, html?: string): ScrapedJobData[] {
    const jobs: ScrapedJobData[] = [];
    
    try {
      // Indeed job listings pattern matching
      // Look for job titles, companies, and other details in the markdown
      const lines = markdown.split('\n');
      let currentJob: Partial<ScrapedJobData> = {};
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (!line) continue;
        
        // Look for job titles (often in headers or bold)
        if (line.includes('##') || line.includes('**')) {
          // If we have a current job, save it
          if (currentJob.title && currentJob.company) {
            jobs.push(this.normalizeJobData(currentJob));
            currentJob = {};
          }
          
          // Extract title
          const titleMatch = line.match(/#+\s*(.+)|^\*\*(.+)\*\*$/);
          if (titleMatch) {
            currentJob.title = (titleMatch[1] || titleMatch[2] || '').trim();
          }
        }
        
        // Look for company names (usually follow titles)
        if (currentJob.title && !currentJob.company) {
          // Company names are often on the next line after title
          const companyMatch = line.match(/^([A-Za-z0-9\s&.,'-]+)$/);
          if (companyMatch && !line.includes('$') && !line.includes('remote')) {
            currentJob.company = (companyMatch[1] || '').trim();
          }
        }
        
        // Look for location information
        if (line.includes('remote') || line.includes('Remote')) {
          currentJob.location = 'Remote';
        } else if (line.match(/[A-Za-z]+,\s*[A-Z]{2}/)) {
          // City, State format
          currentJob.location = line;
        }
        
        // Look for pay information
        if (line.includes('$') || line.includes('hour') || line.includes('salary')) {
          currentJob.pay = line;
        }
        
        // Look for job description snippets
        if (line.length > 50 && !currentJob.description) {
          currentJob.description = line;
        }
      }
      
      // Don't forget the last job
      if (currentJob.title && currentJob.company) {
        jobs.push(this.normalizeJobData(currentJob));
      }
      
    } catch (error) {
      logger.error('Error parsing Indeed jobs', error);
    }
    
    return jobs;
  }

  /**
   * Parse AARP job listings from markdown content
   */
  private parseAARPJobs(markdown: string, html?: string): ScrapedJobData[] {
    const jobs: ScrapedJobData[] = [];
    
    try {
      // Similar parsing logic for AARP jobs
      const lines = markdown.split('\n');
      let currentJob: Partial<ScrapedJobData> = {};
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // AARP-specific parsing patterns
        if (trimmedLine.includes('##') || trimmedLine.includes('**')) {
          if (currentJob.title && currentJob.company) {
            jobs.push(this.normalizeJobData(currentJob));
            currentJob = {};
          }
          
          const titleMatch = trimmedLine.match(/#+\s*(.+)|^\*\*(.+)\*\*$/);
          if (titleMatch) {
            currentJob.title = (titleMatch[1] || titleMatch[2] || '').trim();
          }
        }
        
        // Continue with similar pattern matching...
        // (Implementation would be similar to Indeed parsing)
      }
      
      if (currentJob.title && currentJob.company) {
        jobs.push(this.normalizeJobData(currentJob));
      }
      
    } catch (error) {
      logger.error('Error parsing AARP jobs', error);
    }
    
    return jobs;
  }

  /**
   * Parse USAJobs listings from markdown content
   */
  private parseUSAJobs(markdown: string, html?: string): ScrapedJobData[] {
    const jobs: ScrapedJobData[] = [];
    
    try {
      // USAJobs-specific parsing logic
      const lines = markdown.split('\n');
      let currentJob: Partial<ScrapedJobData> = {};
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Government job parsing patterns
        if (trimmedLine.includes('##') || trimmedLine.includes('**')) {
          if (currentJob.title && currentJob.company) {
            jobs.push(this.normalizeJobData(currentJob));
            currentJob = {};
          }
          
          const titleMatch = trimmedLine.match(/#+\s*(.+)|^\*\*(.+)\*\*$/);
          if (titleMatch) {
            currentJob.title = (titleMatch[1] || titleMatch[2] || '').trim();
            currentJob.company = 'U.S. Government'; // Default for USAJobs
          }
        }
        
        // Look for agency/department information
        if (trimmedLine.includes('Department') || trimmedLine.includes('Agency')) {
          currentJob.company = trimmedLine;
        }
        
        // Government pay grades (GS-XX patterns)
        if (trimmedLine.match(/GS-\d+/)) {
          currentJob.pay = trimmedLine;
        }
      }
      
      if (currentJob.title && currentJob.company) {
        jobs.push(this.normalizeJobData(currentJob));
      }
      
    } catch (error) {
      logger.error('Error parsing USAJobs', error);
    }
    
    return jobs;
  }

  /**
   * Normalize scraped job data to match our schema
   */
  private normalizeJobData(jobData: Partial<ScrapedJobData>): ScrapedJobData {
    return {
      title: jobData.title || 'Untitled Position',
      company: jobData.company || 'Unknown Company',
      location: jobData.location || 'Location not specified',
      pay: jobData.pay || 'Pay not specified',
      schedule: jobData.schedule || 'Schedule not specified',
      description: jobData.description || 'No description available',
      url: jobData.url,
      datePosted: jobData.datePosted || new Date().toISOString().split('T')[0]
    };
  }

  /**
   * Convert scraped job data to our InsertJobOpportunity schema
   */
  convertToJobOpportunity(scrapedJob: ScrapedJobData, additionalTags: string[] = []): InsertJobOpportunity {
    // Generate tags based on job content
    const generatedTags = this.generateJobTags(scrapedJob);
    const allTags = [...generatedTags, ...additionalTags];
    
    return {
      title: scrapedJob.title,
      company: scrapedJob.company,
      location: scrapedJob.location,
      pay: scrapedJob.pay || 'Pay not specified',
      schedule: scrapedJob.schedule || 'Schedule not specified',
      description: scrapedJob.description,
      tags: allTags,
      matchScore: null, // Will be determined by matching algorithm
      timeAgo: this.calculateTimeAgo(scrapedJob.datePosted || new Date().toISOString()),
      isActive: true
    };
  }

  /**
   * Generate relevant tags for a job based on its content
   */
  private generateJobTags(job: ScrapedJobData): string[] {
    const tags: string[] = [];
    const content = `${job.title} ${job.description} ${job.company}`.toLowerCase();
    
    // Tag mapping based on content keywords
    const tagMappings = {
      'outdoor': ['outdoor', 'garden', 'landscape', 'park', 'field'],
      'hands-on': ['hands-on', 'manual', 'craft', 'repair', 'build', 'maintenance'],
      'creative': ['creative', 'design', 'art', 'craft', 'artistic', 'photography'],
      'helping': ['help', 'assist', 'support', 'care', 'service', 'volunteer'],
      'social': ['social', 'people', 'community', 'team', 'group', 'customer'],
      'quiet': ['quiet', 'library', 'office', 'research', 'data', 'administrative'],
      'tech': ['technology', 'computer', 'software', 'digital', 'online', 'tech'],
      'professional': ['professional', 'management', 'consultant', 'executive', 'director']
    };
    
    for (const [tag, keywords] of Object.entries(tagMappings)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        tags.push(tag);
      }
    }
    
    // Special cases
    if (job.location?.toLowerCase().includes('remote')) {
      tags.push('remote');
    }
    
    if (job.schedule?.toLowerCase().includes('part')) {
      tags.push('part-time');
    }
    
    return Array.from(new Set(tags)); // Remove duplicates
  }

  /**
   * Calculate time ago string from date
   */
  private calculateTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return '1 day ago';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 14) {
      return '1 week ago';
    } else if (diffDays < 30) {
      return `${Math.ceil(diffDays / 7)} weeks ago`;
    } else {
      return `${Math.ceil(diffDays / 30)} months ago`;
    }
  }
}

// Export a singleton instance
export const firecrawlService = new FirecrawlService();
import { JSDOM } from 'jsdom';
import { logger } from '../logger';
import { ContentSanitizer, type SanitizedJobData } from './contentSanitizer';

export interface JobParsingResult {
  jobs: SanitizedJobData[];
  parsed: number;
  valid: number;
  invalid: number;
  qualityScore: number;
  errors: string[];
  warnings: string[];
}

export interface RawJobData {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  pay?: string;
  schedule?: string;
  url?: string;
  datePosted?: string;
}

// Site-specific DOM selectors for job sites
const JOB_SITE_SELECTORS = {
  indeed: {
    jobContainer: 'td[id*="job_"], .job_seen_beacon, .jobsearch-SerpJobCard, div[data-jk], .slider_container .slider_item',
    title: 'h2 a span[title], .jobTitle a span, h2.jobTitle a, [data-testid="job-title"] a, .jobTitle-color-purple',
    company: '.companyName, [data-testid="company-name"], .company, span.companyName a',
    location: '[data-testid="job-location"], .companyLocation, .locationsContainer, div[data-testid="job-location"]',
    pay: '.salary-snippet, .estimated-salary, [data-testid="job-salary"], .salaryText',
    schedule: '.jobMetadata .metadata, .jobMetadata, .attribute_snippet',
    description: '.job-snippet, .summary, [data-testid="job-snippet"]',
    excludeContainers: '.pn, #searchCountPages, .np, .slider_container .slider_nav, #resultsCol .jobsearch-NoResult'
  },
  
  aarp: {
    jobContainer: '.job-listing, .job-result, .listing-item, .job-item',
    title: '.job-title a, .listing-title a, h3 a, h2 a',
    company: '.company-name, .employer, .company',
    location: '.location, .job-location, .listing-location',
    pay: '.salary, .pay, .wage',
    schedule: '.job-type, .schedule, .employment-type',
    description: '.job-summary, .job-description, .snippet',
    excludeContainers: '.pagination, .filter, .search-filters, .sidebar'
  },
  
  usajobs: {
    jobContainer: '.usajobs-search-result--core, .job-listing, .search-result',
    title: '.usajobs-search-result--title a, .job-title a, h3 a',
    company: '.usajobs-search-result--agency, .agency, .department',
    location: '.usajobs-search-result--location, .location',
    pay: '.usajobs-search-result--pay, .pay, .salary-range',
    schedule: '.usajobs-search-result--schedule, .schedule',
    description: '.usajobs-search-result--summary, .job-summary',
    excludeContainers: '.usajobs-search-filters, .pagination, .header, .footer'
  },
  
  // Fallback selectors for generic job sites
  generic: {
    jobContainer: '.job, .listing, .position, .vacancy, article, .job-card, .job-item',
    title: 'h1, h2, h3, .title, .job-title, .position-title',
    company: '.company, .employer, .organization',
    location: '.location, .address, .city',
    pay: '.salary, .pay, .wage, .compensation',
    schedule: '.type, .schedule, .hours',
    description: '.description, .summary, .details, p',
    excludeContainers: '.nav, .header, .footer, .sidebar, .pagination, .ad, .advertisement'
  }
};

export class DOMJobParser {
  /**
   * Parse jobs from HTML content using DOM selectors
   */
  static parseJobsFromHTML(html: string, markdown: string, siteName: string): JobParsingResult {
    const startTime = Date.now();
    const result: JobParsingResult = {
      jobs: [],
      parsed: 0,
      valid: 0,
      invalid: 0,
      qualityScore: 0,
      errors: [],
      warnings: []
    };

    try {
      logger.info(`Starting DOM-based job parsing for ${siteName}`, {
        operation: 'parseJobsFromHTML',
        siteName,
        htmlLength: html?.length || 0,
        markdownLength: markdown?.length || 0
      });

      // Try HTML parsing first, fallback to markdown if needed
      let rawJobs: RawJobData[] = [];
      
      if (html && html.trim().length > 0) {
        rawJobs = this.parseFromHTML(html, siteName);
        result.warnings.push(`HTML parsing extracted ${rawJobs.length} raw jobs`);
      }
      
      // Fallback to markdown parsing if HTML parsing didn't yield results
      if (rawJobs.length === 0 && markdown && markdown.trim().length > 0) {
        rawJobs = this.parseFromMarkdown(markdown, siteName);
        result.warnings.push(`Fallback markdown parsing extracted ${rawJobs.length} raw jobs`);
      }

      result.parsed = rawJobs.length;

      if (rawJobs.length === 0) {
        result.warnings.push('No jobs found in either HTML or markdown content');
        return result;
      }

      // Sanitize and validate each job
      const sanitizationResults = rawJobs.map(rawJob => 
        ContentSanitizer.sanitizeJobContent(rawJob)
      );

      // Filter valid jobs and collect stats
      for (const sanitizationResult of sanitizationResults) {
        if (sanitizationResult.sanitized.isValid && sanitizationResult.qualityScore >= 70) {
          result.jobs.push(sanitizationResult.sanitized);
          result.valid++;
        } else {
          result.invalid++;
          result.errors.push(...sanitizationResult.sanitized.validationErrors);
        }
        
        result.warnings.push(...sanitizationResult.warnings);
      }

      // Calculate overall quality score
      result.qualityScore = result.parsed > 0 
        ? Math.round((result.valid / result.parsed) * 100) 
        : 0;

      const duration = Date.now() - startTime;
      logger.info(`DOM job parsing completed for ${siteName}`, {
        operation: 'parseJobsFromHTML',
        siteName,
        duration,
        parsed: result.parsed,
        valid: result.valid,
        invalid: result.invalid,
        qualityScore: result.qualityScore,
        errorCount: result.errors.length,
        warningCount: result.warnings.length
      });

      return result;

    } catch (error) {
      logger.error(`Error during DOM job parsing for ${siteName}`, error);
      result.errors.push(`Parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Parse jobs from HTML using DOM selectors
   */
  private static parseFromHTML(html: string, siteName: string): RawJobData[] {
    const jobs: RawJobData[] = [];

    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // Get site-specific selectors
      const selectors = JOB_SITE_SELECTORS[siteName as keyof typeof JOB_SITE_SELECTORS] || JOB_SITE_SELECTORS.generic;
      
      // Remove excluded containers first
      if (selectors.excludeContainers) {
        document.querySelectorAll(selectors.excludeContainers).forEach(el => {
          el.remove();
        });
      }

      // Find job containers
      const jobElements = document.querySelectorAll(selectors.jobContainer);
      
      logger.debug(`Found ${jobElements.length} job containers using selector: ${selectors.jobContainer}`, {
        operation: 'parseFromHTML',
        siteName
      });

      jobElements.forEach((jobElement, index) => {
        try {
          const job = this.extractJobDataFromElement(jobElement as Element, selectors);
          
          // Basic validation before adding
          if (job.title && job.title.length > 2) {
            jobs.push(job);
            
            if (index < 3) { // Log first few jobs for debugging
              logger.debug(`Extracted job ${index + 1}`, {
                operation: 'parseFromHTML',
                siteName,
                job: {
                  title: job.title?.substring(0, 50),
                  company: job.company?.substring(0, 30),
                  location: job.location?.substring(0, 30)
                }
              });
            }
          }
        } catch (error) {
          logger.error(`Error extracting job from element ${index}`, error, {
            operation: 'parseFromHTML',
            siteName
          });
        }
      });

      return jobs;

    } catch (error) {
      logger.error('Error parsing HTML with DOM', error, {
        operation: 'parseFromHTML',
        siteName
      });
      return [];
    }
  }

  /**
   * Extract job data from a single DOM element
   */
  private static extractJobDataFromElement(element: Element, selectors: any): RawJobData {
    const job: RawJobData = {};

    try {
      // Extract title
      const titleEl = element.querySelector(selectors.title);
      if (titleEl) {
        job.title = this.getElementText(titleEl);
        // Try to get URL from title link
        const titleLink = titleEl.closest('a') || titleEl.querySelector('a');
        if (titleLink && titleLink.getAttribute('href')) {
          job.url = titleLink.getAttribute('href') || undefined;
        }
      }

      // Extract company
      const companyEl = element.querySelector(selectors.company);
      if (companyEl) {
        job.company = this.getElementText(companyEl);
      }

      // Extract location
      const locationEl = element.querySelector(selectors.location);
      if (locationEl) {
        job.location = this.getElementText(locationEl);
      }

      // Extract pay
      const payEl = element.querySelector(selectors.pay);
      if (payEl) {
        job.pay = this.getElementText(payEl);
      }

      // Extract schedule
      const scheduleEl = element.querySelector(selectors.schedule);
      if (scheduleEl) {
        job.schedule = this.getElementText(scheduleEl);
      }

      // Extract description
      const descEl = element.querySelector(selectors.description);
      if (descEl) {
        job.description = this.getElementText(descEl);
      }

      // Set current date as fallback
      job.datePosted = new Date().toISOString().split('T')[0];

    } catch (error) {
      logger.error('Error extracting data from job element', error);
    }

    return job;
  }

  /**
   * Get clean text content from an element
   */
  private static getElementText(element: Element): string {
    if (!element) return '';
    
    // Get text content and clean it
    let text = element.textContent || '';
    
    // Remove extra whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Remove common prefixes that aren't part of the actual data
    text = text.replace(/^(new|posted|updated|urgent|featured):\s*/i, '');
    
    return text;
  }

  /**
   * Fallback markdown parsing (improved version of original logic)
   */
  private static parseFromMarkdown(markdown: string, siteName: string): RawJobData[] {
    const jobs: RawJobData[] = [];
    
    try {
      const lines = markdown.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let currentJob: Partial<RawJobData> = {};
      let inJobSection = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        
        // Skip lines with suspicious content
        if (this.isSuspiciousLine(line)) {
          continue;
        }
        
        // Detect job titles (headers or bold text)
        if (this.looksLikeJobTitle(line)) {
          // Save previous job if we have one
          if (currentJob.title && currentJob.company) {
            jobs.push(currentJob as RawJobData);
          }
          
          currentJob = {
            title: this.extractTitleFromLine(line),
            datePosted: new Date().toISOString().split('T')[0]
          };
          inJobSection = true;
          continue;
        }
        
        // If we're in a job section, try to extract other fields
        if (inJobSection && currentJob.title) {
          if (!currentJob.company && this.looksLikeCompanyName(line)) {
            currentJob.company = line;
          } else if (this.looksLikeLocation(line)) {
            currentJob.location = line;
          } else if (this.looksLikePay(line)) {
            currentJob.pay = line;
          } else if (this.looksLikeSchedule(line)) {
            currentJob.schedule = line;
          } else if (!currentJob.description && line.length > 30) {
            currentJob.description = line;
          }
        }
      }
      
      // Don't forget the last job
      if (currentJob.title && currentJob.company) {
        jobs.push(currentJob as RawJobData);
      }
      
    } catch (error) {
      logger.error('Error parsing markdown', error, {
        operation: 'parseFromMarkdown',
        siteName
      });
    }
    
    return jobs;
  }

  /**
   * Check if a line contains suspicious content that indicates non-job data
   */
  private static isSuspiciousLine(line: string): boolean {
    const lowerLine = line.toLowerCase();
    const suspiciousPatterns = [
      'saved search', 'refine', 'sign in', 'create alert', 'no results',
      'try different', 'suggestions', 'sponsored', 'advertisement',
      'cookies', 'privacy', 'terms', 'loading', 'please wait',
      'sort by', 'filter', 'page', 'next', 'previous',
      'javascript', 'enable', 'error', '404', 'maintenance'
    ];
    
    return suspiciousPatterns.some(pattern => lowerLine.includes(pattern));
  }

  /**
   * Check if a line looks like a job title
   */
  private static looksLikeJobTitle(line: string): boolean {
    // Check for markdown headers or bold formatting
    if (line.startsWith('#') || (line.startsWith('**') && line.endsWith('**'))) {
      return true;
    }
    
    // Check for common job title patterns
    const jobPatterns = [
      /\b(manager|coordinator|specialist|analyst|developer|engineer|assistant|representative|technician)\b/i,
      /\b(senior|junior|lead|principal|associate|executive)\s+\w+/i,
      /\b(part.time|full.time|remote|work from home)\b/i
    ];
    
    return jobPatterns.some(pattern => pattern.test(line)) && line.length >= 5 && line.length <= 100;
  }

  /**
   * Extract title from a formatted line
   */
  private static extractTitleFromLine(line: string): string {
    return line
      .replace(/^#+\s*/, '') // Remove markdown headers
      .replace(/^\*\*(.+)\*\*$/, '$1') // Remove bold formatting
      .trim();
  }

  /**
   * Check if a line looks like a company name
   */
  private static looksLikeCompanyName(line: string): boolean {
    return line.length >= 2 && 
           line.length <= 80 && 
           !line.includes('$') && 
           !line.includes('remote') && 
           !/^\d+/.test(line) &&
           !line.toLowerCase().includes('hour') &&
           !line.toLowerCase().includes('salary');
  }

  /**
   * Check if a line looks like a location
   */
  private static looksLikeLocation(line: string): boolean {
    return /^[a-z\s,.-]+,\s*[a-z]{2,}$/i.test(line) || 
           line.toLowerCase() === 'remote' ||
           /^[a-z\s-]+$/i.test(line) && line.length >= 2 && line.length <= 50;
  }

  /**
   * Check if a line looks like pay information
   */
  private static looksLikePay(line: string): boolean {
    return line.includes('$') || 
           line.toLowerCase().includes('hour') || 
           line.toLowerCase().includes('salary') ||
           line.toLowerCase().includes('annual');
  }

  /**
   * Check if a line looks like schedule information
   */
  private static looksLikeSchedule(line: string): boolean {
    return line.toLowerCase().includes('part') || 
           line.toLowerCase().includes('full') || 
           line.toLowerCase().includes('time') ||
           line.toLowerCase().includes('schedule');
  }

  /**
   * Get parsing statistics for debugging and monitoring
   */
  static getParsingStats(results: JobParsingResult[]): {
    totalSites: number;
    totalJobsParsed: number;
    totalValidJobs: number;
    averageQualityScore: number;
    commonErrors: { error: string; count: number }[];
    sitePerformance: { site: string; parsed: number; valid: number; qualityScore: number }[];
  } {
    const totalSites = results.length;
    const totalJobsParsed = results.reduce((sum, r) => sum + r.parsed, 0);
    const totalValidJobs = results.reduce((sum, r) => sum + r.valid, 0);
    const averageQualityScore = results.reduce((sum, r) => sum + r.qualityScore, 0) / totalSites;

    // Count common errors
    const errorCount: Record<string, number> = {};
    results.forEach(result => {
      result.errors.forEach(error => {
        errorCount[error] = (errorCount[error] || 0) + 1;
      });
    });

    const commonErrors = Object.entries(errorCount)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Create mock site performance data since we don't have site names in results
    const sitePerformance = results.map((result, index) => ({
      site: `Site ${index + 1}`,
      parsed: result.parsed,
      valid: result.valid,
      qualityScore: result.qualityScore
    }));

    return {
      totalSites,
      totalJobsParsed,
      totalValidJobs,
      averageQualityScore: Math.round(averageQualityScore * 100) / 100,
      commonErrors,
      sitePerformance
    };
  }
}
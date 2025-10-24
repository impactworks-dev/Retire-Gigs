import { ApifyClient } from 'apify-client';
import { logger } from '../logger';
import { env } from 'process';

export interface JobData {
  id?: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salary?: string;
  postedDate?: string;
  jobType?: string;
  experience?: string;
  source: string;
  createdAt?: Date;
  updatedAt?: Date;
  pay: string;
  schedule: string;
  tags: string[];
  matchScore: string;
  timeAgo: string;
  isActive: boolean;
}

export class ApifyService {
  private client: ApifyClient | null = null;
  private isAvailable: boolean = false;

  constructor() {
    this.isAvailable = !!process.env.APIFY_API_TOKEN;
    if (this.isAvailable) {
      this.client = new ApifyClient({
        token: process.env.APIFY_API_TOKEN!,
      });
      logger.info('Apify service initialized successfully');
    } else {
      logger.warn('APIFY_API_TOKEN not configured - job scraping will be disabled');
    }
  }

  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  // Assign persona-based tags for job matching
  private assignPersonaTags(item: any): string[] {
    const tags = ['indeed'];
    const title = (item.title || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const company = (item.company || '').toLowerCase();
    const text = `${title} ${description} ${company}`;
    
    // Bridge Worker Brenda (Admin/Customer Service)
    if (text.includes('customer service') || text.includes('administrative') || 
        text.includes('data entry') || text.includes('receptionist') ||
        text.includes('office support') || text.includes('virtual assistant') ||
        text.includes('call center') || text.includes('chat support')) {
      tags.push('bridge-worker', 'admin', 'customer-service');
    }
    
    // Second-Act Sam (Consulting/Tutoring)
    if (text.includes('consultant') || text.includes('tutor') || 
        text.includes('trainer') || text.includes('advisor') ||
        text.includes('mentor') || text.includes('freelance') ||
        text.includes('independent contractor') || text.includes('expert')) {
      tags.push('second-act', 'consulting', 'expertise');
    }
    
    // Seasonal Sue (Experience/Travel)
    if (text.includes('seasonal') || text.includes('tourism') ||
        text.includes('park ranger') || text.includes('museum') ||
        text.includes('tour guide') || text.includes('hospitality') ||
        text.includes('event staff') || text.includes('campground')) {
      tags.push('seasonal', 'tourism', 'experience');
    }
    
    // Care-Curve Carol (Local/Flexible)
    if (text.includes('local') || text.includes('community') ||
        text.includes('caregiver') || text.includes('companion') ||
        text.includes('school support') || text.includes('library') ||
        text.includes('nearby') || text.includes('flexible hours')) {
      tags.push('care-curve', 'local', 'community');
    }
    
    // Add work arrangement tags
    if (text.includes('remote') || text.includes('work from home')) {
      tags.push('remote');
    }
    if (text.includes('part-time') || text.includes('flexible')) {
      tags.push('flexible');
    }
    if (text.includes('contract') || text.includes('freelance')) {
      tags.push('contract');
    }
    
    return tags;
  }
  
  // Calculate match score based on job characteristics
  private calculateMatchScore(item: any): string {
    const title = (item.title || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const company = (item.company || '').toLowerCase();
    const text = `${title} ${description} ${company}`;
    
    let score = 0;
    
    // High-value indicators
    if (text.includes('senior-friendly') || text.includes('mature workers')) score += 3;
    if (text.includes('flexible schedule') || text.includes('work from home')) score += 2;
    if (text.includes('part-time') || text.includes('contract')) score += 2;
    if (text.includes('remote') || text.includes('virtual')) score += 2;
    if (text.includes('experience preferred') || text.includes('years experience')) score += 1;
    
    // Age-appropriate indicators
    if (text.includes('customer service') || text.includes('administrative')) score += 1;
    if (text.includes('consultant') || text.includes('advisor')) score += 1;
    if (text.includes('seasonal') || text.includes('temporary')) score += 1;
    
    // Determine match level
    if (score >= 6) return 'great';
    if (score >= 4) return 'good';
    return 'potential';
  }

  // Format pay data for consistent storage
  private formatPayData(payData: any): string | null {
    if (!payData) return null;
    
    // If it's already a string, return as is
    if (typeof payData === 'string') {
      return payData;
    }
    
    // If it's an object, format it properly
    if (typeof payData === 'object' && payData !== null) {
      const { min, max, type, currency = 'USD' } = payData;
      
      if (min && max) {
        const typeText = type === 'yearly' ? '/year' : type === 'hourly' ? '/hour' : '';
        return `$${min.toLocaleString()} - $${max.toLocaleString()}${typeText}`;
      }
      
      if (min) {
        const typeText = type === 'yearly' ? '/year' : type === 'hourly' ? '/hour' : '';
        return `$${min.toLocaleString()}+${typeText}`;
      }
    }
    
    return String(payData);
  }

  async scrapeJobs(searchParams: {
    query?: string;
    location?: string;
    count?: number;
  } = {}): Promise<JobData[]> {
    if (!this.isAvailable) {
      throw new Error('Apify service not available - API token not configured');
    }

    try {
      const {
        query = 'sales',
        location = 'New York, NY',
        count = 10
      } = searchParams;

      // Prepare Actor input
      const input = {
        "scrapeJobs.searchUrl": `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&vjk=b28e7b80d0399215`,
        "scrapeJobs.scrapeCompany": false,
        "count": count,
        "outputSchema": "raw",
        "skipSimilarJobs": true,
        "findContacts": false,
        "findContacts.position": [
          "founder",
          "director"
        ]
      };

      logger.info('Starting Apify job scraping', { input });

      // Run the Actor and wait for it to finish
      const run = await this.client!.actor("hMvNSpz3JnHgl5jkh").call(input);

      // Fetch Actor results from the run's dataset
      const { items } = await this.client!.dataset(run.defaultDatasetId).listItems();

      logger.info(`Apify scraping completed. Found ${items.length} jobs`);

      // Helper function to generate job URL when not provided
      const generateJobUrl = (item: any): string => {
        // Try to construct Indeed URL if we have job ID or other identifiers
        if (item.jobId || item.id) {
          return `https://www.indeed.com/viewjob?jk=${item.jobId || item.id}`;
        }
        
        // Try to construct a search URL based on title and company
        if (item.title && item.company) {
          const searchQuery = encodeURIComponent(`${item.title} ${item.company}`);
          return `https://www.indeed.com/jobs?q=${searchQuery}`;
        }
        
        // Fallback to Indeed search
        if (item.title) {
          const searchQuery = encodeURIComponent(item.title);
          return `https://www.indeed.com/jobs?q=${searchQuery}`;
        }
        
        return '';
      };

      // Helper function to format location data
      const formatLocation = (locationData: any): string => {
        if (typeof locationData === 'string') {
          return locationData;
        }
        
        if (typeof locationData === 'object' && locationData !== null) {
          // Try to get the formatted address first
          if (locationData.formatted?.long) {
            return locationData.formatted.long;
          }
          if (locationData.formatted?.short) {
            return locationData.formatted.short;
          }
          if (locationData.fullAddress) {
            return locationData.fullAddress;
          }
          if (locationData.city && locationData.admin1Name) {
            return `${locationData.city}, ${locationData.admin1Name}`;
          }
          if (locationData.city) {
            return locationData.city;
          }
        }
        
        // Fallback to string representation
        return String(locationData);
      };

      // Debug: Log the first item to see what fields are available (only in development)
      if (items.length > 0 && process.env.NODE_ENV === 'development') {
        logger.info('Sample Apify item fields:', Object.keys(items[0]));
        logger.info('Sample Apify item URL fields:', {
          url: items[0].url,
          jobUrl: items[0].jobUrl,
          jobLink: items[0].jobLink,
          link: items[0].link,
          applyUrl: items[0].applyUrl,
          indeedUrl: items[0].indeedUrl,
          externalUrl: items[0].externalUrl
        });
      }

      // Filter out scam jobs and age-inappropriate roles
      const scamKeywords = [
        'mlm', 'multi-level marketing', 'pyramid', 'work from home scam',
        'easy money', 'no experience required', 'pay to work', 'investment required',
        'get rich quick', 'make money fast', 'work from home opportunity',
        'no experience high pay', 'earn $1000 daily', 'guaranteed income'
      ];
      
      const ageInappropriateKeywords = [
        'heavy lifting', 'physical labor', 'construction', 'warehouse',
        'manual labor', 'fast-paced', 'high energy', 'entry level',
        'recent graduate', 'college student', 'internship'
      ];
      
      const filteredItems = items.filter((item: any) => {
        const title = (item.title || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        const company = (item.company || '').toLowerCase();
        const text = `${title} ${description} ${company}`;
        
        // Check for scam indicators
        const hasScamKeywords = scamKeywords.some(keyword => 
          text.includes(keyword.toLowerCase())
        );
        
        // Check for age-inappropriate terms
        const hasAgeInappropriateKeywords = ageInappropriateKeywords.some(keyword => 
          text.includes(keyword.toLowerCase())
        );
        
        return !hasScamKeywords && !hasAgeInappropriateKeywords;
      });

      // Transform the filtered data into our JobData format
      const jobs: JobData[] = filteredItems.map((item: any, index: number) => ({
        title: item.title || item.jobTitle || 'No title',
        company: item.company || item.companyName || 'Unknown company',
        location: formatLocation(item.location || item.jobLocation || location),
        description: item.description || item.jobDescription || '',
        url: (item.url && item.url.trim()) || (item.jobUrl && item.jobUrl.trim()) || (item.jobLink && item.jobLink.trim()) || (item.link && item.link.trim()) || (item.applyUrl && item.applyUrl.trim()) || (item.indeedUrl && item.indeedUrl.trim()) || (item.externalUrl && item.externalUrl.trim()) || generateJobUrl(item),
        salary: item.salary || item.salaryRange || undefined,
        postedDate: item.postedDate || item.datePosted || undefined,
        jobType: item.jobType || item.employmentType || undefined,
        experience: item.experience || item.experienceLevel || undefined,
        source: 'indeed',
        createdAt: new Date(),
        updatedAt: new Date(),
        // Add required database fields with proper formatting
        pay: this.formatPayData(item.salary || item.salaryRange || item.extractedSalary) || 'Not specified',
        schedule: item.jobType || item.employmentType || item.jobTypes?.[0] || 'Full-time',
        tags: this.assignPersonaTags(item), // Persona-based tags
        matchScore: this.calculateMatchScore(item), // Smart match scoring
        timeAgo: item.formattedRelativeTime || item.postedDate || 'Recently',
        isActive: true
      }));

      return jobs;
    } catch (error) {
      logger.error('Apify job scraping failed', error);
      throw new Error(`Job scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      // Test the connection by getting actor info
      const actor = await this.client!.actor("qA8rz8tR61HdkfTBL").get();
      return !!actor;
    } catch (error) {
      logger.error('Apify connection test failed', error);
      return false;
    }
  }
}

// Export singleton instance
export const apifyService = new ApifyService();

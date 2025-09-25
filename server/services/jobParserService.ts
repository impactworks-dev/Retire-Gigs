import { InsertJobOpportunity } from '@shared/schema.js';
import { logger } from '../logger.js';

interface ParsedJob {
  title: string;
  company: string;
  location: string;
  pay: string;
  schedule: string;
  description: string;
  timeAgo: string;
  requirements?: string[];
}

class JobParserService {
  /**
   * Parse Perplexity response text into structured job opportunities
   */
  parseJobsFromText(responseText: string): InsertJobOpportunity[] {
    try {
      logger.info('Parsing jobs from Perplexity response', {
        operation: 'parse_jobs_from_text',
        responseLength: responseText.length
      });

      const jobs: InsertJobOpportunity[] = [];
      const sections = this.splitIntoJobSections(responseText);

      for (const section of sections) {
        try {
          const parsedJob = this.parseJobSection(section);
          if (parsedJob) {
            const jobOpportunity = this.convertToJobOpportunity(parsedJob);
            jobs.push(jobOpportunity);
          }
        } catch (error) {
          logger.warn('Failed to parse job section', {
            operation: 'parse_job_section',
            error: error instanceof Error ? error.message : 'Unknown error',
            section: section.substring(0, 200)
          });
        }
      }

      logger.info('Job parsing completed', {
        operation: 'parse_jobs_from_text',
        totalJobs: jobs.length
      });

      return jobs;
    } catch (error) {
      logger.error('Error parsing jobs from text', error, {
        operation: 'parse_jobs_from_text'
      });
      return [];
    }
  }

  private splitIntoJobSections(text: string): string[] {
    // Split by numbered lists, bullet points, or clear job separators
    const sections: string[] = [];
    
    // Try to identify job sections by common patterns
    const patterns = [
      /^\d+\.\s+(.+?)(?=^\d+\.|$)/gm, // Numbered lists
      /^[•\-*]\s+(.+?)(?=^[•\-*]|$)/gm, // Bullet points
      /^(.+?)(?=^Job Title:|^Title:|^Position:|$)/gim, // Job title patterns
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 1) {
        sections.push(...matches);
        break;
      }
    }

    // If no clear pattern found, try to split by job-related keywords
    if (sections.length === 0) {
      const jobKeywords = ['Job Title:', 'Position:', 'Company:', 'Location:', 'Salary:', 'Pay:'];
      const lines = text.split('\n');
      let currentSection = '';
      
      for (const line of lines) {
        const hasJobKeyword = jobKeywords.some(keyword => 
          line.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasJobKeyword && currentSection.trim()) {
          sections.push(currentSection.trim());
          currentSection = line;
        } else {
          currentSection += '\n' + line;
        }
      }
      
      if (currentSection.trim()) {
        sections.push(currentSection.trim());
      }
    }

    // Filter out very short sections that likely aren't complete jobs
    return sections.filter(section => section.length > 100);
  }

  private parseJobSection(section: string): ParsedJob | null {
    // Pre-clean the section to remove obvious HTML/markdown artifacts
    const cleanedSection = this.preCleanSection(section);
    const lines = cleanedSection.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 3) {
      return null; // Not enough information for a job
    }

    let title = '';
    let company = '';
    let location = '';
    let pay = '';
    let schedule = '';
    let description = '';
    let timeAgo = '';
    const requirements: string[] = [];

    // Extract information using various patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();

      // Job title (often first line or after "Job Title:", "Position:")
      if (!title && (i === 0 || lowerLine.includes('job title:') || lowerLine.includes('position:'))) {
        title = this.cleanJobField(line.replace(/^(job title:|position:)/i, ''));
      }

      // Company
      if (!company && (lowerLine.includes('company:') || lowerLine.includes('employer:'))) {
        company = this.cleanJobField(line.replace(/^(company:|employer:)/i, ''));
      }

      // Location
      if (!location && (lowerLine.includes('location:') || lowerLine.includes('where:'))) {
        location = this.cleanJobField(line.replace(/^(location:|where:)/i, ''));
      }

      // Pay/Salary
      if (!pay && (lowerLine.includes('pay:') || lowerLine.includes('salary:') || lowerLine.includes('$') || lowerLine.includes('hour'))) {
        pay = this.cleanJobField(line.replace(/^(pay:|salary:)/i, ''));
      }

      // Schedule
      if (!schedule && (lowerLine.includes('schedule:') || lowerLine.includes('time:') || 
          lowerLine.includes('full-time') || lowerLine.includes('part-time') || 
          lowerLine.includes('flexible') || lowerLine.includes('remote'))) {
        schedule = this.cleanJobField(line.replace(/^(schedule:|time:)/i, ''));
      }

      // Time ago
      if (!timeAgo && (lowerLine.includes('posted:') || lowerLine.includes('ago') || 
          lowerLine.includes('days') || lowerLine.includes('weeks'))) {
        timeAgo = this.cleanJobField(line.replace(/^(posted:)/i, ''));
      }

      // Description (longer lines that don't match other patterns)
      if (!description && line.length > 50 && 
          !lowerLine.includes(':') && 
          !this.isFieldLine(line)) {
        description = line;
      }

      // Requirements
      if (lowerLine.includes('requirement') || lowerLine.includes('qualification') || 
          lowerLine.includes('must have') || lowerLine.includes('experience')) {
        requirements.push(line);
      }
    }

    // Use fallbacks and defaults
    if (!title) {
      title = lines[0] || 'Job Opportunity';
    }
    
    if (!company) {
      // Try to extract company from lines that might contain it
      const companyLine = lines.find(line => 
        !this.isFieldLine(line) && 
        line.length < 50 && 
        !line.includes('$') &&
        line !== title
      );
      company = companyLine || 'Company Not Specified';
    }

    if (!location) {
      location = 'Location Not Specified';
    }

    if (!pay) {
      pay = 'Salary Not Specified';
    }

    if (!schedule) {
      schedule = 'Schedule Not Specified';
    }

    if (!description) {
      // Use the longest line as description
      const longestLine = lines.reduce((longest, current) => 
        current.length > longest.length ? current : longest, ''
      );
      description = longestLine || 'Description not available';
    }

    if (!timeAgo) {
      timeAgo = 'Recently posted';
    }

    const cleanedJob = {
      title: this.cleanJobField(title),
      company: this.cleanJobField(company),
      location: this.cleanJobField(location),
      pay: this.cleanJobField(pay),
      schedule: this.cleanJobField(schedule),
      description: this.cleanJobField(description),
      timeAgo: this.cleanJobField(timeAgo),
      requirements
    };

    // Validate that we have essential information and it's not garbage
    if (!this.isValidJobData(cleanedJob)) {
      return null;
    }

    return cleanedJob;
  }

  private isFieldLine(line: string): boolean {
    const fieldPatterns = [
      /^(job title|position|company|employer|location|where|pay|salary|schedule|time|posted):/i
    ];
    return fieldPatterns.some(pattern => pattern.test(line));
  }

  private cleanJobField(text: string): string {
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links [text](url) -> text
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/https?:\/\/[^\s]+/g, '') // Remove standalone URLs
      .replace(/#{1,6}\s*/g, '') // Remove markdown headers
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1') // Remove markdown bold/italic
      .replace(/`([^`]+)`/g, '$1') // Remove markdown code
      .replace(/^\s*[-•*+]\s+/gm, '') // Remove bullet points
      .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered lists
      .replace(/^[:\-\s]+/, '') // Remove leading colons and dashes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
  }

  private convertToJobOpportunity(parsedJob: ParsedJob): InsertJobOpportunity {
    // Generate tags based on job content
    const tags = this.generateTags(parsedJob);
    
    // Calculate match score (simplified for now)
    const matchScore = this.calculateMatchScore(parsedJob);

    return {
      title: parsedJob.title,
      company: parsedJob.company,
      location: parsedJob.location,
      pay: parsedJob.pay,
      schedule: parsedJob.schedule,
      description: parsedJob.description,
      timeAgo: parsedJob.timeAgo,
      tags,
      matchScore,
      isActive: true
    };
  }

  private generateTags(job: ParsedJob): string[] {
    const tags: string[] = [];
    const content = `${job.title} ${job.description} ${job.schedule}`.toLowerCase();

    // Work environment tags
    if (content.includes('remote') || content.includes('work from home')) {
      tags.push('remote');
    }
    if (content.includes('office') || content.includes('on-site')) {
      tags.push('office');
    }
    if (content.includes('outdoor') || content.includes('garden') || content.includes('field')) {
      tags.push('outdoor');
    }

    // Work style tags
    if (content.includes('help') || content.includes('assist') || content.includes('support')) {
      tags.push('helping');
    }
    if (content.includes('creative') || content.includes('design') || content.includes('art')) {
      tags.push('creative');
    }
    if (content.includes('social') || content.includes('people') || content.includes('community')) {
      tags.push('social');
    }
    if (content.includes('quiet') || content.includes('independent') || content.includes('solo')) {
      tags.push('quiet');
    }
    if (content.includes('hands-on') || content.includes('practical') || content.includes('manual')) {
      tags.push('hands-on');
    }

    // Schedule tags
    if (content.includes('flexible') || content.includes('choose') || content.includes('own schedule')) {
      tags.push('flexible');
    }
    if (content.includes('part-time') || content.includes('part time')) {
      tags.push('part-time');
    }
    if (content.includes('full-time') || content.includes('full time')) {
      tags.push('full-time');
    }

    // Industry tags
    if (content.includes('education') || content.includes('teaching') || content.includes('tutor')) {
      tags.push('education');
    }
    if (content.includes('health') || content.includes('care') || content.includes('medical')) {
      tags.push('healthcare');
    }
    if (content.includes('retail') || content.includes('customer') || content.includes('sales')) {
      tags.push('retail');
    }

    // Ensure we have at least some tags
    if (tags.length === 0) {
      tags.push('general');
    }

    return tags;
  }

  private preCleanSection(section: string): string {
    return section
      // Remove entire lines that are clearly navigation or UI elements
      .replace(/^.*?(Skip to main content|View all|jobs in|Sign in|Save job|Apply now|Easily apply).*$/gim, '')
      // Remove lines that are mostly punctuation or symbols
      .replace(/^[|\-=+*#<>{}()\[\]\/\\]{3,}.*$/gm, '')
      // Remove obvious Indeed/job site artifacts
      .replace(/^\s*\|.*\|.*$/gm, '') // Table rows
      .replace(/^.*?Indeed\.com.*$/gim, '')
      .replace(/^.*?job search.*$/gim, '')
      // Clean up extra whitespace
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  private isValidJobData(job: ParsedJob): boolean {
    // Check if we have minimum required fields
    if (!job.title || job.title.length < 3) return false;
    if (!job.company || job.company.length < 2) return false;
    if (!job.location || job.location.length < 3) return false;

    // Check for common garbage indicators
    const suspiciousPatterns = [
      /^(easily apply|apply now|view all|sign in|save job)$/i,
      /^\s*[-|=+*#<>{}()\[\]\/\\]{2,}\s*$/, // Lines of symbols
      /^.*indeed\.com.*$/i,
      /^.*jobs? in.*$/i,
      /^.*area$/i,
      /^\$?\s*from\s*\$?\d+$/i, // "From $13" type entries
    ];

    // Check title for suspicious content
    if (suspiciousPatterns.some(pattern => pattern.test(job.title))) return false;
    if (suspiciousPatterns.some(pattern => pattern.test(job.company))) return false;

    // Ensure fields don't contain HTML artifacts
    if (job.title.includes('<') || job.title.includes('[') || job.title.includes('](')) return false;
    if (job.company.includes('<') || job.company.includes('[') || job.company.includes('](')) return false;

    return true;
  }

  private isNavigationLine(line: string): boolean {
    const navigationPatterns = [
      /^(skip to main content|view all|jobs in|sign in|save job|apply now|easily apply)$/i,
      /^\s*[-|=+*#<>{}()\[\]\/\\]{2,}\s*$/,
      /indeed\.com/i,
      /job search/i,
    ];
    return navigationPatterns.some(pattern => pattern.test(line));
  }

  private calculateMatchScore(job: ParsedJob): string | null {
    const content = `${job.title} ${job.description} ${job.schedule}`.toLowerCase();
    
    // Simple scoring based on senior-friendly keywords
    let score = 0;

    // Positive indicators for seniors
    const positiveKeywords = [
      'part-time', 'flexible', 'experience', 'mature', 'senior', 'retired',
      'consultant', 'advisor', 'mentor', 'volunteer', 'community', 'helping'
    ];
    
    for (const keyword of positiveKeywords) {
      if (content.includes(keyword)) {
        score += 1;
      }
    }

    // Negative indicators
    const negativeKeywords = [
      'fast-paced', 'high-energy', 'young', 'recent graduate', 'entry-level',
      'heavy lifting', 'standing for long periods'
    ];
    
    for (const keyword of negativeKeywords) {
      if (content.includes(keyword)) {
        score -= 1;
      }
    }

    if (score >= 2) return 'great';
    if (score >= 0) return 'good';
    return 'potential';
  }
}

export const jobParserService = new JobParserService();
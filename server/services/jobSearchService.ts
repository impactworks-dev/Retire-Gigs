import OpenAI from "openai";
import { perplexityService } from './perplexityService.js';
import { logger } from '../logger.js';
import type { InsertJobOpportunity } from '@shared/schema.js';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface JobSearchCriteria {
  location?: string;
  jobTypes?: string[];
  schedule?: string;
  experienceLevel?: string;
  keywords?: string[];
  excludeKeywords?: string[];
}

interface StructuredJob {
  title: string;
  company: string;
  location: string;
  pay: string;
  schedule: string;
  description: string;
  url?: string;
  tags: string[];
}

interface OpenAIJobParsingResponse {
  jobs: StructuredJob[];
}

/**
 * JobSearchService - Orchestrates real-time job searches using Perplexity and OpenAI
 * 
 * Flow:
 * 1. User provides search criteria
 * 2. Perplexity searches for current job opportunities matching criteria
 * 3. OpenAI (GPT-5) parses Perplexity's response into structured job data
 * 4. Returns structured jobs ready for display
 */
class JobSearchService {
  private openaiApiKey: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    if (!this.openaiApiKey) {
      logger.warn('OpenAI API key not found in environment variables');
    }
  }

  isServiceAvailable(): boolean {
    return !!this.openaiApiKey && perplexityService.isServiceAvailable();
  }

  /**
   * Search for jobs in real-time based on user criteria
   */
  async searchJobs(criteria: JobSearchCriteria): Promise<InsertJobOpportunity[]> {
    if (!this.isServiceAvailable()) {
      throw new Error('Job search service is not fully configured. Please check API keys.');
    }

    logger.info('Starting real-time job search', {
      operation: 'job_search',
      criteria: {
        location: criteria.location,
        jobTypes: criteria.jobTypes,
        schedule: criteria.schedule
      }
    });

    try {
      // Step 1: Use Perplexity to search for jobs
      const perplexityResults = await perplexityService.searchJobs({
        location: criteria.location,
        jobTypes: criteria.jobTypes,
        schedule: criteria.schedule,
        experienceLevel: criteria.experienceLevel,
        keywords: criteria.keywords,
        excludeKeywords: criteria.excludeKeywords
      });

      logger.info('Perplexity search completed', {
        operation: 'job_search',
        resultLength: perplexityResults.length
      });

      // Step 2: Use OpenAI to parse and structure the results
      const structuredJobs = await this.parseJobsWithOpenAI(perplexityResults, criteria);

      logger.info('OpenAI parsing completed', {
        operation: 'job_search',
        jobCount: structuredJobs.length
      });

      // Step 3: Convert to InsertJobOpportunity format
      const jobOpportunities = this.convertToJobOpportunities(structuredJobs);

      return jobOpportunities;
    } catch (error) {
      logger.error('Job search failed', error, {
        operation: 'job_search',
        criteria
      });
      throw error;
    }
  }

  /**
   * Use OpenAI GPT-5 to parse Perplexity results into structured job data
   */
  private async parseJobsWithOpenAI(
    perplexityResults: string,
    criteria: JobSearchCriteria
  ): Promise<StructuredJob[]> {
    const exampleJob: StructuredJob = {
      title: "Customer Service Representative",
      company: "AARP Services Inc.",
      location: "Remote (United States)",
      pay: "$18-22/hour",
      schedule: "Part-time, flexible hours",
      description: "Assist members with inquiries about AARP benefits and services. Flexible schedule with remote work options. Ideal for experienced professionals seeking part-time work.",
      url: "https://jobs.aarp.org/job/12345/customer-service-rep",
      tags: ["remote", "part-time", "customer-service", "flexible"]
    };

    const systemPrompt = `You are a job information extraction expert. Your task is to parse job search results from Perplexity and extract structured job data.

IMPORTANT INSTRUCTIONS:
1. Extract ALL jobs mentioned in the search results
2. For each job, extract: title, company, location, pay, schedule, description, URL (if available), and relevant tags
3. If a field is not clearly specified, make a reasonable inference or use a placeholder like "Negotiable" for pay
4. Tags should be lowercase, hyphenated keywords (e.g., "remote", "part-time", "customer-service")
5. URLs should be complete and valid links to the actual job posting if available
6. Return ONLY valid JSON in the exact format specified below
7. If no jobs are found, return an empty jobs array

Return JSON in this exact format:
{
  "jobs": [${JSON.stringify(exampleJob, null, 2)}]
}`;

    const userPrompt = `Extract structured job information from the following search results. The user was searching for jobs with these criteria:
- Location: ${criteria.location || 'Any'}
- Job Types: ${criteria.jobTypes?.join(', ') || 'Any'}
- Schedule: ${criteria.schedule || 'Any'}
- Keywords: ${criteria.keywords?.join(', ') || 'None specified'}

Here are the search results from Perplexity:

${perplexityResults}

Please extract all jobs found and return them in the structured JSON format.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }

      const parsed: OpenAIJobParsingResponse = JSON.parse(content);

      logger.info('OpenAI successfully parsed jobs', {
        operation: 'openai_parse_jobs',
        jobCount: parsed.jobs?.length || 0
      });

      return parsed.jobs || [];
    } catch (error) {
      logger.error('OpenAI parsing failed', error, {
        operation: 'openai_parse_jobs'
      });
      throw new Error(`Failed to parse jobs with OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert structured jobs to InsertJobOpportunity format
   */
  private convertToJobOpportunities(structuredJobs: StructuredJob[]): InsertJobOpportunity[] {
    return structuredJobs.map(job => ({
      title: job.title,
      company: job.company,
      location: job.location,
      pay: job.pay,
      schedule: job.schedule,
      description: job.description,
      url: job.url || null,
      tags: job.tags,
      matchScore: null, // Will be calculated based on user preferences if needed
      timeAgo: 'Just now',
      isActive: true
    }));
  }
}

export const jobSearchService = new JobSearchService();

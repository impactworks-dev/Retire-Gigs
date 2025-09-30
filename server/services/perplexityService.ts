import { logger } from '../logger.js';

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations: string[];
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface JobSearchQuery {
  location?: string;
  jobTypes?: string[];
  schedule?: string;
  experienceLevel?: string;
  keywords?: string[];
  excludeKeywords?: string[];
}

class PerplexityService {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai/chat/completions';
  private model = 'sonar-pro';

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('Perplexity API key not found in environment variables');
    }
  }

  isServiceAvailable(): boolean {
    return !!this.apiKey;
  }

  async searchJobs(query: JobSearchQuery): Promise<string> {
    if (!this.isServiceAvailable()) {
      throw new Error('Perplexity API key not configured');
    }

    const searchPrompt = this.buildJobSearchPrompt(query);
    
    logger.info('Searching for jobs with Perplexity', {
      operation: 'perplexity_job_search',
      query: {
        location: query.location,
        jobTypes: query.jobTypes,
        schedule: query.schedule
      }
    });

    try {
      const messages: PerplexityMessage[] = [
        {
          role: 'system',
          content: 'You are a job search assistant. Search for current job opportunities and provide detailed, accurate information about each position. Focus on legitimate job postings with real companies, specific locations, and clear job requirements. Return results in a structured format.'
        },
        {
          role: 'user',
          content: searchPrompt
        }
      ];

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 2000,
          temperature: 0.2,
          top_p: 0.9,
          search_recency_filter: 'week',
          return_images: false,
          return_related_questions: false,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
      }

      const data: PerplexityResponse = await response.json();
      
      logger.info('Perplexity job search completed', {
        operation: 'perplexity_job_search',
        tokensUsed: data.usage.total_tokens,
        citationsCount: data.citations.length
      });

      return data.choices[0]?.message.content || '';
    } catch (error) {
      logger.error('Error in Perplexity job search', error, {
        operation: 'perplexity_job_search'
      });
      throw error;
    }
  }

  private buildJobSearchPrompt(query: JobSearchQuery): string {
    const parts: string[] = [];
    
    parts.push('Find current job opportunities for adults aged 55+ with the following criteria:');
    
    if (query.location) {
      parts.push(`- Location: ${query.location}`);
    }
    
    if (query.jobTypes && query.jobTypes.length > 0) {
      parts.push(`- Job types: ${query.jobTypes.join(', ')}`);
    }
    
    if (query.schedule) {
      parts.push(`- Schedule: ${query.schedule}`);
    }
    
    if (query.experienceLevel) {
      parts.push(`- Experience level: ${query.experienceLevel}`);
    }
    
    if (query.keywords && query.keywords.length > 0) {
      parts.push(`- Keywords: ${query.keywords.join(', ')}`);
    }
    
    if (query.excludeKeywords && query.excludeKeywords.length > 0) {
      parts.push(`- Exclude: ${query.excludeKeywords.join(', ')}`);
    }

    parts.push('');
    parts.push('For each job found, please provide:');
    parts.push('- Job title');
    parts.push('- Company name');
    parts.push('- Location (city, state or "Remote")');
    parts.push('- Pay/salary information');
    parts.push('- Schedule (full-time, part-time, flexible, etc.)');
    parts.push('- Brief job description (2-3 sentences)');
    parts.push('- How long ago it was posted');
    parts.push('- Key requirements or qualifications');
    parts.push('');
    parts.push('Focus on legitimate opportunities from reputable job boards like Indeed, AARP Job Board, USAJobs, LinkedIn, or company websites. Prioritize positions that are friendly to mature workers and offer flexibility.');

    return parts.join('\n');
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isServiceAvailable()) {
      return {
        success: false,
        message: 'Perplexity API key not configured'
      };
    }

    try {
      const messages: PerplexityMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Respond briefly to test the connection.'
        },
        {
          role: 'user',
          content: 'Hello, please confirm you can respond.'
        }
      ];

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 50,
          temperature: 0.1,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `API error: ${response.status} - ${errorText}`
        };
      }

      const data: PerplexityResponse = await response.json();
      
      return {
        success: true,
        message: `Connection successful. Response: ${data.choices[0]?.message.content || 'No response'}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export const perplexityService = new PerplexityService();
export type { JobSearchQuery };
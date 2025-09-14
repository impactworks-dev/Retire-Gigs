import { JSDOM } from 'jsdom';
import { logger } from '../logger';

// Content sanitization configuration
const SANITIZATION_CONFIG = {
  // Suspicious keywords that indicate non-job content
  SUSPICIOUS_KEYWORDS: [
    'saved search', 'search for', 'refine your search', 'please refine',
    'resumes limited', 'search features', 'sign in', 'create alert',
    'no results', 'try different', 'suggestions', 'sponsored',
    'advertisement', 'cookies', 'privacy', 'terms of', 'loading',
    'please wait', 'error occurred', 'page not found', '404',
    'javascript required', 'enable cookies', 'session expired',
    'maintenance mode', 'temporarily unavailable'
  ],

  // UI elements that should be filtered out
  UI_KEYWORDS: [
    'sort by', 'filter', 'view all', 'show more', 'load more',
    'pagination', 'page', 'next', 'previous', 'first', 'last',
    'breadcrumb', 'navigation', 'menu', 'header', 'footer',
    'sidebar', 'advertisement', 'sponsored content'
  ],

  // Title validation rules
  TITLE_RULES: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 200,
    INVALID_PATTERNS: [
      /^[\s\-_.]*$/, // Only whitespace or punctuation
      /^(page|error|loading|please)/i,
      /^https?:\/\//, // URLs
      /^www\./i, // Website addresses
      /^[0-9]+$/, // Only numbers
    ]
  },

  // Company validation rules  
  COMPANY_RULES: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 150,
    INVALID_PATTERNS: [
      /^[\s\-_.]*$/,
      /^(unknown|n\/a|na|null|undefined|error)/i,
      /^https?:\/\//,
      /^www\./i,
    ]
  },

  // Location validation rules
  LOCATION_RULES: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 100,
    VALID_PATTERNS: [
      /^[a-z\s,.-]+,\s*[a-z]{2,}$/i, // City, State/Country
      /^remote$/i,
      /^[a-z\s-]+$/i, // Simple location name
    ]
  }
};

export interface SanitizedJobData {
  title: string;
  company: string;
  location: string;
  description: string;
  pay?: string;
  schedule?: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface SanitizationResult {
  original: any;
  sanitized: SanitizedJobData;
  qualityScore: number;
  warnings: string[];
}

export class ContentSanitizer {
  /**
   * Sanitize and validate scraped job content
   */
  static sanitizeJobContent(rawJobData: any): SanitizationResult {
    const warnings: string[] = [];
    const validationErrors: string[] = [];
    
    try {
      // Extract and clean basic fields
      const title = this.cleanTitle(rawJobData.title || '');
      const company = this.cleanCompany(rawJobData.company || '');
      const location = this.cleanLocation(rawJobData.location || '');
      const description = this.cleanDescription(rawJobData.description || '');
      const pay = this.cleanPay(rawJobData.pay || '');
      const schedule = this.cleanSchedule(rawJobData.schedule || '');

      // Validate each field
      const titleValidation = this.validateTitle(title);
      const companyValidation = this.validateCompany(company);
      const locationValidation = this.validateLocation(location);

      if (!titleValidation.isValid) {
        validationErrors.push(...titleValidation.errors);
      }
      if (!companyValidation.isValid) {
        validationErrors.push(...companyValidation.errors);
      }
      if (!locationValidation.isValid) {
        validationErrors.push(...locationValidation.errors);
      }

      // Check for suspicious content
      const suspiciousCheck = this.checkSuspiciousContent(title, company, description);
      if (suspiciousCheck.isSuspicious) {
        validationErrors.push(`Contains suspicious content: ${suspiciousCheck.reasons.join(', ')}`);
        warnings.push(...suspiciousCheck.reasons);
      }

      // Calculate quality score
      const qualityScore = this.calculateQualityScore({
        title,
        company,
        location,
        description,
        pay,
        schedule
      }, validationErrors.length);

      const sanitized: SanitizedJobData = {
        title,
        company,
        location,
        description,
        pay,
        schedule,
        isValid: validationErrors.length === 0 && qualityScore >= 70,
        validationErrors
      };

      return {
        original: rawJobData,
        sanitized,
        qualityScore,
        warnings
      };

    } catch (error) {
      logger.error('Error during content sanitization', error);
      return {
        original: rawJobData,
        sanitized: {
          title: '',
          company: '',
          location: '',
          description: '',
          isValid: false,
          validationErrors: ['Sanitization failed due to error']
        },
        qualityScore: 0,
        warnings: ['Sanitization error occurred']
      };
    }
  }

  /**
   * Clean and sanitize job title
   */
  private static cleanTitle(rawTitle: string): string {
    if (!rawTitle || typeof rawTitle !== 'string') return '';

    let cleaned = rawTitle;

    // Remove HTML tags
    cleaned = this.stripHtmlTags(cleaned);
    
    // Remove markdown formatting
    cleaned = this.stripMarkdown(cleaned);
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Remove leading/trailing punctuation
    cleaned = cleaned.replace(/^[^\w\s]+|[^\w\s]+$/g, '');
    
    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');
    
    // Handle common encoding issues
    cleaned = this.fixEncodingIssues(cleaned);
    
    return cleaned.trim();
  }

  /**
   * Clean and sanitize company name
   */
  private static cleanCompany(rawCompany: string): string {
    if (!rawCompany || typeof rawCompany !== 'string') return '';

    let cleaned = rawCompany;

    // Remove HTML tags
    cleaned = this.stripHtmlTags(cleaned);
    
    // Remove markdown formatting  
    cleaned = this.stripMarkdown(cleaned);
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Remove common prefixes/suffixes that aren't part of company name
    cleaned = cleaned.replace(/^(company:|employer:|hiring:|posted by:)/i, '');
    cleaned = cleaned.replace(/(- job posting|careers|jobs)$/i, '');
    
    // Handle encoding issues
    cleaned = this.fixEncodingIssues(cleaned);
    
    return cleaned.trim();
  }

  /**
   * Clean and sanitize location
   */
  private static cleanLocation(rawLocation: string): string {
    if (!rawLocation || typeof rawLocation !== 'string') return '';

    let cleaned = rawLocation;

    // Remove HTML tags
    cleaned = this.stripHtmlTags(cleaned);
    
    // Remove markdown formatting
    cleaned = this.stripMarkdown(cleaned);
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Standardize remote work indicators
    if (/remote|work from home|wfh|telecommute/i.test(cleaned)) {
      cleaned = 'Remote';
    }
    
    // Handle encoding issues
    cleaned = this.fixEncodingIssues(cleaned);
    
    return cleaned.trim();
  }

  /**
   * Clean and sanitize job description
   */
  private static cleanDescription(rawDescription: string): string {
    if (!rawDescription || typeof rawDescription !== 'string') return '';

    let cleaned = rawDescription;

    // Remove HTML tags but preserve some structure
    cleaned = this.stripHtmlTags(cleaned, true);
    
    // Remove markdown formatting
    cleaned = this.stripMarkdown(cleaned);
    
    // Remove extra whitespace but preserve line breaks
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');
    
    // Handle encoding issues
    cleaned = this.fixEncodingIssues(cleaned);
    
    // Trim to reasonable length
    if (cleaned.length > 2000) {
      cleaned = cleaned.substring(0, 2000) + '...';
    }
    
    return cleaned.trim();
  }

  /**
   * Clean pay information
   */
  private static cleanPay(rawPay: string): string {
    if (!rawPay || typeof rawPay !== 'string') return '';

    let cleaned = rawPay;
    cleaned = this.stripHtmlTags(cleaned);
    cleaned = this.stripMarkdown(cleaned);
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = this.fixEncodingIssues(cleaned);
    
    return cleaned.trim();
  }

  /**
   * Clean schedule information
   */
  private static cleanSchedule(rawSchedule: string): string {
    if (!rawSchedule || typeof rawSchedule !== 'string') return '';

    let cleaned = rawSchedule;
    cleaned = this.stripHtmlTags(cleaned);
    cleaned = this.stripMarkdown(cleaned);
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = this.fixEncodingIssues(cleaned);
    
    return cleaned.trim();
  }

  /**
   * Strip HTML tags from content
   */
  private static stripHtmlTags(content: string, preserveStructure = false): string {
    try {
      const dom = new JSDOM(content);
      if (preserveStructure) {
        // Convert some tags to text equivalents
        const body = dom.window.document.body;
        body.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        body.querySelectorAll('p, div').forEach(elem => {
          elem.insertAdjacentText('afterend', '\n');
        });
        return body.textContent || '';
      } else {
        return dom.window.document.body.textContent || '';
      }
    } catch (error) {
      // Fallback: simple regex replacement
      return content.replace(/<[^>]*>/g, '');
    }
  }

  /**
   * Strip markdown formatting
   */
  private static stripMarkdown(content: string): string {
    return content
      .replace(/#{1,6}\s+/g, '') // Headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/~~([^~]+)~~/g, '$1') // Strikethrough
      .replace(/`([^`]+)`/g, '$1') // Inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Images
      .replace(/^[\s]*[-*+]\s+/gm, '') // List items
      .replace(/^\s*\d+\.\s+/gm, '') // Numbered lists
      .replace(/^\s*>\s+/gm, ''); // Blockquotes
  }

  /**
   * Fix common encoding issues
   */
  private static fixEncodingIssues(content: string): string {
    return content
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00A0/g, ' ') // Non-breaking space
      .replace(/\u2013/g, '-') // En dash
      .replace(/\u2014/g, '-') // Em dash
      .replace(/\u2019/g, "'") // Right single quotation
      .replace(/\u201C/g, '"') // Left double quotation
      .replace(/\u201D/g, '"'); // Right double quotation
  }

  /**
   * Validate job title
   */
  private static validateTitle(title: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!title || title.length < SANITIZATION_CONFIG.TITLE_RULES.MIN_LENGTH) {
      errors.push('Title too short');
    }
    
    if (title.length > SANITIZATION_CONFIG.TITLE_RULES.MAX_LENGTH) {
      errors.push('Title too long');
    }
    
    for (const pattern of SANITIZATION_CONFIG.TITLE_RULES.INVALID_PATTERNS) {
      if (pattern.test(title)) {
        errors.push('Title contains invalid pattern');
        break;
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate company name
   */
  private static validateCompany(company: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!company || company.length < SANITIZATION_CONFIG.COMPANY_RULES.MIN_LENGTH) {
      errors.push('Company name too short');
    }
    
    if (company.length > SANITIZATION_CONFIG.COMPANY_RULES.MAX_LENGTH) {
      errors.push('Company name too long');
    }
    
    for (const pattern of SANITIZATION_CONFIG.COMPANY_RULES.INVALID_PATTERNS) {
      if (pattern.test(company)) {
        errors.push('Company name contains invalid pattern');
        break;
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate location
   */
  private static validateLocation(location: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!location || location.length < SANITIZATION_CONFIG.LOCATION_RULES.MIN_LENGTH) {
      errors.push('Location too short');
    }
    
    if (location.length > SANITIZATION_CONFIG.LOCATION_RULES.MAX_LENGTH) {
      errors.push('Location too long');
    }
    
    // Check if location matches at least one valid pattern
    const hasValidPattern = SANITIZATION_CONFIG.LOCATION_RULES.VALID_PATTERNS.some(pattern => 
      pattern.test(location)
    );
    
    if (!hasValidPattern) {
      errors.push('Location format not recognized');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Check for suspicious content that indicates non-job data
   */
  private static checkSuspiciousContent(title: string, company: string, description: string): {
    isSuspicious: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    const content = `${title} ${company} ${description}`.toLowerCase();
    
    // Check for suspicious keywords
    for (const keyword of SANITIZATION_CONFIG.SUSPICIOUS_KEYWORDS) {
      if (content.includes(keyword)) {
        reasons.push(`Contains suspicious keyword: "${keyword}"`);
      }
    }
    
    // Check for UI keywords
    for (const keyword of SANITIZATION_CONFIG.UI_KEYWORDS) {
      if (content.includes(keyword)) {
        reasons.push(`Contains UI element: "${keyword}"`);
      }
    }
    
    return {
      isSuspicious: reasons.length > 0,
      reasons
    };
  }

  /**
   * Calculate quality score for job data (0-100)
   */
  private static calculateQualityScore(
    jobData: { title: string; company: string; location: string; description: string; pay?: string; schedule?: string },
    errorCount: number
  ): number {
    let score = 100;
    
    // Deduct points for validation errors
    score -= errorCount * 20;
    
    // Check field completeness and quality
    if (!jobData.title || jobData.title.length < 5) score -= 30;
    if (!jobData.company || jobData.company.length < 2) score -= 20;
    if (!jobData.location || jobData.location.length < 2) score -= 10;
    if (!jobData.description || jobData.description.length < 20) score -= 10;
    
    // Bonus for additional fields
    if (jobData.pay && jobData.pay.length > 2) score += 5;
    if (jobData.schedule && jobData.schedule.length > 2) score += 5;
    
    // Ensure score is within bounds
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Batch sanitize multiple job entries
   */
  static sanitizeBatch(rawJobsData: any[]): SanitizationResult[] {
    return rawJobsData.map(jobData => this.sanitizeJobContent(jobData));
  }

  /**
   * Get sanitization statistics for a batch
   */
  static getBatchStats(results: SanitizationResult[]): {
    total: number;
    valid: number;
    invalid: number;
    averageQuality: number;
    commonIssues: { issue: string; count: number }[];
  } {
    const total = results.length;
    const valid = results.filter(r => r.sanitized.isValid).length;
    const invalid = total - valid;
    const averageQuality = results.reduce((sum, r) => sum + r.qualityScore, 0) / total;
    
    // Count common issues
    const issueCount: Record<string, number> = {};
    results.forEach(result => {
      result.sanitized.validationErrors.forEach(error => {
        issueCount[error] = (issueCount[error] || 0) + 1;
      });
      result.warnings.forEach(warning => {
        issueCount[warning] = (issueCount[warning] || 0) + 1;
      });
    });
    
    const commonIssues = Object.entries(issueCount)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      total,
      valid,
      invalid,
      averageQuality: Math.round(averageQuality * 100) / 100,
      commonIssues
    };
  }
}
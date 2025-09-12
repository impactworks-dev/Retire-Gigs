import mammoth from 'mammoth';
import { Storage } from '@google-cloud/storage';
import { z } from 'zod';
import { malwareScannerService, type MalwareScanResult } from './malwareScanner';

// Security constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

// SECURITY: Allowed bucket names to prevent unauthorized access
const ALLOWED_BUCKET_NAMES = [
  'replit-object-storage', // Default Replit bucket
  'replit-uploads', // Alternative bucket name
  // Add other trusted bucket names as needed
];
const MAX_EXTRACTED_TEXT_LENGTH = 100000; // 100KB text limit
const ALLOWED_CONTENT_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/pdf', // .pdf
  'text/plain' // .txt
];
const ALLOWED_FILE_EXTENSIONS = ['.docx', '.pdf', '.txt'];

// File header signatures for validation
const FILE_SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4B, 0x03, 0x04], // DOCX (ZIP signature)
  txt: null // No specific signature for plain text
};

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

interface ParsedResumeData {
  title: string;
  summary?: string;
  skills: string[];
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }>;
  workExperience: Array<{
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    date: string;
  }>;
  achievements: string[];
}

export class ResumeParserService {
  
  async parseResumeFromUrl(uploadUrl: string): Promise<ParsedResumeData> {
    try {
      // Extract bucket and object name from upload URL
      const url = new URL(uploadUrl);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      const bucketName = pathParts[0];
      
      // SECURITY: Validate bucket name against allowed list
      if (!ALLOWED_BUCKET_NAMES.includes(bucketName)) {
        throw new Error(`Unauthorized bucket access: ${bucketName}. Only trusted buckets are allowed.`);
      }
      const objectName = pathParts.slice(1).join('/');

      console.log('Parsing resume from:', bucketName, objectName);

      // Download file from object storage
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      // SECURITY: Check file size before downloading
      const [metadata] = await file.getMetadata();
      const fileSize = typeof metadata.size === 'string' ? parseInt(metadata.size || '0') : (metadata.size || 0);
      
      if (fileSize > MAX_FILE_SIZE) {
        throw new Error(`File size ${fileSize} bytes exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`);
      }
      
      const [buffer] = await file.download();
      
      // SECURITY: Perform malware scanning before processing
      console.log('Performing malware scan on uploaded file...');
      let scanResult: MalwareScanResult;
      try {
        scanResult = await malwareScannerService.scanBuffer(buffer, objectName);
        console.log('Malware scan result:', {
          isClean: scanResult.isClean,
          virusCount: scanResult.viruses.length,
          scanTime: scanResult.scanTime
        });
        
        if (scanResult.isInfected) {
          throw new Error(`File rejected: Malware detected - ${scanResult.viruses.join(', ')}`);
        }
      } catch (scanError) {
        console.error('Malware scanning failed:', scanError);
        throw new Error(`Security scan failed: ${scanError instanceof Error ? scanError.message : 'Unknown scanning error'}`);
      }
      
      // SECURITY: Validate content type
      const contentType = metadata.contentType || '';
      console.log('File content type:', contentType, 'Size:', fileSize, 'Scan result: CLEAN');
      
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw new Error(`Unsupported file type: ${contentType}. Only DOCX, PDF, and TXT files are allowed.`);
      }
      
      // SECURITY: Validate file extension
      const fileExtension = objectName.toLowerCase().substring(objectName.lastIndexOf('.'));
      if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
        throw new Error(`Unsupported file extension: ${fileExtension}. Only .docx, .pdf, and .txt files are allowed.`);
      }
      
      // SECURITY: Validate file header signatures and enhanced TXT validation
      this.validateFileHeader(buffer, fileExtension, contentType);
      
      // SECURITY: Additional validation for TXT files
      if (fileExtension === '.txt') {
        this.validateTxtFileContent(buffer);
      }
      
      // Determine secure file type
      let fileType = '';
      if (contentType === 'application/pdf') {
        fileType = 'pdf';
      } else if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        fileType = 'docx';
      } else if (contentType === 'text/plain') {
        fileType = 'txt';
      } else {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      let extractedText = '';

      // Extract text based on validated file type
      if (fileType === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (fileType === 'pdf') {
        // Basic PDF text extraction (limited functionality)
        const text = buffer.toString('latin1');
        extractedText = text.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ');
      } else if (fileType === 'txt') {
        extractedText = buffer.toString('utf8');
      }

      // SECURITY: Cap extracted text length to prevent memory exhaustion
      if (extractedText.length > MAX_EXTRACTED_TEXT_LENGTH) {
        console.warn(`Extracted text length ${extractedText.length} exceeds limit, truncating to ${MAX_EXTRACTED_TEXT_LENGTH}`);
        extractedText = extractedText.substring(0, MAX_EXTRACTED_TEXT_LENGTH);
      }

      console.log('Extracted text length:', extractedText.length);

      // SECURITY: Sanitize extracted text before processing
      const sanitizedText = this.sanitizeExtractedText(extractedText);

      // Parse the sanitized text
      return this.parseTextContent(sanitizedText);

    } catch (error) {
      console.error('Error parsing resume:', error);
      if (error instanceof Error) {
        throw error; // Re-throw security validation errors with specific messages
      }
      throw new Error('Failed to parse resume file');
    }
  }

  // SECURITY: Validate file header signatures to detect malicious files
  private validateFileHeader(buffer: Buffer, fileExtension: string, contentType: string): void {
    if (buffer.length < 4) {
      throw new Error('File is too small to be a valid document');
    }

    const header = Array.from(buffer.slice(0, 4));
    
    if (fileExtension === '.pdf' && contentType === 'application/pdf') {
      const pdfSignature = FILE_SIGNATURES.pdf;
      if (!pdfSignature.every((byte, index) => header[index] === byte)) {
        throw new Error('File does not have a valid PDF header signature');
      }
    } else if (fileExtension === '.docx' && contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const docxSignature = FILE_SIGNATURES.docx;
      if (!docxSignature.every((byte, index) => header[index] === byte)) {
        throw new Error('File does not have a valid DOCX header signature');
      }
    }
    // TXT files don't have a specific signature, so we skip validation for them
  }

  // SECURITY: Sanitize extracted text to prevent injection attacks while preserving formatting
  private sanitizeExtractedText(text: string): string {
    // Remove control characters except newlines, carriage returns, and tabs
    let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
    
    // Remove potentially dangerous HTML/XML characters but preserve structure
    sanitized = sanitized.replace(/[<>"'&]/g, ' ');
    
    // FIXED: Preserve newlines and paragraphs for better parsing
    // Normalize multiple spaces within lines but keep line breaks
    sanitized = sanitized
      .split('\n')
      .map(line => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n'); // Limit excessive newlines
    
    // Limit line length to prevent extremely long lines
    const lines = sanitized.split('\n').map(line => 
      line.length > 1000 ? line.substring(0, 1000) + '...' : line
    );
    
    return lines.join('\n');
  }

  // SECURITY: Enhanced TXT file validation
  private validateTxtFileContent(buffer: Buffer): void {
    // Check if file is actually a text file by analyzing content
    const text = buffer.toString('utf8', 0, Math.min(buffer.length, 1024)); // Check first 1KB
    
    // Calculate percentage of printable characters
    const printableChars = text.match(/[\x20-\x7E\n\r\t]/g) || [];
    const printableRatio = printableChars.length / text.length;
    
    if (printableRatio < 0.85) {
      throw new Error('TXT file contains too much non-printable content. File may be corrupted or malicious.');
    }
    
    // Check for suspicious binary content that might indicate an executable disguised as TXT
    const suspiciousBinaryPatterns = [
      /\x00{10,}/, // Long sequences of null bytes
      /[\x80-\xFF]{20,}/, // Long sequences of high-bit characters
      /\x7F\x45\x4C\x46/, // ELF magic number
      /\x4D\x5A/, // MZ header (PE executable)
    ];
    
    for (const pattern of suspiciousBinaryPatterns) {
      if (pattern.test(text)) {
        throw new Error('TXT file contains suspicious binary content. This may be an executable file disguised as text.');
      }
    }
    
    console.log(`TXT file validation passed: ${printableRatio * 100}% printable characters`);
  }

  private parseTextContent(text: string): ParsedResumeData {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const result: ParsedResumeData = {
      title: 'Uploaded Resume',
      summary: '',
      skills: [],
      education: [],
      workExperience: [],
      certifications: [],
      achievements: []
    };

    // Extract name/title from the first few lines
    if (lines.length > 0) {
      const firstLine = lines[0];
      if (firstLine.length < 50 && !firstLine.includes('@')) {
        result.title = `${firstLine}'s Resume`;
      }
    }

    // Find sections and extract data
    let currentSection = '';
    let sectionContent: string[] = [];

    const sectionKeywords = {
      summary: ['summary', 'objective', 'profile', 'about'],
      education: ['education', 'academic', 'university', 'college', 'degree'],
      experience: ['experience', 'employment', 'work', 'career', 'professional'],
      skills: ['skills', 'competencies', 'technologies', 'expertise'],
      certifications: ['certifications', 'certificates', 'licensed'],
      achievements: ['achievements', 'accomplishments', 'awards', 'honors']
    };

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Check if this line is a section header
      let newSection = '';
      for (const [section, keywords] of Object.entries(sectionKeywords)) {
        if (keywords.some(keyword => lowerLine.includes(keyword) && line.length < 30)) {
          newSection = section;
          break;
        }
      }

      if (newSection) {
        // Process previous section
        if (currentSection && sectionContent.length > 0) {
          this.processSectionContent(currentSection, sectionContent, result);
        }
        currentSection = newSection;
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }

    // Process the last section
    if (currentSection && sectionContent.length > 0) {
      this.processSectionContent(currentSection, sectionContent, result);
    }

    // Extract skills from the entire text if not found in a specific section
    if (result.skills.length === 0) {
      result.skills = this.extractSkillsFromText(text);
    }

    return result;
  }

  private processSectionContent(section: string, content: string[], result: ParsedResumeData) {
    const text = content.join(' ');

    switch (section) {
      case 'summary':
        result.summary = text.substring(0, 500); // Limit summary length
        break;

      case 'skills':
        result.skills = this.extractSkillsFromText(text);
        break;

      case 'education':
        result.education = this.extractEducation(content);
        break;

      case 'experience':
        result.workExperience = this.extractWorkExperience(content);
        break;

      case 'certifications':
        result.certifications = this.extractCertifications(content);
        break;

      case 'achievements':
        result.achievements = content.filter(line => line.length > 10).slice(0, 10);
        break;
    }
  }

  private extractSkillsFromText(text: string): string[] {
    const skillPatterns = [
      // Programming languages
      /\b(JavaScript|Python|Java|C\+\+|C#|PHP|Ruby|Swift|Kotlin|Go|Rust|TypeScript)\b/gi,
      // Frameworks/Libraries
      /\b(React|Angular|Vue|Node\.js|Express|Django|Flask|Spring|Laravel|Rails)\b/gi,
      // Databases
      /\b(MySQL|PostgreSQL|MongoDB|Redis|SQLite|Oracle|SQL Server)\b/gi,
      // Tools/Platforms
      /\b(Git|Docker|Kubernetes|AWS|Azure|GCP|Jenkins|Jira|Slack)\b/gi,
      // General skills
      /\b(Leadership|Management|Communication|Teamwork|Problem Solving|Project Management)\b/gi
    ];

    const skills = new Set<string>();
    
    for (const pattern of skillPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => skills.add(match.trim()));
      }
    }

    return Array.from(skills).slice(0, 20); // Limit to 20 skills
  }

  private extractEducation(content: string[]): Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
  }> {
    const education = [];
    
    for (let i = 0; i < content.length; i++) {
      const line = content[i];
      
      // Look for degree patterns
      if (/\b(bachelor|master|phd|doctorate|associate|diploma|certificate)\b/i.test(line)) {
        const institution = this.findInstitution(content, i);
        const dates = this.extractDates(line + ' ' + (content[i + 1] || ''));
        
        education.push({
          institution: institution || 'Unknown Institution',
          degree: line.trim(),
          field: '',
          startDate: dates.start,
          endDate: dates.end
        });
      }
    }

    return education.slice(0, 5); // Limit to 5 education entries
  }

  private extractWorkExperience(content: string[]): Array<{
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    description: string;
  }> {
    const experience = [];
    
    for (let i = 0; i < content.length; i++) {
      const line = content[i];
      
      // Look for position/company patterns
      if (line.length > 5 && line.length < 100 && !line.includes('.') && 
          !/^\d/.test(line) && /[A-Z]/.test(line)) {
        
        const nextLines = content.slice(i + 1, i + 4);
        const dates = this.extractDates(nextLines.join(' '));
        const company = this.findCompanyName(nextLines);
        
        experience.push({
          company: company || 'Unknown Company',
          position: line.trim(),
          startDate: dates.start,
          endDate: dates.end,
          description: nextLines.slice(1).join('. ').substring(0, 200)
        });
      }
    }

    return experience.slice(0, 10); // Limit to 10 work experiences
  }

  private extractCertifications(content: string[]): Array<{
    name: string;
    issuer: string;
    date: string;
  }> {
    const certifications = [];
    
    for (const line of content) {
      if (line.length > 5 && line.length < 100) {
        const dates = this.extractDates(line);
        
        certifications.push({
          name: line.trim(),
          issuer: 'Unknown Issuer',
          date: dates.end || dates.start
        });
      }
    }

    return certifications.slice(0, 10); // Limit to 10 certifications
  }

  private findInstitution(content: string[], index: number): string | null {
    // Look for institution names in nearby lines
    for (let i = Math.max(0, index - 2); i <= Math.min(content.length - 1, index + 2); i++) {
      const line = content[i];
      if (/\b(university|college|institute|school|academy)\b/i.test(line)) {
        return line.trim();
      }
    }
    return null;
  }

  private findCompanyName(lines: string[]): string | null {
    for (const line of lines) {
      if (line.length > 3 && line.length < 50 && 
          !/\d{4}/.test(line) && // Doesn't contain years
          /[A-Z]/.test(line)) { // Contains capital letters
        return line.trim();
      }
    }
    return null;
  }

  private extractDates(text: string): { start: string; end: string } {
    // Look for date patterns like "2020-2023", "Jan 2020 - Dec 2023", etc.
    const datePattern = /(\d{4}|\w{3,9}\s+\d{4})/g;
    const matches = text.match(datePattern);
    
    if (matches && matches.length >= 2) {
      return {
        start: matches[0],
        end: matches[1]
      };
    } else if (matches && matches.length === 1) {
      return {
        start: '',
        end: matches[0]
      };
    }
    
    return { start: '', end: '' };
  }
}
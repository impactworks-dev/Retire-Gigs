import mammoth from 'mammoth';
import { Storage } from '@google-cloud/storage';

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
      const objectName = pathParts.slice(1).join('/');

      console.log('Parsing resume from:', bucketName, objectName);

      // Download file from object storage
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const [buffer] = await file.download();
      const fileName = objectName.toLowerCase();

      let extractedText = '';

      // Extract text based on file type
      if (fileName.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (fileName.endsWith('.doc')) {
        // For .doc files, we'll do basic text extraction
        extractedText = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r]/g, ' ');
      } else if (fileName.endsWith('.pdf')) {
        // For PDF files, we'll extract basic text (limited functionality without pdf-parse)
        // This is a simple fallback - for better PDF parsing, a different approach would be needed
        const text = buffer.toString('utf8');
        extractedText = text.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ');
      } else {
        throw new Error('Unsupported file format');
      }

      console.log('Extracted text length:', extractedText.length);

      // Parse the extracted text
      return this.parseTextContent(extractedText);

    } catch (error) {
      console.error('Error parsing resume:', error);
      throw new Error('Failed to parse resume file');
    }
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
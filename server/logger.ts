// Structured logging utility for better observability and debugging
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info', 
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogContext {
  userId?: string;
  requestId?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

class Logger {
  private formatLogEntry(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context
    };
    return JSON.stringify(logEntry);
  }

  // Sanitize data to remove PII
  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    
    // Remove or hash PII fields
    const piiFields = [
      'email', 'firstName', 'lastName', 'streetAddress', 'address',
      'phone', 'phoneNumber', 'socialSecurityNumber', 'ssn'
    ];
    
    for (const field of piiFields) {
      if (sanitized[field]) {
        // Keep only first letter and length for debugging
        const value = String(sanitized[field]);
        sanitized[field] = `${value.charAt(0)}***[${value.length}]`;
      }
    }

    // Sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }

  debug(message: string, context?: LogContext): void {
    const sanitizedContext = context ? this.sanitizeData(context) : undefined;
    console.debug(this.formatLogEntry(LogLevel.DEBUG, message, sanitizedContext));
  }

  info(message: string, context?: LogContext): void {
    const sanitizedContext = context ? this.sanitizeData(context) : undefined;
    console.log(this.formatLogEntry(LogLevel.INFO, message, sanitizedContext));
  }

  warn(message: string, context?: LogContext): void {
    const sanitizedContext = context ? this.sanitizeData(context) : undefined;
    console.warn(this.formatLogEntry(LogLevel.WARN, message, sanitizedContext));
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error?.message || String(error),
      stack: error?.stack,
    };
    const sanitizedContext = this.sanitizeData(errorContext);
    console.error(this.formatLogEntry(LogLevel.ERROR, message, sanitizedContext));
  }

  // Specific method for geocoding to avoid PII exposure
  geocodeLog(message: string, addressType: 'partial' | 'full' | 'none', context?: LogContext): void {
    const sanitizedContext = {
      ...context,
      addressType,
      hasStreetAddress: !!(context as any)?.streetAddress,
      hasCity: !!(context as any)?.city,
      hasState: !!(context as any)?.state,
      hasZipCode: !!(context as any)?.zipCode,
    };
    this.info(message, sanitizedContext);
  }

  // Method to log operation performance
  performance(operation: string, duration: number, success: boolean, context?: LogContext): void {
    this.info(`Operation completed`, {
      ...context,
      operation,
      duration,
      success,
      performance: true
    });
  }
}

export const logger = new Logger();

// Legacy wrapper for gradual migration
export function log(message: string, source = "express"): void {
  logger.info(message, { source, legacy: true });
}
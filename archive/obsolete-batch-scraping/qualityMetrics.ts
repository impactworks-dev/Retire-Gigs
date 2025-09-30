import { logger } from '../logger';

// Quality metrics tracking for job parsing improvements
export interface JobQualityMetrics {
  sessionId: string;
  timestamp: Date;
  site: string;
  totalParsed: number;
  validJobs: number;
  invalidJobs: number;
  qualityScore: number;
  commonErrors: { error: string; count: number }[];
  parsingMethod: 'DOM' | 'markdown' | 'fallback';
  averageProcessingTime: number;
}

export interface QualityTrend {
  date: string;
  averageQuality: number;
  totalJobs: number;
  validJobs: number;
  topSites: { site: string; quality: number }[];
}

export interface ValidationStats {
  titleValidationFailures: number;
  companyValidationFailures: number;
  locationValidationFailures: number;
  suspiciousContentDetected: number;
  htmlSanitizationRequired: number;
  markdownCleaningRequired: number;
}

export class QualityMetricsTracker {
  private static metrics: JobQualityMetrics[] = [];
  private static maxStoredMetrics = 1000; // Keep last 1000 metrics in memory

  /**
   * Record quality metrics for a job parsing session
   */
  static recordMetrics(metrics: JobQualityMetrics): void {
    try {
      // Add to in-memory storage
      this.metrics.push(metrics);
      
      // Keep only recent metrics to prevent memory bloat
      if (this.metrics.length > this.maxStoredMetrics) {
        this.metrics = this.metrics.slice(-this.maxStoredMetrics);
      }

      // Log quality metrics for monitoring
      logger.info('Job parsing quality metrics recorded', {
        operation: 'recordJobQualityMetrics',
        sessionId: metrics.sessionId,
        site: metrics.site,
        qualityScore: metrics.qualityScore,
        validJobs: metrics.validJobs,
        totalParsed: metrics.totalParsed,
        parsingMethod: metrics.parsingMethod,
        processingTime: metrics.averageProcessingTime
      });

      // Log quality alerts for significant issues
      if (metrics.qualityScore < 50) {
        logger.warn('Low job parsing quality detected', {
          operation: 'lowQualityAlert',
          sessionId: metrics.sessionId,
          site: metrics.site,
          qualityScore: metrics.qualityScore,
          commonErrors: metrics.commonErrors.slice(0, 3),
          recommendation: 'Review parsing logic and site-specific selectors'
        });
      }

      // Log successful quality improvements
      if (metrics.qualityScore >= 80) {
        logger.info('High job parsing quality achieved', {
          operation: 'highQualityAlert',
          sessionId: metrics.sessionId,
          site: metrics.site,
          qualityScore: metrics.qualityScore,
          validJobs: metrics.validJobs,
          totalParsed: metrics.totalParsed
        });
      }

    } catch (error) {
      logger.error('Error recording quality metrics', error, {
        operation: 'recordJobQualityMetrics',
        sessionId: metrics.sessionId
      });
    }
  }

  /**
   * Get quality statistics for a specific time period
   */
  static getQualityStats(hours: number = 24): {
    averageQuality: number;
    totalSessions: number;
    totalJobsParsed: number;
    totalValidJobs: number;
    siteBreakdown: { site: string; quality: number; jobs: number }[];
    trendData: QualityTrend[];
  } {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    if (recentMetrics.length === 0) {
      return {
        averageQuality: 0,
        totalSessions: 0,
        totalJobsParsed: 0,
        totalValidJobs: 0,
        siteBreakdown: [],
        trendData: []
      };
    }

    const totalJobsParsed = recentMetrics.reduce((sum, m) => sum + m.totalParsed, 0);
    const totalValidJobs = recentMetrics.reduce((sum, m) => sum + m.validJobs, 0);
    const averageQuality = recentMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / recentMetrics.length;

    // Site breakdown
    const siteStats: Record<string, { quality: number; jobs: number; sessions: number }> = {};
    recentMetrics.forEach(m => {
      if (!siteStats[m.site]) {
        siteStats[m.site] = { quality: 0, jobs: 0, sessions: 0 };
      }
      siteStats[m.site].quality += m.qualityScore;
      siteStats[m.site].jobs += m.totalParsed;
      siteStats[m.site].sessions += 1;
    });

    const siteBreakdown = Object.entries(siteStats).map(([site, stats]) => ({
      site,
      quality: Math.round(stats.quality / stats.sessions),
      jobs: stats.jobs
    })).sort((a, b) => b.quality - a.quality);

    // Trend data (grouped by hour)
    const trendData: QualityTrend[] = [];
    const hourlyGroups: Record<string, JobQualityMetrics[]> = {};
    
    recentMetrics.forEach(m => {
      const hour = m.timestamp.toISOString().slice(0, 13) + ':00:00Z';
      if (!hourlyGroups[hour]) {
        hourlyGroups[hour] = [];
      }
      hourlyGroups[hour].push(m);
    });

    Object.entries(hourlyGroups).forEach(([hour, metrics]) => {
      const hourTotalJobs = metrics.reduce((sum, m) => sum + m.totalParsed, 0);
      const hourValidJobs = metrics.reduce((sum, m) => sum + m.validJobs, 0);
      const hourAverageQuality = metrics.reduce((sum, m) => sum + m.qualityScore, 0) / metrics.length;

      const hourTopSites = Object.entries(
        metrics.reduce((acc, m) => {
          if (!acc[m.site]) acc[m.site] = [];
          acc[m.site].push(m.qualityScore);
          return acc;
        }, {} as Record<string, number[]>)
      ).map(([site, qualities]) => ({
        site,
        quality: Math.round(qualities.reduce((sum, q) => sum + q, 0) / qualities.length)
      })).sort((a, b) => b.quality - a.quality).slice(0, 3);

      trendData.push({
        date: hour,
        averageQuality: Math.round(hourAverageQuality * 100) / 100,
        totalJobs: hourTotalJobs,
        validJobs: hourValidJobs,
        topSites: hourTopSites
      });
    });

    return {
      averageQuality: Math.round(averageQuality * 100) / 100,
      totalSessions: recentMetrics.length,
      totalJobsParsed,
      totalValidJobs,
      siteBreakdown,
      trendData: trendData.sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  /**
   * Get validation statistics for debugging
   */
  static getValidationStats(hours: number = 24): ValidationStats {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    const stats: ValidationStats = {
      titleValidationFailures: 0,
      companyValidationFailures: 0,
      locationValidationFailures: 0,
      suspiciousContentDetected: 0,
      htmlSanitizationRequired: 0,
      markdownCleaningRequired: 0
    };

    // Analyze common errors to build validation stats
    recentMetrics.forEach(metric => {
      metric.commonErrors.forEach(error => {
        const errorText = error.error.toLowerCase();
        
        if (errorText.includes('title')) {
          stats.titleValidationFailures += error.count;
        }
        if (errorText.includes('company')) {
          stats.companyValidationFailures += error.count;
        }
        if (errorText.includes('location')) {
          stats.locationValidationFailures += error.count;
        }
        if (errorText.includes('suspicious')) {
          stats.suspiciousContentDetected += error.count;
        }
        if (errorText.includes('html') || errorText.includes('tag')) {
          stats.htmlSanitizationRequired += error.count;
        }
        if (errorText.includes('markdown') || errorText.includes('formatting')) {
          stats.markdownCleaningRequired += error.count;
        }
      });
    });

    return stats;
  }

  /**
   * Get quality improvement recommendations based on recent data
   */
  static getQualityRecommendations(): {
    priority: 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    details: string;
  }[] {
    const stats = this.getQualityStats(24);
    const validationStats = this.getValidationStats(24);
    const recommendations: {
      priority: 'high' | 'medium' | 'low';
      recommendation: string;
      impact: string;
      details: string;
    }[] = [];

    // Analyze quality score
    if (stats.averageQuality < 60) {
      recommendations.push({
        priority: 'high',
        recommendation: 'Improve DOM selectors for low-performing sites',
        impact: 'Could improve quality score by 20-30%',
        details: `Current average quality is ${stats.averageQuality}%. Sites with lowest quality: ${stats.siteBreakdown.slice(-2).map(s => `${s.site} (${s.quality}%)`).join(', ')}`
      });
    }

    // Analyze validation failures
    if (validationStats.titleValidationFailures > 10) {
      recommendations.push({
        priority: 'medium',
        recommendation: 'Strengthen title validation rules',
        impact: 'Could reduce invalid job entries by 15-25%',
        details: `${validationStats.titleValidationFailures} title validation failures detected in past 24h`
      });
    }

    if (validationStats.suspiciousContentDetected > 5) {
      recommendations.push({
        priority: 'high',
        recommendation: 'Enhance UI element filtering',
        impact: 'Could improve quality score by 10-15%',
        details: `${validationStats.suspiciousContentDetected} instances of suspicious/UI content detected`
      });
    }

    // Success cases
    if (stats.averageQuality >= 80) {
      recommendations.push({
        priority: 'low',
        recommendation: 'Quality target achieved - focus on monitoring',
        impact: 'Maintain current high-quality parsing',
        details: `Current average quality is ${stats.averageQuality}% - above 80% target`
      });
    }

    return recommendations;
  }

  /**
   * Log a comprehensive quality report
   */
  static logQualityReport(hours: number = 24): void {
    const stats = this.getQualityStats(hours);
    const validationStats = this.getValidationStats(hours);
    const recommendations = this.getQualityRecommendations();

    logger.info('Job parsing quality report', {
      operation: 'qualityReport',
      timeframe: `${hours} hours`,
      summary: {
        averageQuality: stats.averageQuality,
        totalSessions: stats.totalSessions,
        totalJobsParsed: stats.totalJobsParsed,
        totalValidJobs: stats.totalValidJobs,
        qualityTarget: '≥80%',
        targetMet: stats.averageQuality >= 80
      },
      sitePerformance: stats.siteBreakdown,
      validationIssues: validationStats,
      recommendations: recommendations.map(r => ({
        priority: r.priority,
        recommendation: r.recommendation,
        impact: r.impact
      })),
      trend: stats.trendData.length > 0 ? {
        latestQuality: stats.trendData[stats.trendData.length - 1]?.averageQuality,
        qualityImprovement: stats.trendData.length > 1 
          ? stats.trendData[stats.trendData.length - 1]?.averageQuality - stats.trendData[0]?.averageQuality 
          : 0
      } : null
    });
  }

  /**
   * Clear old metrics (for memory management)
   */
  static clearOldMetrics(olderThanHours: number = 72): number {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const initialCount = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
    const clearedCount = initialCount - this.metrics.length;
    
    if (clearedCount > 0) {
      logger.info(`Cleared ${clearedCount} old quality metrics`, {
        operation: 'clearOldMetrics',
        olderThanHours,
        remainingMetrics: this.metrics.length
      });
    }
    
    return clearedCount;
  }

  /**
   * Export metrics for external analysis
   */
  static exportMetrics(hours: number = 24): JobQualityMetrics[] {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metrics.filter(m => m.timestamp >= cutoffTime);
  }
}
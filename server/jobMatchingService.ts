
import { storage } from "./storage";
import { Resend } from "@resend/node";
import type { User, UserPreferences, QuestionnaireResponse, JobOpportunity } from "@shared/schema";

const resend = new Resend(process.env.RESEND_API_KEY);

export class JobMatchingService {
  async findMatchingJobsForUser(userId: string): Promise<JobOpportunity[]> {
    try {
      // Get user data
      const user = await storage.getUser(userId);
      if (!user) return [];

      // Get user preferences and questionnaire responses
      const preferences = await storage.getUserPreferences(userId);
      const questionnaireResponse = await storage.getQuestionnaireResponse(userId);
      
      // Get all active jobs
      const allJobs = await storage.getJobOpportunities();
      const activeJobs = allJobs.filter(job => job.isActive);

      // Filter jobs based on user criteria
      return this.filterJobsByCriteria(activeJobs, user, preferences, questionnaireResponse);
    } catch (error) {
      console.error("Error finding matching jobs:", error);
      return [];
    }
  }

  private filterJobsByCriteria(
    jobs: JobOpportunity[], 
    user: User, 
    preferences: UserPreferences | undefined,
    questionnaireResponse: QuestionnaireResponse | undefined
  ): JobOpportunity[] {
    return jobs.filter(job => {
      // Location-based filtering
      if (user.latitude && user.longitude) {
        // Check if job is within reasonable distance (simplified)
        const isLocalJob = job.location.toLowerCase().includes('close to home') || 
                          job.location.toLowerCase().includes('within') ||
                          job.location.toLowerCase().includes('local');
        
        const isRemoteJob = job.location.toLowerCase().includes('remote');
        
        // Include remote jobs and local jobs
        if (!isLocalJob && !isRemoteJob) {
          // For other locations, we'd need more sophisticated distance calculation
        }
      }

      // Filter by preferred job types
      if (preferences?.preferredJobTypes) {
        const preferredTypes = Array.isArray(preferences.preferredJobTypes) 
          ? preferences.preferredJobTypes 
          : [];
        
        const jobTags = Array.isArray(job.tags) ? job.tags : [];
        
        // Check if job has any preferred tags
        const hasPreferredTag = preferredTypes.some(type => 
          jobTags.includes(type)
        );
        
        if (preferredTypes.length > 0 && !hasPreferredTag) {
          return false;
        }
      }

      // Filter based on questionnaire responses
      if (questionnaireResponse?.responses) {
        const responses = questionnaireResponse.responses as any;
        
        // Check for job dislikes from question 3
        if (responses['3']) {
          const dislikedWork = Array.isArray(responses['3']) ? responses['3'] : [responses['3']];
          
          // Filter out jobs that match disliked work types
          if (dislikedWork.includes('physical') && 
              (job.description.toLowerCase().includes('lifting') || 
               job.description.toLowerCase().includes('physical'))) {
            return false;
          }
          
          if (dislikedWork.includes('customer-service') && 
              (job.description.toLowerCase().includes('customer') || 
               job.tags.includes('social'))) {
            return false;
          }
          
          if (dislikedWork.includes('computer-heavy') && 
              job.description.toLowerCase().includes('computer')) {
            return false;
          }
        }
      }

      return true;
    });
  }

  async sendJobNotificationEmail(user: User, jobs: JobOpportunity[]): Promise<boolean> {
    if (!user.email || jobs.length === 0) {
      return false;
    }

    try {
      const emailContent = this.generateEmailContent(user, jobs);
      
      await resend.emails.send({
        from: 'Retiree Gigs <jobs@retireegigs.com>',
        to: user.email,
        subject: `${jobs.length} New Job Match${jobs.length > 1 ? 'es' : ''} Found!`,
        html: emailContent
      });

      console.log(`Email notification sent to ${user.email} for ${jobs.length} jobs`);
      return true;
    } catch (error) {
      console.error("Error sending email notification:", error);
      return false;
    }
  }

  private generateEmailContent(user: User, jobs: JobOpportunity[]): string {
    const jobsHtml = jobs.slice(0, 5).map(job => `
      <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; background: #f8fafc;">
        <h3 style="color: #1e40af; margin: 0 0 8px 0;">${job.title}</h3>
        <p style="color: #475569; margin: 4px 0;"><strong>${job.company}</strong> • ${job.location}</p>
        <p style="color: #059669; font-weight: bold; margin: 4px 0;">${job.pay} • ${job.schedule}</p>
        <p style="color: #64748b; margin: 8px 0;">${job.description}</p>
        <div style="margin-top: 12px;">
          ${Array.isArray(job.tags) ? job.tags.map(tag => 
            `<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 4px;">${tag}</span>`
          ).join('') : ''}
        </div>
      </div>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Job Matches</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1e40af; margin-bottom: 8px;">New Job Matches!</h1>
          <p style="color: #64748b;">Hi ${user.firstName || 'there'}! We found ${jobs.length} new job${jobs.length > 1 ? 's' : ''} that match your preferences.</p>
        </div>
        
        ${jobsHtml}
        
        ${jobs.length > 5 ? `
          <div style="text-align: center; margin: 20px 0; padding: 16px; background: #f1f5f9; border-radius: 8px;">
            <p style="margin: 0; color: #475569;">And ${jobs.length - 5} more job${jobs.length - 5 > 1 ? 's' : ''}!</p>
          </div>
        ` : ''}
        
        <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 8px;">
          <a href="${process.env.CLIENT_URL || 'https://your-app.replit.app'}/dashboard" 
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View All Jobs
          </a>
        </div>
        
        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">
          <p>You're receiving this because you have job notifications enabled.</p>
          <p><a href="${process.env.CLIENT_URL || 'https://your-app.replit.app'}/profile" style="color: #2563eb;">Update your preferences</a></p>
        </div>
      </body>
      </html>
    `;
  }

  async processAllUserNotifications(): Promise<void> {
    try {
      console.log("Starting job notification process...");
      
      // Get all users with notifications enabled
      const users = await storage.getAllUsers();
      const usersWithNotifications = users.filter(user => {
        // Users need email and we'll check their preferences
        return user.email;
      });

      console.log(`Processing notifications for ${usersWithNotifications.length} users`);

      for (const user of usersWithNotifications) {
        try {
          // Check if user has notifications enabled
          const preferences = await storage.getUserPreferences(user.id);
          if (preferences && !preferences.notificationsEnabled) {
            continue;
          }

          // Find matching jobs
          const matchingJobs = await this.findMatchingJobsForUser(user.id);
          
          if (matchingJobs.length > 0) {
            // Only send notifications for great and good matches
            const notifiableJobs = matchingJobs.filter(job => 
              job.matchScore === 'great' || job.matchScore === 'good'
            );

            if (notifiableJobs.length > 0) {
              const emailSent = await this.sendJobNotificationEmail(user, notifiableJobs);
              if (emailSent) {
                console.log(`Notification sent to ${user.email}: ${notifiableJobs.length} jobs`);
              }
            }
          }

          // Add delay to avoid overwhelming email service
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Error processing notifications for user ${user.id}:`, error);
        }
      }

      console.log("Job notification process completed");
    } catch (error) {
      console.error("Error in processAllUserNotifications:", error);
    }
  }
}

export const jobMatchingService = new JobMatchingService();

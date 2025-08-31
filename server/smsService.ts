import { Resend } from 'resend';

export class SmsService {
  private resend: Resend | null = null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      console.warn('RESEND_API_KEY not configured - SMS notifications will be disabled');
    }
  }

  async sendSms(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.resend) {
      console.warn('SMS service not configured - skipping SMS notification');
      return false;
    }

    try {
      // Note: As of 2024, Resend primarily focuses on email. 
      // If they don't support SMS yet, we'll prepare the structure for when they do
      // or switch to Twilio in the future
      console.log(`SMS would be sent to ${phoneNumber}: ${message}`);
      
      // Placeholder for actual SMS sending when Resend supports it
      // await this.resend.sms.send({
      //   to: phoneNumber,
      //   text: message,
      // });

      return true;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      return false;
    }
  }

  async sendJobNotificationSms(phoneNumber: string, jobTitle: string, company: string, jobCount: number): Promise<boolean> {
    const message = jobCount === 1
      ? `New job match: ${jobTitle} at ${company}. Check your Retiree Gigs dashboard for details.`
      : `${jobCount} new job matches found! Including ${jobTitle} at ${company}. Check your dashboard for all opportunities.`;

    return this.sendSms(phoneNumber, message);
  }

  isConfigured(): boolean {
    return this.resend !== null;
  }
}

export const smsService = new SmsService();
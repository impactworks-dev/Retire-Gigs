import twilio from 'twilio';

export class SmsService {
  private twilioClient: twilio.Twilio | null = null;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (accountSid && authToken) {
      try {
        // Only initialize if credentials appear valid
        if (accountSid.startsWith('AC')) {
          this.twilioClient = twilio(accountSid, authToken);
        } else {
          console.warn('Invalid Twilio Account SID - must start with "AC". SMS notifications will be disabled');
        }
      } catch (error) {
        console.warn('Failed to initialize Twilio client - SMS notifications will be disabled:', error);
      }
    } else {
      console.warn('Twilio credentials not configured - SMS notifications will be disabled');
    }
  }

  async sendSms(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.twilioClient) {
      console.warn('SMS service not configured - skipping SMS notification');
      return false;
    }

    if (!process.env.TWILIO_PHONE_NUMBER) {
      console.warn('TWILIO_PHONE_NUMBER not configured - skipping SMS notification');
      return false;
    }

    try {
      const messageResult = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      console.log(`SMS sent successfully to ${phoneNumber}, SID: ${messageResult.sid}`);
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
    return this.twilioClient !== null && !!process.env.TWILIO_PHONE_NUMBER;
  }
}

export const smsService = new SmsService();
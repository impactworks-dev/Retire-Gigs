import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema,
  insertQuestionnaireResponseSchema,
  insertUserPreferencesSchema,
  insertJobOpportunitySchema,
  insertResumeSchema,
  insertNewsArticleSchema
} from "@shared/schema";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { geocodeAddress } from "./geocoding";
import { ResumeParserService } from "./resumeParser";
import { jobMatchingService } from "./jobMatchingService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User creation (age verification) - keeping for backwards compatibility
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  // Update user profile information
  app.patch("/api/users/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      // Users can only update their own profile
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updates = req.body;
      console.log("Received update request for user:", userId);
      console.log("Update data:", updates);

      // Validate that we have valid data
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ message: "Invalid update data" });
      }

      // Get existing user data first
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // For updates, we need to create a partial schema that allows the fields we want to update
      const allowedUpdateFields = {
        firstName: updates.firstName,
        lastName: updates.lastName,
        email: updates.email,
        phoneNumber: updates.phoneNumber,
        streetAddress: updates.streetAddress,
        city: updates.city,
        state: updates.state,
        zipCode: updates.zipCode,
        latitude: updates.latitude,
        longitude: updates.longitude,
        profileImageUrl: updates.profileImageUrl
      };

      // Remove undefined fields
      const filteredUpdates = Object.fromEntries(
        Object.entries(allowedUpdateFields).filter(([_, value]) => value !== undefined)
      );

      console.log("Filtered updates:", filteredUpdates);

      // Geocode address if any address fields were updated
      let geocodeResult = null;
      if (filteredUpdates.streetAddress || filteredUpdates.city || filteredUpdates.state || filteredUpdates.zipCode) {
        const addressToGeocode = {
          streetAddress: filteredUpdates.streetAddress || existingUser.streetAddress,
          city: filteredUpdates.city || existingUser.city,
          state: filteredUpdates.state || existingUser.state,
          zipCode: filteredUpdates.zipCode || existingUser.zipCode
        };

        console.log("Attempting to geocode address:", addressToGeocode);
        geocodeResult = await geocodeAddress(addressToGeocode);

        if (geocodeResult) {
          console.log("Geocoding successful:", geocodeResult);
          filteredUpdates.latitude = geocodeResult.latitude;
          filteredUpdates.longitude = geocodeResult.longitude;
        } else {
          console.log("Geocoding failed or no results");
        }
      }

      // Merge with existing user data to ensure all required fields are present
      const userUpdateData = {
        ...existingUser,
        ...filteredUpdates,
        id: userId,
        updatedAt: new Date()
      };

      const user = await storage.upsertUser(userUpdateData);
      res.json(user);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(400).json({ message: "Failed to update profile" });
    }
  });

  // Save questionnaire responses
  app.post("/api/questionnaire", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // SECURITY: Prevent user binding attacks - only allow authenticated user to submit for themselves
      const requestData = req.body;
      if (requestData.userId && requestData.userId !== userId) {
        return res.status(403).json({ message: "Cannot submit questionnaire for another user" });
      }
      
      // Check if user already has a questionnaire response to prevent duplicate submissions
      const existingResponse = await storage.getQuestionnaireResponse(userId);
      if (existingResponse) {
        return res.status(409).json({ message: "Questionnaire already completed. Use update endpoint to modify." });
      }
      
      // Force the userId to be the authenticated user's ID
      const responseData = insertQuestionnaireResponseSchema.parse({
        ...requestData,
        userId: userId
      });
      
      const response = await storage.saveQuestionnaireResponse(responseData);
      res.json(response);
    } catch (error) {
      console.error("Error saving questionnaire:", error);
      res.status(400).json({ message: "Invalid questionnaire data" });
    }
  });

  // Get questionnaire responses for a user
  app.get("/api/questionnaire/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      // Users can only access their own questionnaire responses
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const response = await storage.getQuestionnaireResponse(userId);
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: "Failed to get questionnaire response" });
    }
  });

  // Check if user has completed questionnaire
  app.get("/api/questionnaire/status/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      // Users can only check their own questionnaire status
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const response = await storage.getQuestionnaireResponse(userId);
      res.json({ completed: !!response });
    } catch (error) {
      res.status(500).json({ message: "Failed to check questionnaire status" });
    }
  });

  // Save user preferences
  app.post("/api/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const preferencesData = insertUserPreferencesSchema.parse({
        ...req.body,
        userId
      });
      const preferences = await storage.saveUserPreferences(preferencesData);
      res.json(preferences);
    } catch (error) {
      res.status(400).json({ message: "Invalid preferences data" });
    }
  });

  // Update user preferences
  app.patch("/api/preferences/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      // Users can only update their own preferences
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const preferences = await storage.updateUserPreferences(userId, req.body);
      res.json(preferences);
    } catch (error) {
      res.status(400).json({ message: "Failed to update preferences" });
    }
  });

  // Get user preferences
  app.get("/api/preferences/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      // Users can only access their own preferences
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const preferences = await storage.getUserPreferences(userId);
      res.json(preferences);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user preferences" });
    }
  });

  // Get job opportunities
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getJobOpportunities();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job opportunities" });
    }
  });

  // Get matching jobs for a user
  app.get("/api/jobs/matches/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const authenticatedUserId = req.user.claims.sub;

      // Users can only access their own job matches
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const jobs = await storage.getMatchingJobs(userId);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job matches" });
    }
  });

  // Create job opportunity (requires admin access)
  app.post("/api/jobs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const jobData = insertJobOpportunitySchema.parse(req.body);
      const job = await storage.createJobOpportunity(jobData);
      res.json(job);
    } catch (error) {
      res.status(400).json({ message: "Invalid job data" });
    }
  });

  // News articles routes
  app.get("/api/news", async (req, res) => {
    try {
      const articles = await storage.getNewsArticles();
      res.json(articles);
    } catch (error) {
      res.status(500).json({ message: "Failed to get news articles" });
    }
  });

  app.get("/api/news/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const article = await storage.getNewsArticle(id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }
      res.json(article);
    } catch (error) {
      res.status(500).json({ message: "Failed to get news article" });
    }
  });

  app.post("/api/news", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const articleData = insertNewsArticleSchema.parse(req.body);
      const article = await storage.createNewsArticle(articleData);
      res.json(article);
    } catch (error) {
      res.status(400).json({ message: "Invalid article data" });
    }
  });

  // Saved jobs routes
  app.post("/api/saved-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { jobId } = req.body;

      if (!jobId) {
        return res.status(400).json({ message: "Job ID is required" });
      }

      const savedJob = await storage.saveJob(userId, jobId);
      res.json(savedJob);
    } catch (error) {
      console.error("Error saving job:", error);
      res.status(500).json({ message: "Failed to save job" });
    }
  });

  app.delete("/api/saved-jobs/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { jobId } = req.params;

      await storage.unsaveJob(userId, jobId);
      res.json({ message: "Job unsaved successfully" });
    } catch (error) {
      console.error("Error unsaving job:", error);
      res.status(500).json({ message: "Failed to unsave job" });
    }
  });

  app.get("/api/saved-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const savedJobs = await storage.getUserSavedJobs(userId);
      res.json(savedJobs);
    } catch (error) {
      console.error("Error fetching saved jobs:", error);
      res.status(500).json({ message: "Failed to fetch saved jobs" });
    }
  });

  app.get("/api/saved-jobs/check/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { jobId } = req.params;

      const isSaved = await storage.isJobSaved(userId, jobId);
      res.json({ isSaved });
    } catch (error) {
      console.error("Error checking if job is saved:", error);
      res.status(500).json({ message: "Failed to check saved status" });
    }
  });

  // Saved news articles endpoints
  app.post("/api/saved-news", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { articleId } = req.body;

      if (!articleId) {
        return res.status(400).json({ message: "Article ID is required" });
      }

      const savedArticle = await storage.saveNewsArticle(userId, articleId);
      res.json(savedArticle);
    } catch (error) {
      console.error("Error saving news article:", error);
      res.status(500).json({ message: "Failed to save news article" });
    }
  });

  app.delete("/api/saved-news/:articleId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { articleId } = req.params;

      await storage.unsaveNewsArticle(userId, articleId);
      res.json({ message: "News article unsaved successfully" });
    } catch (error) {
      console.error("Error unsaving news article:", error);
      res.status(500).json({ message: "Failed to unsave news article" });
    }
  });

  app.get("/api/saved-news", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const savedArticles = await storage.getUserSavedNewsArticles(userId);
      res.json(savedArticles);
    } catch (error) {
      console.error("Error fetching saved news articles:", error);
      res.status(500).json({ message: "Failed to fetch saved news articles" });
    }
  });

  app.get("/api/saved-news/check/:articleId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { articleId } = req.params;

      const isSaved = await storage.isNewsArticleSaved(userId, articleId);
      res.json({ isSaved });
    } catch (error) {
      console.error("Error checking if news article is saved:", error);
      res.status(500).json({ message: "Failed to check saved status" });
    }
  });

  // Email notification endpoint
  app.post("/api/send-notification", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { email, subject, content } = req.body;

      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      const { data, error } = await resend.emails.send({
        from: 'Retiree Gigs <noreply@retireegigs.com>',
        to: [email],
        subject,
        html: content,
      });

      if (error) {
        console.error("Resend error:", error);
        return res.status(500).json({ message: "Failed to send notification" });
      }

      res.json({ success: true, data });
    } catch (error) {
      console.error("Error sending notification:", error);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // Test email endpoint
  app.post("/api/test-email", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({ message: "RESEND_API_KEY not configured" });
      }

      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      const { data, error } = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: ['dante@impactworks.com'],
        subject: 'Test Email - Retiree Gigs Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">🎉 Email Test Successful!</h2>
            <p>This is a test email from the Retiree Gigs platform to verify that email sending is working properly.</p>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">Test Details:</h3>
              <ul style="color: #6b7280;">
                <li>✅ Resend API integration is working</li>
                <li>✅ Email templates are rendering correctly</li>
                <li>✅ Domain configuration is functional</li>
                <li>✅ SMS notifications are also configured</li>
              </ul>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              Sent at: ${new Date().toLocaleString()}
            </p>
          </div>
        `,
      });

      if (error) {
        console.error("Resend test email error:", error);
        return res.status(500).json({ 
          message: "Failed to send test email", 
          error: error 
        });
      }

      console.log("Test email sent successfully:", data);
      res.json({ 
        success: true, 
        message: "Test email sent to dante@impactworks.com",
        data 
      });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  // Test SMS endpoint
  app.post("/api/test-sms", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const twilio = (await import('twilio')).default;
      
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        return res.status(500).json({ message: "Twilio credentials not configured" });
      }

      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      const message = await client.messages.create({
        body: `SMS Test: This is a test message from Retiree Gigs. If you receive this, SMS notifications are working. Sent at ${new Date().toLocaleString()}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      console.log(`Test SMS sent successfully to ${phoneNumber}, SID: ${message.sid}`);
      res.json({ 
        success: true, 
        message: `Test SMS sent to ${phoneNumber}`,
        sid: message.sid
      });
    } catch (error) {
      console.error("Error sending test SMS:", error);
      res.status(500).json({ 
        message: "Failed to send test SMS", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Resume API routes

  // Get all resumes for authenticated user
  app.get("/api/resumes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const resumes = await storage.getUserResumes(userId);
      res.json(resumes);
    } catch (error) {
      console.error("Error fetching resumes:", error);
      res.status(500).json({ message: "Failed to fetch resumes" });
    }
  });

  // Get specific resume by ID
  app.get("/api/resumes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const resume = await storage.getResume(id);
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }

      // Users can only access their own resumes
      if (resume.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json(resume);
    } catch (error) {
      console.error("Error fetching resume:", error);
      res.status(500).json({ message: "Failed to fetch resume" });
    }
  });

  // Create new resume
  app.post("/api/resumes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const resumeData = insertResumeSchema.parse({
        ...req.body,
        userId
      });

      const resume = await storage.createResume(resumeData);
      res.json(resume);
    } catch (error) {
      console.error("Error creating resume:", error);
      res.status(400).json({ message: "Invalid resume data" });
    }
  });

  // Update resume
  app.patch("/api/resumes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      // Check if resume exists and belongs to user
      const existingResume = await storage.getResume(id);
      if (!existingResume) {
        return res.status(404).json({ message: "Resume not found" });
      }

      if (existingResume.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updates = req.body;
      const updatedResume = await storage.updateResume(id, updates);
      res.json(updatedResume);
    } catch (error) {
      console.error("Error updating resume:", error);
      res.status(400).json({ message: "Failed to update resume" });
    }
  });

  // Delete resume
  app.delete("/api/resumes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      // Check if resume exists and belongs to user
      const existingResume = await storage.getResume(id);
      if (!existingResume) {
        return res.status(404).json({ message: "Resume not found" });
      }

      if (existingResume.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteResume(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting resume:", error);
      res.status(500).json({ message: "Failed to delete resume" });
    }
  });

  // Set default resume
  app.put("/api/resumes/:id/default", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      await storage.setDefaultResume(userId, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting default resume:", error);
      res.status(400).json({ message: (error as Error).message || "Failed to set default resume" });
    }
  });

  // Resume file upload endpoint
  app.post("/api/resumes/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  // Resume file access endpoint
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        req.path,
      );
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: "read" as any,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Update resume with uploaded file URL and parse content
  app.put("/api/resumes/:id/upload", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      if (!req.body.uploadedFileUrl) {
        return res.status(400).json({ error: "uploadedFileUrl is required" });
      }

      // SECURITY: Validate uploadedFileUrl to prevent SSRF attacks
      const uploadedFileUrl = req.body.uploadedFileUrl;
      try {
        const url = new URL(uploadedFileUrl);
        // Only allow URLs from trusted object storage domains
        const allowedHosts = [
          'storage.googleapis.com',
          'objects.replit.com',
          // Add any other trusted object storage domains your app uses
        ];
        
        if (!allowedHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
          return res.status(400).json({ error: "Invalid file URL - only object storage URLs are allowed" });
        }
      } catch (urlError) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Check if resume exists and belongs to user
      const existingResume = await storage.getResume(id);
      if (!existingResume) {
        return res.status(404).json({ message: "Resume not found" });
      }

      if (existingResume.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.uploadedFileUrl,
        {
          owner: userId,
          visibility: "private",
        },
      );

      // Parse the uploaded resume file
      let parsedData = null;
      try {
        console.log("Parsing resume from URL:", req.body.uploadedFileUrl);
        const resumeParser = new ResumeParserService();
        parsedData = await resumeParser.parseResumeFromUrl(req.body.uploadedFileUrl);
        console.log("Resume parsed successfully:", parsedData.title);
      } catch (parseError) {
        console.error("Error parsing resume:", parseError);
        // Continue without parsed data - user can still edit manually
      }

      // Update the resume with the file URL and parsed data
      const updateData: any = {
        uploadedFileUrl: objectPath
      };

      // If parsing was successful, update with parsed data
      if (parsedData) {
        updateData.title = parsedData.title;
        if (parsedData.summary) updateData.summary = parsedData.summary;
        if (parsedData.skills.length > 0) updateData.skills = parsedData.skills;
        if (parsedData.education.length > 0) updateData.education = parsedData.education;
        if (parsedData.workExperience.length > 0) updateData.workExperience = parsedData.workExperience;
        if (parsedData.certifications.length > 0) updateData.certifications = parsedData.certifications;
        if (parsedData.achievements.length > 0) updateData.achievements = parsedData.achievements;
      }

      const updatedResume = await storage.updateResume(id, updateData);

      res.status(200).json({
        objectPath: objectPath,
        resume: updatedResume,
        parsed: !!parsedData,
        parsedData: parsedData
      });
    } catch (error) {
      console.error("Error updating resume with uploaded file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Middleware for Lindy AI authentication
  const authenticateLindy = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey || apiKey !== process.env.LINDY_API_KEY) {
      return res.status(401).json({ message: "Unauthorized - Invalid API key" });
    }
    next();
  };

  // Lindy AI: Get user preferences for job matching
  app.get("/api/lindy/user-preferences/:userId", authenticateLindy, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Get user preferences
      const preferences = await storage.getUserPreferences(userId);
      if (!preferences) {
        return res.status(404).json({ message: "User preferences not found" });
      }

      // Get user basic info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Structure data for Lindy AI
      const userData = {
        userId: user.id,
        email: user.email,
        age: user.age,
        phoneNumber: user.phoneNumber,
        streetAddress: user.streetAddress,
        city: user.city,
        state: user.state,
        zipCode: user.zipCode,
        latitude: user.latitude,
        longitude: user.longitude,
        preferences: {
          schedulePreference: preferences.schedulePreference,
          preferredJobTypes: preferences.preferredJobTypes,
          preferredLocations: preferences.preferredLocations,
          notificationsEnabled: preferences.notificationsEnabled,
          smsNotificationsEnabled: preferences.smsNotificationsEnabled
        }
      };

      res.json(userData);
    } catch (error) {
      console.error("Error fetching user preferences for Lindy:", error);
      res.status(500).json({ message: "Failed to fetch user preferences" });
    }
  });

  // Lindy AI: Trigger job search for specific user
  app.post("/api/lindy/trigger-job-search", authenticateLindy, async (req, res) => {
    try {
      const { userId, searchContext } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      // Get user preferences to provide context
      const preferences = await storage.getUserPreferences(userId);
      const user = await storage.getUser(userId);
      
      if (!preferences || !user) {
        return res.status(404).json({ message: "User or preferences not found" });
      }

      // Log the trigger for monitoring
      console.log(`Lindy job search triggered for user ${userId}`, {
        searchContext,
        preferredJobTypes: preferences.preferredJobTypes,
        preferredLocations: preferences.preferredLocations
      });

      // Return user context for Lindy to use in job search
      res.json({
        success: true,
        userContext: {
          userId: user.id,
          age: user.age,
          location: `${user.streetAddress || ''} ${user.city || ''} ${user.state || ''} ${user.zipCode || ''}`.trim(),
          preferredJobTypes: preferences.preferredJobTypes,
          preferredLocations: preferences.preferredLocations,
          schedulePreference: preferences.schedulePreference
        },
        message: "Job search triggered successfully"
      });
    } catch (error) {
      console.error("Error triggering Lindy job search:", error);
      res.status(500).json({ message: "Failed to trigger job search" });
    }
  });

  // Endpoint to trigger Lindy job search via webhook (calls Lindy's webhook)
  app.post("/api/trigger-lindy-search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { searchContext } = req.body;

      // Get user preferences to send to Lindy
      const preferences = await storage.getUserPreferences(userId);
      const user = await storage.getUser(userId);
      
      if (!preferences || !user) {
        return res.status(404).json({ message: "User or preferences not found" });
      }

      // Prepare data to send to Lindy webhook
      const lindyPayload = {
        userId: user.id,
        userProfile: {
          age: user.age,
          location: `${user.streetAddress || ''} ${user.city || ''} ${user.state || ''} ${user.zipCode || ''}`.trim(),
          latitude: user.latitude,
          longitude: user.longitude,
          email: user.email
        },
        preferences: {
          schedulePreference: preferences.schedulePreference,
          preferredJobTypes: preferences.preferredJobTypes,
          preferredLocations: preferences.preferredLocations
        },
        searchContext: searchContext || "Regular job search based on user preferences",
        timestamp: new Date().toISOString()
      };

      // Send webhook to Lindy (if webhook URL is configured)
      if (process.env.LINDY_WEBHOOK_URL) {
        const response = await fetch(process.env.LINDY_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINDY_API_KEY}`
          },
          body: JSON.stringify(lindyPayload)
        });

        if (!response.ok) {
          console.error('Failed to trigger Lindy webhook:', response.status, response.statusText);
          return res.status(500).json({ message: "Failed to trigger Lindy job search" });
        }

        console.log(`Lindy job search triggered for user ${userId}`);
        res.json({ 
          success: true, 
          message: "Lindy job search triggered successfully",
          triggeredAt: new Date().toISOString()
        });
      } else {
        // If no Lindy webhook URL configured, just log the request
        console.log('Lindy webhook URL not configured. Job search request:', lindyPayload);
        res.json({ 
          success: true, 
          message: "Job search request logged (Lindy webhook URL not configured)",
          payload: lindyPayload
        });
      }
    } catch (error) {
      console.error("Error triggering Lindy job search:", error);
      res.status(500).json({ message: "Failed to trigger Lindy job search" });
    }
  });

  // Lindy AI webhook endpoint for receiving new job opportunities
  app.post("/api/lindy-webhook", authenticateLindy, async (req, res) => {
    try {
      const jobData = req.body;
      // Process and validate job data from Lindy AI
      const processedJob = insertJobOpportunitySchema.parse({
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        pay: jobData.salary || "$15/hour",
        schedule: jobData.schedule || "Part-time",
        description: jobData.description,
        tags: jobData.tags || [],
        matchScore: "potential",
        timeAgo: "Just posted",
        isActive: true
      });

      const job = await storage.createJobOpportunity(processedJob);
      res.json({ success: true, job });
    } catch (error) {
      res.status(400).json({ message: "Invalid job data from Lindy AI" });
    }
  });

  // Manual trigger for job notifications (for testing)
  app.post("/api/send-job-notifications", isAuthenticated, async (req: any, res) => {
    try {
      await jobMatchingService.processAllUserNotifications();
      res.json({ success: true, message: "Job notifications processed" });
    } catch (error) {
      console.error("Error processing job notifications:", error);
      res.status(500).json({ message: "Failed to process job notifications" });
    }
  });

  // Test endpoint for job notifications (requires authentication)
  app.post("/api/test-notifications", isAuthenticated, async (req: any, res) => {
    try {
      await jobMatchingService.processAllUserNotifications();
      res.json({ success: true, message: "Test job notifications processed" });
    } catch (error) {
      console.error("Error processing test job notifications:", error);
      res.status(500).json({ message: "Failed to process test job notifications" });
    }
  });

  // Get personalized job matches for authenticated user
  app.get("/api/jobs/personalized", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const matchingJobs = await jobMatchingService.findMatchingJobsForUser(userId);
      res.json(matchingJobs);
    } catch (error) {
      console.error("Error getting personalized jobs:", error);
      res.status(500).json({ message: "Failed to get personalized jobs" });
    }
  });

  // Setup scheduled job notifications (runs daily at 9 AM)
  cron.schedule("0 9 * * *", async () => {
    console.log("Running scheduled job notifications...");
    await jobMatchingService.processAllUserNotifications();
  });

  const httpServer = createServer(app);
  return httpServer;
}
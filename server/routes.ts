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
import { setupAuth, isAuthenticated } from "./replitAuth";
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
  app.post("/api/questionnaire", async (req, res) => {
    try {
      const responseData = insertQuestionnaireResponseSchema.parse(req.body);
      const response = await storage.saveQuestionnaireResponse(responseData);
      res.json(response);
    } catch (error) {
      res.status(400).json({ message: "Invalid questionnaire data" });
    }
  });

  // Get questionnaire responses for a user
  app.get("/api/questionnaire/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const response = await storage.getQuestionnaireResponse(userId);
      res.json(response);
    } catch (error) {
      res.status(500).json({ message: "Failed to get questionnaire response" });
    }
  });

  // Check if user has completed questionnaire
  app.get("/api/questionnaire/status/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const response = await storage.getQuestionnaireResponse(userId);
      res.json({ completed: !!response });
    } catch (error) {
      res.status(500).json({ message: "Failed to check questionnaire status" });
    }
  });

  // Save user preferences
  app.post("/api/preferences", async (req, res) => {
    try {
      const preferencesData = insertUserPreferencesSchema.parse(req.body);
      const preferences = await storage.saveUserPreferences(preferencesData);
      res.json(preferences);
    } catch (error) {
      res.status(400).json({ message: "Invalid preferences data" });
    }
  });

  // Update user preferences
  app.patch("/api/preferences/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const preferences = await storage.updateUserPreferences(userId, req.body);
      res.json(preferences);
    } catch (error) {
      res.status(400).json({ message: "Failed to update preferences" });
    }
  });

  // Get user preferences
  app.get("/api/preferences/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
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
  app.get("/api/jobs/matches/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const jobs = await storage.getMatchingJobs(userId);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job matches" });
    }
  });

  // Create job opportunity (for Lindy AI integration)
  app.post("/api/jobs", async (req, res) => {
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

  app.post("/api/news", async (req, res) => {
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

  // Email notification endpoint
  app.post("/api/send-notification", async (req, res) => {
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
      res.status(400).json({ message: error.message || "Failed to set default resume" });
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
    const userId = req.user?.claims?.sub;
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

  // Lindy AI webhook endpoint for receiving new job opportunities
  app.post("/api/lindy-webhook", async (req, res) => {
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

  // Test endpoint for job notifications (no auth required for testing)
  app.post("/api/test-notifications", async (req, res) => {
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
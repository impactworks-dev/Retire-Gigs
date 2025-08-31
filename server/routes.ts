import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema,
  insertQuestionnaireResponseSchema,
  insertUserPreferencesSchema,
  insertJobOpportunitySchema
} from "@shared/schema";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { geocodeAddress } from "./geocoding";

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

  // Email notification endpoint
  app.post("/api/send-notification", async (req, res) => {
    try {
      const { email, subject, content } = req.body;
      
      // Configure nodemailer (would use real SMTP in production)
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER || "test@example.com",
          pass: process.env.SMTP_PASS || "password"
        }
      });

      await transporter.sendMail({
        from: '"Retiree Gigs" <noreply@retireegigs.com>',
        to: email,
        subject,
        html: content
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to send notification" });
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

  // Setup scheduled job notifications (runs daily at 9 AM)
  cron.schedule("0 9 * * *", async () => {
    console.log("Running scheduled job notifications...");
    // In a real implementation, this would:
    // 1. Get all users with notifications enabled
    // 2. Check their schedule preferences
    // 3. Send appropriate job notifications
    // 4. Track last notification times
  });

  const httpServer = createServer(app);
  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { 
  insertUserSchema,
  updateUserSchema,
  insertQuestionnaireResponseSchema,
  insertUserPreferencesSchema,
  updateUserPreferencesSchema,
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
import { authService } from "./authService";
import { geocodeAddress } from "./geocoding";
import { ResumeParserService } from "./resumeParser";
import { jobMatchingService } from "./jobMatchingService";
import { ZodError } from "zod";
import { malwareScannerService } from "./malwareScanner";
import { logger } from "./logger";
import { firecrawlService } from "./services/firecrawl";
import { perplexityService } from "./services/perplexityService";
import { jobParserService } from "./services/jobParserService";
import { jobSearchService } from "./services/jobSearchService";
import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import path from "path";
import fs from "fs";

function formatZodError(error: ZodError): { message: string; errors?: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  let hasFieldErrors = false;

  for (const issue of error.issues) {
    const fieldPath = issue.path.join('.');
    if (fieldPath) {
      fieldErrors[fieldPath] = issue.message;
      hasFieldErrors = true;
    }
  }

  if (hasFieldErrors) {
    const firstError = Object.values(fieldErrors)[0];
    return {
      message: firstError,
      errors: fieldErrors
    };
  }

  // Fallback for non-field specific errors
  return {
    message: error.issues[0]?.message || "Validation failed"
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);
  
  // SECURITY: Rate limiting middleware for different endpoint types
  // More lenient limits for development, stricter for production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 1000 : 100, // Much higher limit for development
    message: { message: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  const strictRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 200 : 20, // Higher limit for development
    message: { message: "Too many requests for this operation, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  const resumeParsingRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Only 5 resume parsing operations per hour per IP
    message: { message: "Resume parsing limit exceeded. Please try again in an hour." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  // Apply general rate limiting to all routes (disabled in development)
  if (!isDevelopment) {
    app.use('/api/', generalRateLimit);
  }

  // Serve service worker file with correct MIME type (needed for PWA functionality)
  app.get('/sw.js', (req, res) => {
    const swPath = path.resolve(process.cwd(), 'public', 'sw.js');
    
    try {
      if (fs.existsSync(swPath)) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Service-Worker-Allowed', '/');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(swPath);
        logger.info('Service worker served successfully', { 
          operation: 'service_worker_serve',
          path: '/sw.js'
        });
      } else {
        logger.error('Service worker file not found', null, { 
          operation: 'service_worker_serve',
          expectedPath: swPath
        });
        res.status(404).json({ message: 'Service worker not found' });
      }
    } catch (error) {
      logger.error('Error serving service worker', error, { 
        operation: 'service_worker_serve' 
      });
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Health check endpoint for load balancers and monitoring
  app.get('/api/health', async (req, res) => {
    const startTime = Date.now();
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'unknown',
        storage: 'unknown', 
        auth: 'unknown'
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    try {
      // Check database connectivity (only if DATABASE_URL is configured)
      if (process.env.DATABASE_URL) {
        const dbStartTime = Date.now();
        const sql = neon(process.env.DATABASE_URL);
        await sql('SELECT 1 as health_check');
        const dbDuration = Date.now() - dbStartTime;
        healthStatus.services.database = 'healthy';
        
        logger.performance('health_check_database', dbDuration, true, { service: 'postgresql' });
      } else {
        healthStatus.services.database = 'not_configured';
        logger.info('Database health check skipped - DATABASE_URL not configured', { 
          operation: 'health_check',
          service: 'postgresql'
        });
      }

      // Check storage service
      try {
        const storageStartTime = Date.now();
        await storage.getJobOpportunities(); // Simple storage operation
        const storageDuration = Date.now() - storageStartTime;
        healthStatus.services.storage = 'healthy';
        
        logger.performance('health_check_storage', storageDuration, true, { service: 'memory_storage' });
      } catch (error) {
        healthStatus.services.storage = 'unhealthy';
        logger.error('Health check storage failed', error, { service: 'memory_storage' });
      }

      // Check auth service availability (basic check)
      healthStatus.services.auth = 'healthy'; // Auth is middleware-based, assume healthy if server is running

      const totalDuration = Date.now() - startTime;
      logger.performance('health_check_total', totalDuration, true, { 
        allServicesHealthy: Object.values(healthStatus.services).every(s => s === 'healthy')
      });

      res.status(200).json(healthStatus);
    } catch (error) {
      healthStatus.status = 'unhealthy';
      healthStatus.services.database = 'unhealthy';
      
      const totalDuration = Date.now() - startTime;
      logger.error('Health check failed', error, { duration: totalDuration });
      
      res.status(503).json(healthStatus);
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Remove password from response
      const { password, ...userWithoutPassword } = user as any;
      res.json(userWithoutPassword);
    } catch (error) {
      logger.error("Error fetching user", error, { operation: 'fetch_user' });
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Email/Password Signup
  app.post('/api/auth/signup', strictRateLimit, async (req, res) => {
    try {
      const { email, password, firstName, lastName, age, gender } = req.body;

      // Validation
      if (!email || !password || !firstName || !lastName || !age) {
        return res.status(400).json({ 
          message: "Email, password, first name, last name, and age are required" 
        });
      }

      if (password.length < 8) {
        return res.status(400).json({ 
          message: "Password must be at least 8 characters long" 
        });
      }

      if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.status(400).json({ 
          message: "Invalid email format" 
        });
      }

      // Register user
      const user = await authService.registerUser({
        email,
        password,
        firstName,
        lastName,
        age,
        gender,
      });

      // Create session manually for email/password users
      (req as any).session.passport = {
        user: { 
          id: user.id,
          claims: { sub: user.id, email: user.email }
        }
      };
      
      // Remove password from response
      const { password: _, ...userWithoutPassword } = user as any;
      res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      logger.error("Signup error", error, { operation: 'signup' });
      
      if (error.message === "User with this email already exists") {
        return res.status(409).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // Email/Password Login
  app.post('/api/auth/login', strictRateLimit, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          message: "Email and password are required" 
        });
      }

      const user = await authService.loginUser(email, password);
      
      if (!user) {
        return res.status(401).json({ 
          message: "Invalid email or password" 
        });
      }

      // Create session manually for email/password users
      (req as any).session.passport = {
        user: { 
          id: user.id,
          claims: { sub: user.id, email: user.email }
        }
      };
      
      // Remove password from response
      const { password: _, ...userWithoutPassword } = user as any;
      res.json(userWithoutPassword);
    } catch (error) {
      logger.error("Login error", error, { operation: 'login' });
      res.status(500).json({ message: "Login failed" });
    }
  });

  // JSON Logout endpoint for API clients
  // app.post('/api/auth/logout', (req, res) => {
  //   req.logout(() => {
  //     res.json({ message: "Logged out successfully" });
  //   });
  // });

  // Browser logout endpoint for redirects
  app.get('/api/logout', (req, res) => {
    req.logout(() => {
      // Redirect to login page after logout
      res.redirect('/login');
    });
  });


  // User creation (age verification) - keeping for backwards compatibility
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
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

      // Get existing user data first
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate updates using Zod schema
      const validatedUpdates = updateUserSchema.parse(req.body);
      
      logger.info("User profile update requested", {
        userId,
        operation: 'user_profile_update',
        fieldsUpdated: Object.keys(validatedUpdates),
        hasAddressUpdate: !!(validatedUpdates.streetAddress || validatedUpdates.city || validatedUpdates.state || validatedUpdates.zipCode)
      });

      // Geocode address if any address fields were updated
      let finalUpdates = { ...validatedUpdates };
      if (validatedUpdates.streetAddress || validatedUpdates.city || validatedUpdates.state || validatedUpdates.zipCode) {
        const addressToGeocode = {
          streetAddress: validatedUpdates.streetAddress || existingUser.streetAddress,
          city: validatedUpdates.city || existingUser.city,
          state: validatedUpdates.state || existingUser.state,
          zipCode: validatedUpdates.zipCode || existingUser.zipCode
        };

        // Geocoding is now handled with PII-safe logging in the geocodeAddress function
        const geocodeResult = await geocodeAddress(addressToGeocode);

        if (geocodeResult) {
          logger.info("Geocoding successful for user profile update", {
            userId,
            operation: 'profile_geocoding',
            hasLatitude: !!geocodeResult.latitude,
            hasLongitude: !!geocodeResult.longitude,
            hasFormattedAddress: !!geocodeResult.formattedAddress
          });
          finalUpdates.latitude = geocodeResult.latitude;
          finalUpdates.longitude = geocodeResult.longitude;
        } else {
          logger.warn("Geocoding failed for user profile update", {
            userId,
            operation: 'profile_geocoding'
          });
        }
      }

      // Merge with existing user data to ensure all required fields are present
      const userUpdateData = {
        ...existingUser,
        ...finalUpdates,
        id: userId,
        updatedAt: new Date()
      };

      const user = await storage.upsertUser(userUpdateData);
      res.json(user);
    } catch (error) {
      logger.error("Failed to update user profile", error, {
        userId: req.params.userId,
        operation: 'user_profile_update'
      });
      res.status(400).json({ message: "Failed to update profile" });
    }
  });

  // Save questionnaire responses
  app.post("/api/questionnaire", strictRateLimit, isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      
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
      res.status(201).json(response);
    } catch (error) {
      logger.error("Error saving questionnaire", error, { operation: 'save_questionnaire' });
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
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
  app.post("/api/preferences", strictRateLimit, isAuthenticated, async (req: any, res) => {
    try {
      // Get user ID from authenticated session
      const userId = req.user?.claims?.sub || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "User not properly authenticated" });
      }
      
      // SECURITY: Strict validation using enhanced schema, override any userId from request body
      const preferencesData = insertUserPreferencesSchema.parse({
        ...req.body,
        userId // Always use the authenticated user's ID
      });
      
      logger.info('User preferences validated successfully', { operation: 'validate_preferences', hasPreferences: !!preferencesData });
      const preferences = await storage.saveUserPreferences(preferencesData);
      res.status(201).json(preferences);
    } catch (error) {
      logger.error('Error saving user preferences', error, { operation: 'save_preferences' });
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
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

      // SECURITY: Strict validation using enhanced schema for updates
      const validatedUpdates = updateUserPreferencesSchema.parse(req.body);
      logger.info('User preference updates validated successfully', { operation: 'validate_preference_updates', fieldsUpdated: Object.keys(validatedUpdates) });
      
      const preferences = await storage.updateUserPreferences(userId, validatedUpdates);
      res.json(preferences);
    } catch (error) {
      logger.error('Error updating user preferences', error, { operation: 'update_preferences' });
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
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

  // Real-time job search endpoint - searches for jobs based on user criteria
  app.post("/api/jobs/search", isAuthenticated, async (req: any, res) => {
    try {
      const { location, jobTypes, schedule, keywords } = req.body;

      if (!jobSearchService.isServiceAvailable()) {
        return res.status(503).json({ 
          message: "Job search service is temporarily unavailable. Please check API configuration." 
        });
      }

      logger.info('Job search request received', {
        operation: 'job_search_api',
        userId: req.user.claims.sub,
        criteria: { location, jobTypes, schedule }
      });

      const jobs = await jobSearchService.searchJobs({
        location,
        jobTypes,
        schedule,
        keywords
      });

      logger.info('Job search request completed', {
        operation: 'job_search_api',
        userId: req.user.claims.sub,
        jobCount: jobs.length
      });

      res.json({ jobs });
    } catch (error) {
      logger.error('Job search request failed', error, {
        operation: 'job_search_api',
        userId: req.user.claims.sub
      });
      res.status(500).json({ 
        message: "Failed to search for jobs. Please try again later.",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create job opportunity (requires admin access)
  app.post("/api/jobs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const jobData = insertJobOpportunitySchema.parse(req.body);
      const job = await storage.createJobOpportunity(jobData);
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
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
      res.status(201).json(article);
    } catch (error) {
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
      res.status(400).json({ message: "Invalid article data" });
    }
  });

  // Saved jobs routes
  app.post("/api/saved-jobs", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { jobId } = req.body;

      if (!jobId) {
        return res.status(400).json({ message: "Job ID is required" });
      }

      const savedJob = await storage.saveJob(userId, jobId);
      res.status(201).json(savedJob);
    } catch (error) {
      logger.error("Error saving job", error, { operation: 'save_job' });
      res.status(500).json({ message: "Failed to save job" });
    }
  });

  app.delete("/api/saved-jobs/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { jobId } = req.params;

      await storage.unsaveJob(userId, jobId);
      res.status(204).send();
    } catch (error) {
      logger.error("Error unsaving job", error, { operation: 'unsave_job' });
      res.status(500).json({ message: "Failed to unsave job" });
    }
  });

  app.get("/api/saved-jobs", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const savedJobs = await storage.getUserSavedJobs(userId);
      res.json(savedJobs);
    } catch (error) {
      logger.error("Error fetching saved jobs", error, { operation: 'fetch_saved_jobs' });
      res.status(500).json({ message: "Failed to fetch saved jobs" });
    }
  });

  app.get("/api/saved-jobs/check/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { jobId } = req.params;

      const isSaved = await storage.isJobSaved(userId, jobId);
      res.json({ isSaved });
    } catch (error) {
      logger.error("Error checking if job is saved", error, { operation: 'check_job_saved' });
      res.status(500).json({ message: "Failed to check saved status" });
    }
  });

  // Saved news articles endpoints
  app.post("/api/saved-news", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { articleId } = req.body;

      if (!articleId) {
        return res.status(400).json({ message: "Article ID is required" });
      }

      const savedArticle = await storage.saveNewsArticle(userId, articleId);
      res.status(201).json(savedArticle);
    } catch (error) {
      logger.error("Error saving news article", error, { operation: 'save_news_article' });
      res.status(500).json({ message: "Failed to save news article" });
    }
  });

  app.delete("/api/saved-news/:articleId", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { articleId } = req.params;

      await storage.unsaveNewsArticle(userId, articleId);
      res.status(204).send();
    } catch (error) {
      logger.error("Error unsaving news article", error, { operation: 'unsave_news_article' });
      res.status(500).json({ message: "Failed to unsave news article" });
    }
  });

  app.get("/api/saved-news", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const savedArticles = await storage.getUserSavedNewsArticles(userId);
      res.json(savedArticles);
    } catch (error) {
      logger.error("Error fetching saved news articles", error, { operation: 'fetch_saved_news' });
      res.status(500).json({ message: "Failed to fetch saved news articles" });
    }
  });

  app.get("/api/saved-news/check/:articleId", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { articleId } = req.params;

      const isSaved = await storage.isNewsArticleSaved(userId, articleId);
      res.json({ isSaved });
    } catch (error) {
      logger.error("Error checking if news article is saved", error, { operation: 'check_news_saved' });
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
        logger.error("Failed to send notification via Resend", error, {
          operation: 'email_notification',
          service: 'resend'
        });
        return res.status(500).json({ message: "Failed to send notification" });
      }

      res.json({ success: true, data });
    } catch (error) {
      logger.error("Failed to send email notification", error, {
        operation: 'email_notification'
      });
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
        logger.error("Resend test email error", error, { operation: 'test_email', service: 'resend' });
        return res.status(500).json({ 
          message: "Failed to send test email", 
          error: error 
        });
      }

      logger.info("Test email sent successfully", { operation: 'test_email', service: 'resend', success: true });
      res.json({ 
        success: true, 
        message: "Test email sent to dante@impactworks.com",
        data 
      });
    } catch (error) {
      logger.error("Error sending test email", error, { operation: 'test_email' });
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

      logger.info("Test SMS sent successfully", { operation: 'test_sms', service: 'twilio', success: true, messageSid: message.sid });
      res.json({ 
        success: true, 
        message: `Test SMS sent to ${phoneNumber}`,
        sid: message.sid
      });
    } catch (error) {
      logger.error("Error sending test SMS", error, { operation: 'test_sms', service: 'twilio' });
      res.status(500).json({ 
        message: "Failed to send test SMS", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test Firecrawl endpoint
  // Test Perplexity Service
  app.post("/api/test-perplexity", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      logger.info("Testing Perplexity service", { operation: 'test_perplexity' });

      if (!perplexityService.isServiceAvailable()) {
        return res.status(500).json({
          message: "Perplexity service not available - API key not configured"
        });
      }

      // Test API connection
      const connectionTest = await perplexityService.testConnection();
      
      if (!connectionTest.success) {
        return res.status(500).json({
          message: "Perplexity API connection test failed",
          error: connectionTest.message
        });
      }

      // Test job search with small sample
      const testQuery = {
        location: "Remote",
        jobTypes: ["part-time"],
        schedule: "flexible",
        experienceLevel: "senior-friendly",
        keywords: ["customer service"],
        excludeKeywords: ["entry-level"]
      };

      logger.info("Testing Perplexity service with sample job search", { 
        operation: 'test_perplexity',
        query: testQuery
      });

      // Test job search
      const searchResponse = await perplexityService.searchJobs(testQuery);
      const parsedJobs = jobParserService.parseJobsFromText(searchResponse);
      
      const response = {
        success: true,
        message: "Perplexity service test completed successfully",
        data: {
          configured: true,
          connectionTest: connectionTest.success,
          sampleJobSearch: {
            responseLength: searchResponse.length,
            parsedJobCount: parsedJobs.length,
            jobs: parsedJobs.slice(0, 2) // Return first 2 jobs as sample
          }
        }
      };

      logger.info("Perplexity test completed successfully", { 
        operation: 'test_perplexity',
        jobCount: parsedJobs.length,
        success: true
      });

      res.json(response);
    } catch (error) {
      logger.error("Error testing Perplexity service", error, { operation: 'test_perplexity' });
      res.status(500).json({ 
        message: "Failed to test Perplexity service", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/test-firecrawl", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Test Firecrawl service configuration and connection
      const isConfigured = firecrawlService.isConfigured();
      
      if (!isConfigured) {
        return res.status(500).json({ 
          message: "Firecrawl service not configured - FIRECRAWL_API_KEY missing" 
        });
      }

      // Test API connection
      const connectionTest = await firecrawlService.testConnection();
      
      if (!connectionTest) {
        return res.status(500).json({ 
          message: "Firecrawl API connection test failed" 
        });
      }

      // Test job scraping with small sample
      const testOptions = {
        location: "Remote",
        jobType: "part-time",
        maxResults: 3
      };

      logger.info("Testing Firecrawl service with sample scraping", { 
        operation: 'test_firecrawl',
        options: testOptions
      });

      // Test Indeed scraping (just a small sample)
      const indeedJobs = await firecrawlService.scrapeIndeedJobs(testOptions);
      
      const response = {
        success: true,
        message: "Firecrawl service test completed successfully",
        data: {
          configured: isConfigured,
          connectionTest: connectionTest,
          sampleJobs: {
            indeed: {
              count: indeedJobs.length,
              jobs: indeedJobs.slice(0, 2) // Return first 2 jobs as sample
            }
          }
        }
      };

      logger.info("Firecrawl test completed successfully", { 
        operation: 'test_firecrawl',
        jobCount: indeedJobs.length,
        success: true
      });

      res.json(response);
    } catch (error) {
      logger.error("Error testing Firecrawl service", error, { operation: 'test_firecrawl' });
      res.status(500).json({ 
        message: "Failed to test Firecrawl service", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });



  // Resume API routes

  // Get all resumes for authenticated user
  app.get("/api/resumes", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const resumes = await storage.getUserResumes(userId);
      res.json(resumes);
    } catch (error) {
      logger.error("Error fetching resumes", error, { operation: 'fetch_resumes' });
      res.status(500).json({ message: "Failed to fetch resumes" });
    }
  });

  // Get specific resume by ID
  app.get("/api/resumes/:id", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
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
      logger.error("Error fetching resume", error, { operation: 'fetch_resume' });
      res.status(500).json({ message: "Failed to fetch resume" });
    }
  });

  // Create new resume
  app.post("/api/resumes", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const resumeData = insertResumeSchema.parse({
        ...req.body,
        userId
      });

      const resume = await storage.createResume(resumeData);
      res.status(201).json(resume);
    } catch (error) {
      logger.error("Error creating resume", error, { operation: 'create_resume' });
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
      res.status(400).json({ message: "Invalid resume data" });
    }
  });

  // Update resume
  app.patch("/api/resumes/:id", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
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
      logger.error("Error updating resume", error, { operation: 'update_resume' });
      res.status(400).json({ message: "Failed to update resume" });
    }
  });

  // Delete resume
  app.delete("/api/resumes/:id", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
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
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting resume", error, { operation: 'delete_resume' });
      res.status(500).json({ message: "Failed to delete resume" });
    }
  });

  // Set default resume
  app.put("/api/resumes/:id/default", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { id } = req.params;

      await storage.setDefaultResume(userId, id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error setting default resume", error, { operation: 'set_default_resume' });
      res.status(400).json({ message: (error as Error).message || "Failed to set default resume" });
    }
  });

  // Resume file upload endpoint - SECURITY: Apply strict rate limiting for resume operations
  app.post("/api/resumes/upload", resumeParsingRateLimit, isAuthenticated, async (req, res) => {
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
      logger.error("Error checking object access", error, { operation: 'check_object_access' });
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Update resume with uploaded file URL and parse content
  app.put("/api/resumes/:id/upload", resumeParsingRateLimit, isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const { id } = req.params;

      if (!req.body.uploadedFileUrl) {
        return res.status(400).json({ message: "uploadedFileUrl is required" });
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
          return res.status(400).json({ message: "Invalid file URL - only object storage URLs are allowed" });
        }
      } catch (urlError) {
        return res.status(400).json({ message: "Invalid URL format" });
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
        logger.info("Starting resume parsing", {
          userId,
          operation: 'resume_parse',
          hasUploadUrl: !!req.body.uploadedFileUrl
        });
        const resumeParser = new ResumeParserService();
        parsedData = await resumeParser.parseResumeFromUrl(req.body.uploadedFileUrl);
        logger.info("Resume parsed successfully", {
          userId,
          operation: 'resume_parse',
          hasTitle: !!parsedData.title,
          hasSummary: !!parsedData.summary,
          skillsCount: parsedData.skills?.length || 0,
          workExperienceCount: parsedData.workExperience?.length || 0
        });
      } catch (parseError) {
        logger.error("Resume parsing failed", parseError, {
          userId,
          operation: 'resume_parse'
        });
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
      logger.error("Failed to update resume with uploaded file", error, {
        userId: (req.user as any)?.claims?.sub || 'unknown',
        operation: 'resume_file_update'
      });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Middleware for external service authentication (Lindy/Firecrawl)
  const authenticateExternalService = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey || apiKey !== process.env.EXTERNAL_API_KEY) {
      return res.status(401).json({ message: "Unauthorized - Invalid API key" });
    }
    next();
  };

  // Lindy authentication - strict access for Lindy service only
  const authenticateLindy = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey || apiKey !== process.env.LINDY_API_KEY) {
      return res.status(401).json({ message: "Unauthorized - Invalid API key" });
    }
    next();
  };

  // External Services: Get user preferences with pagination for job scraping services
  app.get("/api/admin/users/preferences", authenticateExternalService, async (req, res) => {
    try {
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 1;
      
      // Validate pagination parameters
      if (limit > 50) {
        return res.status(400).json({ message: "Limit cannot exceed 50 users per request" });
      }
      
      if (offset < 0 || limit < 1) {
        return res.status(400).json({ message: "Invalid pagination parameters" });
      }

      // Get users with preferences using optimized storage method (avoids N+1 queries)
      const { users: rawUsersWithPrefs, total } = await storage.getUsersWithPreferences(offset, limit);
      
      if (rawUsersWithPrefs.length === 0) {
        return res.json({
          users: [],
          pagination: {
            offset,
            limit,
            total,
            hasMore: false
          }
        });
      }

      // Transform data and minimize PII exposure
      const usersWithPreferences = rawUsersWithPrefs.map(({ user, preferences }) => {
        // Round coordinates to ~1km precision for privacy (3 decimal places)
        const roundedLat = user.latitude ? Math.round(parseFloat(user.latitude) * 1000) / 1000 : null;
        const roundedLng = user.longitude ? Math.round(parseFloat(user.longitude) * 1000) / 1000 : null;
        
        return {
          userId: user.id,
          userInfo: {
            age: user.age,
            // PII minimization: exclude email, phoneNumber, streetAddress
            firstName: user.firstName,
            lastName: user.lastName,
            location: {
              city: user.city,
              state: user.state,
              zipCode: user.zipCode,
              // Rounded coordinates for privacy (~1km precision)
              latitude: roundedLat?.toString(),
              longitude: roundedLng?.toString()
            }
          },
          preferences: preferences ? {
            notificationsEnabled: preferences.notificationsEnabled,
            smsNotificationsEnabled: preferences.smsNotificationsEnabled,
            schedulePreference: preferences.schedulePreference,
            preferredJobTypes: preferences.preferredJobTypes,
            preferredLocations: preferences.preferredLocations
          } : null,
          hasCompletedPreferences: !!preferences
        };
      });

      // Log request for monitoring (without exposing PII)
      logger.info("External service accessed user preferences", {
        operation: 'external_user_preferences_access',
        offset,
        limit,
        usersReturned: usersWithPreferences.length,
        totalUsers: total,
        usersWithPreferences: usersWithPreferences.filter(u => u.hasCompletedPreferences).length
      });

      res.json({
        users: usersWithPreferences,
        pagination: {
          offset,
          limit,
          total,
          hasMore: offset + limit < total,
          nextOffset: offset + limit < total ? offset + limit : null
        }
      });
    } catch (error) {
      logger.error("Failed to fetch user preferences for external service", error, {
        operation: 'external_user_preferences_access'
      });
      res.status(500).json({ message: "Failed to fetch user preferences" });
    }
  });

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
      logger.error("Failed to fetch user preferences for Lindy", error, {
        operation: 'lindy_user_preferences'
      });
      res.status(500).json({ message: "Failed to fetch user preferences" });
    }
  });

  // Lindy AI: Trigger job search for specific user
  app.post("/api/lindy/trigger-job-search", strictRateLimit, authenticateLindy, async (req, res) => {
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

      // Log the trigger for monitoring without exposing PII
      logger.info("Lindy job search triggered", {
        userId,
        operation: 'lindy_job_search_trigger',
        hasSearchContext: !!searchContext,
        jobTypesCount: Array.isArray(preferences.preferredJobTypes) ? preferences.preferredJobTypes.length : 0,
        locationsCount: Array.isArray(preferences.preferredLocations) ? preferences.preferredLocations.length : 0,
        hasSchedulePreference: !!preferences.schedulePreference
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
      logger.error("Error triggering Lindy job search", error, { operation: 'lindy_job_search_trigger_get' });
      res.status(500).json({ message: "Failed to trigger job search" });
    }
  });

  // Endpoint to trigger Lindy job search via webhook (calls Lindy's webhook)
  app.post("/api/trigger-lindy-search", isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
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
          logger.error('Failed to trigger Lindy webhook', null, { operation: 'lindy_webhook', status: response.status, statusText: response.statusText });
          return res.status(500).json({ message: "Failed to trigger Lindy job search" });
        }

        logger.info('Lindy job search triggered successfully', { operation: 'lindy_webhook', userId });
        res.json({ 
          success: true, 
          message: "Lindy job search triggered successfully",
          triggeredAt: new Date().toISOString()
        });
      } else {
        // If no Lindy webhook URL configured, just log the request
        logger.warn('Lindy webhook URL not configured', { operation: 'lindy_webhook', hasPayload: !!lindyPayload });
        res.json({ 
          success: true, 
          message: "Job search request logged (Lindy webhook URL not configured)",
          payload: lindyPayload
        });
      }
    } catch (error) {
      logger.error("Error triggering Lindy job search", error, { operation: 'lindy_job_search_trigger_post' });
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
      res.status(201).json({ success: true, job });
    } catch (error) {
      if (error instanceof ZodError) {
        const zodErrorResponse = formatZodError(error);
        return res.status(400).json(zodErrorResponse);
      }
      res.status(400).json({ message: "Invalid job data from Lindy AI" });
    }
  });

  // Manual trigger for job notifications (for testing)
  app.post("/api/send-job-notifications", isAuthenticated, async (req: any, res) => {
    try {
      await jobMatchingService.processAllUserNotifications();
      res.json({ success: true, message: "Job notifications processed" });
    } catch (error) {
      logger.error("Error processing job notifications", error, { operation: 'process_job_notifications' });
      res.status(500).json({ message: "Failed to process job notifications" });
    }
  });

  // Test endpoint for job notifications (requires authentication)
  app.post("/api/test-notifications", isAuthenticated, async (req: any, res) => {
    try {
      await jobMatchingService.processAllUserNotifications();
      res.json({ success: true, message: "Test job notifications processed" });
    } catch (error) {
      logger.error("Error processing test job notifications", error, { operation: 'test_job_notifications' });
      res.status(500).json({ message: "Failed to process test job notifications" });
    }
  });

  // Get personalized job matches for authenticated user
  app.get("/api/jobs/personalized", strictRateLimit, isAuthenticated, async (req: any, res) => {
    try {
      // For development mode, use mock user ID
      const userId = req.user?.claims?.sub || "dev-user-123";
      const matchingJobs = await jobMatchingService.findMatchingJobsForUser(userId);
      res.json(matchingJobs);
    } catch (error) {
      logger.error("Error getting personalized jobs", error, { operation: 'get_personalized_jobs' });
      res.status(500).json({ message: "Failed to get personalized jobs" });
    }
  });

  // SECURITY: Malware scanner status endpoint for monitoring
  app.get("/api/system/scanner-status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = await malwareScannerService.getStatus();
      const isReady = await malwareScannerService.isReady();
      
      res.json({
        ...status,
        ready: isReady,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error("Error checking scanner status", error, { operation: 'check_scanner_status' });
      res.status(500).json({ 
        message: "Failed to check scanner status", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Setup scheduled job notifications (runs daily at 9 AM)
  cron.schedule("0 9 * * *", async () => {
    logger.info("Running scheduled job notifications", { operation: 'cron_job_notifications', scheduler: 'node-cron' });
    await jobMatchingService.processAllUserNotifications();
  });

  // Import Apify service
  const { apifyService } = await import('./services/apifyService');
  
  // Import Cron service
  const { cronService } = await import('./services/cronService');

  // Job scraping endpoints
  app.post('/api/jobs/scrape', isAuthenticated, async (req: any, res) => {
    try {
      if (!apifyService.isServiceAvailable()) {
        return res.status(503).json({ 
          message: "Job scraping service not available - APIFY_API_TOKEN not configured" 
        });
      }

      const { query, location, count } = req.body;
      
      logger.info("Starting job scraping", { 
        operation: 'scrape_jobs',
        query,
        location,
        count,
        userId: req.user?.claims?.sub || 'dev-user'
      });

      const scrapedJobs = await apifyService.scrapeJobs({
        query: query || 'sales',
        location: location || 'New York, NY',
        count: count || 10
      });

      // Save jobs to database
      const savedJobs = [];
      for (const jobData of scrapedJobs) {
        try {
          const job = await storage.createJobOpportunity({
            title: jobData.title,
            company: jobData.company,
            location: jobData.location,
            pay: jobData.salary || 'Not specified',
            schedule: jobData.jobType || 'Full-time',
            description: jobData.description,
            url: jobData.url,
            tags: [jobData.source, jobData.jobType || 'general'].filter(Boolean),
            matchScore: 'potential',
            timeAgo: jobData.postedDate || 'Recently',
            isActive: true
          });
          savedJobs.push(job);
        } catch (error) {
          logger.warn("Failed to save job to database", { 
            error: error instanceof Error ? error.message : 'Unknown error',
            jobTitle: jobData.title 
          });
        }
      }

      logger.info("Job scraping completed", { 
        operation: 'scrape_jobs_complete',
        scrapedCount: scrapedJobs.length,
        savedCount: savedJobs.length,
        userId: req.user?.claims?.sub || 'dev-user'
      });

      res.json({
        message: `Successfully scraped and saved ${savedJobs.length} jobs`,
        jobs: savedJobs,
        totalScraped: scrapedJobs.length,
        totalSaved: savedJobs.length
      });
    } catch (error) {
      logger.error("Job scraping failed", error, { 
        operation: 'scrape_jobs_failed',
        userId: req.user?.claims?.sub || 'dev-user'
      });
      res.status(500).json({ 
        message: "Job scraping failed", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get all jobs
  app.get('/api/jobs', isAuthenticated, async (req: any, res) => {
    try {
      const { page = 1, limit = 20, search, location } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      logger.info("Fetching jobs", { 
        operation: 'fetch_jobs',
        page: Number(page),
        limit: Number(limit),
        search,
        location,
        userId: req.user?.claims?.sub || 'dev-user'
      });

      const jobs = await storage.getJobOpportunities({
        limit: Number(limit),
        offset,
        search: search as string,
        location: location as string
      });

      res.json(jobs);
    } catch (error) {
      logger.error("Failed to fetch jobs", error, { 
        operation: 'fetch_jobs_failed',
        userId: req.user?.claims?.sub || 'dev-user'
      });
      res.status(500).json({ 
        message: "Failed to fetch jobs", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get job by ID
  app.get('/api/jobs/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const job = await storage.getJobOpportunity(id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      logger.error("Failed to fetch job", error, { 
        operation: 'fetch_job_failed',
        jobId: req.params.id,
        userId: req.user?.claims?.sub || 'dev-user'
      });
      res.status(500).json({ 
        message: "Failed to fetch job", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Test Apify connection
  app.get('/api/jobs/test-apify', isAuthenticated, async (req: any, res) => {
    try {
      if (!apifyService.isServiceAvailable()) {
        return res.status(503).json({ 
          message: "Apify service not available - APIFY_API_TOKEN not configured" 
        });
      }

      const isConnected = await apifyService.testConnection();
      
      res.json({
        available: apifyService.isServiceAvailable(),
        connected: isConnected,
        message: isConnected ? "Apify connection successful" : "Apify connection failed"
      });
    } catch (error) {
      logger.error("Apify connection test failed", error, { 
        operation: 'test_apify_connection',
        userId: req.user?.claims?.sub || 'dev-user'
      });
      res.status(500).json({ 
        message: "Apify connection test failed", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add test jobs for demonstration
  app.post('/api/jobs/add-test-jobs', isAuthenticated, async (req: any, res) => {
    try {
      const testJobs = [
        {
          title: "Senior Sales Manager",
          company: "Tech Solutions Inc",
          location: "New York, NY",
          pay: "$80,000 - $100,000",
          schedule: "Full-time",
          description: "Lead a team of sales professionals in the technology sector. Manage client relationships and drive revenue growth.",
          url: "https://example.com/job1",
          tags: ["sales", "management", "technology"],
          matchScore: "great",
          timeAgo: "2 days ago",
          isActive: true
        },
        {
          title: "Part-time Customer Service Representative",
          company: "Retail Plus",
          location: "Remote",
          pay: "$20 - $25/hour",
          schedule: "Part-time",
          description: "Provide excellent customer service via phone and email. Flexible hours available.",
          url: "https://example.com/job2",
          tags: ["customer-service", "remote", "part-time"],
          matchScore: "good",
          timeAgo: "1 day ago",
          isActive: true
        },
        {
          title: "Marketing Coordinator",
          company: "Creative Agency",
          location: "Los Angeles, CA",
          pay: "$45,000 - $55,000",
          schedule: "Full-time",
          description: "Coordinate marketing campaigns and support the marketing team with various projects.",
          url: "https://example.com/job3",
          tags: ["marketing", "coordination", "creative"],
          matchScore: "potential",
          timeAgo: "3 days ago",
          isActive: true
        }
      ];

      const savedJobs = [];
      for (const jobData of testJobs) {
        try {
          const job = await storage.createJobOpportunity(jobData);
          savedJobs.push(job);
        } catch (error) {
          logger.warn("Failed to save test job", { 
            error: error instanceof Error ? error.message : 'Unknown error',
            jobTitle: jobData.title 
          });
        }
      }

      res.json({
        message: `Successfully added ${savedJobs.length} test jobs`,
        jobs: savedJobs
      });
    } catch (error) {
      logger.error("Failed to add test jobs", error, { 
        operation: 'add_test_jobs',
        userId: req.user?.claims?.sub || 'dev-user'
      });
      res.status(500).json({ 
        message: "Failed to add test jobs", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Cron service management endpoints
  app.get('/api/cron/status', isAuthenticated, async (req: any, res) => {
    try {
      const status = cronService.getStatus();
      res.json({
        success: true,
        status
      });
    } catch (error) {
      logger.error("Failed to get cron status", error, { 
        operation: 'get_cron_status',
        userId: req.user?.claims?.sub || 'dev-user'
      });
      res.status(500).json({ 
        message: "Failed to get cron status", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post('/api/cron/trigger', isAuthenticated, async (req: any, res) => {
    try {
      const result = await cronService.triggerScraping();
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      logger.error("Failed to trigger cron scraping", error, { 
        operation: 'trigger_cron_scraping',
        userId: req.user?.claims?.sub || 'dev-user'
      });
      res.status(500).json({ 
        message: "Failed to trigger cron scraping", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
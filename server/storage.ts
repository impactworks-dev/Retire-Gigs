import {
  type User,
  type InsertUser,
  type UpsertUser,
  type QuestionnaireResponse,
  type InsertQuestionnaireResponse,
  type UserPreferences,
  type InsertUserPreferences,
  type JobOpportunity,
  type InsertJobOpportunity,
  type SavedJob,
  type InsertSavedJob,
  type SavedNewsArticle,
  type InsertSavedNewsArticle,
  type Resume,
  type InsertResume,
  type NewsArticle,
  type InsertNewsArticle,
  users,
  questionnaireResponses,
  userPreferences,
  jobOpportunities,
  savedJobs,
  savedNewsArticles,
  resumes,
  newsArticles
} from "@shared/schema";
import { db, withDatabaseRetry } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Rate limiting for expensive operations
class RateLimiter {
  private operations: Map<string, number[]> = new Map();
  private readonly maxOperations = 10; // Max operations per window
  private readonly windowMs = 60000; // 1 minute window

  isAllowed(userId: string, operationType: string): boolean {
    const key = `${userId}:${operationType}`;
    const now = Date.now();
    const operations = this.operations.get(key) || [];
    
    // Remove operations outside the window
    const validOperations = operations.filter(time => now - time < this.windowMs);
    
    if (validOperations.length >= this.maxOperations) {
      return false;
    }
    
    validOperations.push(now);
    this.operations.set(key, validOperations);
    return true;
  }
}

const rateLimiter = new RateLimiter();

export interface IStorage {
  // User operations
  createUser(user: InsertUser): Promise<User>;
  getUser(userId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersWithPreferences(offset: number, limit: number): Promise<{ users: Array<{ user: User; preferences: UserPreferences | null }>; total: number }>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Questionnaire operations
  saveQuestionnaireResponse(response: InsertQuestionnaireResponse): Promise<QuestionnaireResponse>;
  getQuestionnaireResponse(userId: string): Promise<QuestionnaireResponse | undefined>;

  // User preferences operations
  saveUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  updateUserPreferences(userId: string, preferences: Partial<InsertUserPreferences>): Promise<UserPreferences>;

  // Job opportunities operations
  getJobOpportunities(): Promise<JobOpportunity[]>;
  getMatchingJobs(userId: string): Promise<JobOpportunity[]>;
  createJobOpportunity(job: InsertJobOpportunity): Promise<JobOpportunity>;
  updateJobOpportunity(id: string, updates: Partial<InsertJobOpportunity>): Promise<JobOpportunity>;
  deleteJobOpportunity(id: string): Promise<void>;

  // Saved jobs operations
  saveJob(userId: string, jobId: string): Promise<SavedJob>;
  unsaveJob(userId: string, jobId: string): Promise<void>;
  getUserSavedJobs(userId: string): Promise<Array<{ id: string; userId: string; jobId: string; savedAt: Date; job: JobOpportunity }>>;
  isJobSaved(userId: string, jobId: string): Promise<boolean>;

  // Saved news articles operations
  saveNewsArticle(userId: string, articleId: string): Promise<SavedNewsArticle>;
  unsaveNewsArticle(userId: string, articleId: string): Promise<void>;
  getUserSavedNewsArticles(userId: string): Promise<Array<{ id: string; userId: string; articleId: string; savedAt: Date; article: NewsArticle }>>;
  isNewsArticleSaved(userId: string, articleId: string): Promise<boolean>;

  // Resume operations
  createResume(resume: InsertResume): Promise<Resume>;
  getResume(id: string): Promise<Resume | undefined>;
  getUserResumes(userId: string): Promise<Resume[]>;
  updateResume(id: string, updates: Partial<InsertResume>): Promise<Resume>;
  deleteResume(id: string): Promise<void>;
  setDefaultResume(userId: string, resumeId: string): Promise<void>;

  // News articles operations
  getNewsArticles(): Promise<NewsArticle[]>;
  getNewsArticle(id: string): Promise<NewsArticle | undefined>;
  createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle>;
  updateNewsArticle(id: string, updates: Partial<InsertNewsArticle>): Promise<NewsArticle>;
  deleteNewsArticle(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private questionnaireResponses: Map<string, QuestionnaireResponse>;
  private userPreferences: Map<string, UserPreferences>;
  private jobOpportunities: Map<string, JobOpportunity>;
  private savedJobs: Map<string, SavedJob>;
  private savedNewsArticles: Map<string, SavedNewsArticle>;
  private resumes: Map<string, Resume>;
  private newsArticles: Map<string, NewsArticle>;

  constructor() {
    this.users = new Map();
    this.questionnaireResponses = new Map();
    this.userPreferences = new Map();
    this.jobOpportunities = new Map();
    this.savedJobs = new Map();
    this.savedNewsArticles = new Map();
    this.resumes = new Map();
    this.newsArticles = new Map();

    // Initialize with some sample job opportunities
    this.initializeSampleJobs();
  }

  private initializeSampleJobs() {
    const sampleJobs: InsertJobOpportunity[] = [
      {
        title: "Community Garden Coordinator",
        company: "Green Spaces Initiative",
        location: "Within 10 miles",
        pay: "$18/hour",
        schedule: "Part-time",
        description: "Help manage community garden programs, coordinate volunteers, and maintain outdoor spaces. Perfect for someone who loves gardening and working with people.",
        tags: ["outdoor", "helping", "hands-on"],
        matchScore: "great",
        timeAgo: "2 days ago",
        isActive: true
      },
      {
        title: "Reading Tutor",
        company: "Oakwood Elementary",
        location: "Close to home",
        pay: "$16/hour",
        schedule: "2-3 days/week",
        description: "Help elementary students with reading skills in a quiet, supportive environment. Flexible morning hours, working with small groups.",
        tags: ["quiet", "helping", "professional"],
        matchScore: "good",
        timeAgo: "4 days ago",
        isActive: true
      },
      {
        title: "Craft Workshop Assistant",
        company: "Community Arts Center",
        location: "Within 15 miles",
        pay: "$15/hour",
        schedule: "Weekends",
        description: "Support craft workshops for adults, help with setup, and assist participants. Great for creative people who enjoy hands-on projects.",
        tags: ["creative", "hands-on", "social"],
        matchScore: "potential",
        timeAgo: "1 week ago",
        isActive: true
      },
      {
        title: "Senior Companion",
        company: "Caring Connections",
        location: "Client homes",
        pay: "$20/hour",
        schedule: "Flexible",
        description: "Provide companionship to seniors in their homes. Light conversation, reading together, and helping with simple tasks. Very rewarding work.",
        tags: ["social", "helping", "quiet"],
        matchScore: "great",
        timeAgo: "3 days ago",
        isActive: true
      }
    ];

    sampleJobs.forEach(job => {
      const id = randomUUID();
      this.jobOpportunities.set(id, {
        ...job,
        id,
        url: job.url || null,
        createdAt: new Date(),
        matchScore: job.matchScore || null,
        isActive: job.isActive ?? true
      });
    });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      email: null,
      firstName: null,
      lastName: null,
      streetAddress: null,
      city: null,
      state: null,
      zipCode: null,
      latitude: null,
      longitude: null,
      phoneNumber: insertUser.phoneNumber || null,
      profileImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async getUser(userId: string): Promise<User | undefined> {
    return this.users.get(userId);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const userArray = Array.from(this.users.values());
    return userArray.find(user => user.email === email);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUsersWithPreferences(offset: number, limit: number): Promise<{ users: Array<{ user: User; preferences: UserPreferences | null }>; total: number }> {
    const allUsers = Array.from(this.users.values());
    const total = allUsers.length;
    
    // Apply pagination to users
    const paginatedUsers = allUsers.slice(offset, offset + limit);
    
    // Get preferences for each paginated user
    const usersWithPreferences = paginatedUsers.map(user => {
      const preferences = Array.from(this.userPreferences.values()).find(
        pref => pref.userId === user.id
      ) || null;
      
      return { user, preferences };
    });
    
    return { users: usersWithPreferences, total };
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = this.users.get(userData.id!);
    const user: User = {
      ...userData,
      id: userData.id || randomUUID(),
      email: userData.email || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      streetAddress: userData.streetAddress || null,
      city: userData.city || null,
      state: userData.state || null,
      zipCode: userData.zipCode || null,
      latitude: userData.latitude || null,
      longitude: userData.longitude || null,
      phoneNumber: userData.phoneNumber || null,
      profileImageUrl: userData.profileImageUrl || null,
      createdAt: existingUser?.createdAt || new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  async saveQuestionnaireResponse(response: InsertQuestionnaireResponse): Promise<QuestionnaireResponse> {
    const id = randomUUID();
    const questionnaireResponse: QuestionnaireResponse = {
      ...response,
      id,
      completedAt: new Date()
    };
    this.questionnaireResponses.set(id, questionnaireResponse);
    return questionnaireResponse;
  }

  async getQuestionnaireResponse(userId: string): Promise<QuestionnaireResponse | undefined> {
    return Array.from(this.questionnaireResponses.values()).find(
      response => response.userId === userId
    );
  }

  async saveUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    // Check if user already has preferences and update instead of creating duplicate
    const existingPref = Array.from(this.userPreferences.values()).find(
      pref => pref.userId === preferences.userId
    );
    
    if (existingPref) {
      // Update existing preferences
      const updated: UserPreferences = {
        ...existingPref,
        ...preferences,
        id: existingPref.id,
        updatedAt: new Date(),
        notificationsEnabled: preferences.notificationsEnabled ?? existingPref.notificationsEnabled,
        smsNotificationsEnabled: preferences.smsNotificationsEnabled ?? existingPref.smsNotificationsEnabled,
        schedulePreference: preferences.schedulePreference || existingPref.schedulePreference,
        preferredJobTypes: preferences.preferredJobTypes ?? existingPref.preferredJobTypes,
        preferredLocations: preferences.preferredLocations ?? existingPref.preferredLocations
      };
      this.userPreferences.set(existingPref.id, updated);
      return updated;
    } else {
      // Create new preferences
      const id = randomUUID();
      const userPreferences: UserPreferences = {
        ...preferences,
        id,
        updatedAt: new Date(),
        notificationsEnabled: preferences.notificationsEnabled ?? true,
        smsNotificationsEnabled: preferences.smsNotificationsEnabled ?? false,
        schedulePreference: preferences.schedulePreference || "weekly",
        preferredJobTypes: preferences.preferredJobTypes || null,
        preferredLocations: preferences.preferredLocations || null
      };
      this.userPreferences.set(id, userPreferences);
      return userPreferences;
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    return Array.from(this.userPreferences.values()).find(
      prefs => prefs.userId === userId
    );
  }

  async updateUserPreferences(userId: string, preferences: Partial<InsertUserPreferences>): Promise<UserPreferences> {
    const existing = await this.getUserPreferences(userId);
    if (!existing) {
      throw new Error("User preferences not found");
    }

    const updated: UserPreferences = {
      ...existing,
      ...preferences,
      updatedAt: new Date()
    };
    this.userPreferences.set(existing.id, updated);
    return updated;
  }

  async getJobOpportunities(): Promise<JobOpportunity[]> {
    return Array.from(this.jobOpportunities.values()).filter(job => job.isActive);
  }

  async getMatchingJobs(userId: string): Promise<JobOpportunity[]> {
    // For now, return all active jobs
    // In a real implementation, this would use the questionnaire responses to match jobs
    return this.getJobOpportunities();
  }

  async createJobOpportunity(job: InsertJobOpportunity): Promise<JobOpportunity> {
    const id = randomUUID();
    const jobOpportunity: JobOpportunity = {
      ...job,
      id,
      url: job.url || null,
      createdAt: new Date(),
      matchScore: job.matchScore || null,
      isActive: job.isActive ?? true
    };
    this.jobOpportunities.set(id, jobOpportunity);
    return jobOpportunity;
  }

  async updateJobOpportunity(id: string, updates: Partial<InsertJobOpportunity>): Promise<JobOpportunity> {
    const existing = this.jobOpportunities.get(id);
    if (!existing) {
      throw new Error("Job opportunity not found");
    }

    const updated: JobOpportunity = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt
    };
    this.jobOpportunities.set(id, updated);
    return updated;
  }

  async deleteJobOpportunity(id: string): Promise<void> {
    const existing = this.jobOpportunities.get(id);
    if (!existing) {
      throw new Error("Job opportunity not found");
    }

    // Soft delete by setting isActive to false
    const updated: JobOpportunity = {
      ...existing,
      isActive: false
    };
    this.jobOpportunities.set(id, updated);
  }

  async saveJob(userId: string, jobId: string): Promise<SavedJob> {
    const id = randomUUID();
    const savedJob: SavedJob = {
      id,
      userId,
      jobId,
      savedAt: new Date()
    };
    this.savedJobs.set(id, savedJob);
    return savedJob;
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    const entries = Array.from(this.savedJobs.entries());
    for (const [id, savedJob] of entries) {
      if (savedJob.userId === userId && savedJob.jobId === jobId) {
        this.savedJobs.delete(id);
        return;
      }
    }
  }

  async getUserSavedJobs(userId: string): Promise<Array<{ id: string; userId: string; jobId: string; savedAt: Date; job: JobOpportunity }>> {
    const userSavedJobs = Array.from(this.savedJobs.values())
      .filter(savedJob => savedJob.userId === userId);

    const result: Array<{ id: string; userId: string; jobId: string; savedAt: Date; job: JobOpportunity }> = [];
    for (const savedJob of userSavedJobs) {
      const job = this.jobOpportunities.get(savedJob.jobId);
      if (job && job.isActive) {
        result.push({
          id: savedJob.id,
          userId: savedJob.userId,
          jobId: savedJob.jobId,
          savedAt: savedJob.savedAt || new Date(),
          job: job
        });
      }
    }
    return result;
  }

  async isJobSaved(userId: string, jobId: string): Promise<boolean> {
    return Array.from(this.savedJobs.values())
      .some(savedJob => savedJob.userId === userId && savedJob.jobId === jobId);
  }

  async saveNewsArticle(userId: string, articleId: string): Promise<SavedNewsArticle> {
    const id = randomUUID();
    const savedArticle: SavedNewsArticle = {
      id,
      userId,
      articleId,
      savedAt: new Date()
    };
    this.savedNewsArticles.set(id, savedArticle);
    return savedArticle;
  }

  async unsaveNewsArticle(userId: string, articleId: string): Promise<void> {
    const entries = Array.from(this.savedNewsArticles.entries());
    for (const [id, savedArticle] of entries) {
      if (savedArticle.userId === userId && savedArticle.articleId === articleId) {
        this.savedNewsArticles.delete(id);
        return;
      }
    }
  }

  async getUserSavedNewsArticles(userId: string): Promise<Array<{ id: string; userId: string; articleId: string; savedAt: Date; article: NewsArticle }>> {
    const userSavedArticles = Array.from(this.savedNewsArticles.values())
      .filter(savedArticle => savedArticle.userId === userId);

    const result: Array<{ id: string; userId: string; articleId: string; savedAt: Date; article: NewsArticle }> = [];
    for (const savedArticle of userSavedArticles) {
      const article = this.newsArticles.get(savedArticle.articleId);
      if (article && article.isPublished) {
        result.push({
          id: savedArticle.id,
          userId: savedArticle.userId,
          articleId: savedArticle.articleId,
          savedAt: savedArticle.savedAt || new Date(),
          article: article
        });
      }
    }
    return result;
  }

  async isNewsArticleSaved(userId: string, articleId: string): Promise<boolean> {
    return Array.from(this.savedNewsArticles.values())
      .some(savedArticle => savedArticle.userId === userId && savedArticle.articleId === articleId);
  }

  async createResume(insertResume: InsertResume): Promise<Resume> {
    const id = randomUUID();
    const resume: Resume = {
      ...insertResume,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      summary: insertResume.summary || null,
      skills: insertResume.skills || null,
      education: insertResume.education || null,
      workExperience: insertResume.workExperience || null,
      certifications: insertResume.certifications || null,
      achievements: insertResume.achievements || null,
      uploadedFileUrl: insertResume.uploadedFileUrl || null,
      isDefault: insertResume.isDefault ?? false
    };
    this.resumes.set(id, resume);
    return resume;
  }

  async getResume(id: string): Promise<Resume | undefined> {
    return this.resumes.get(id);
  }

  async getUserResumes(userId: string): Promise<Resume[]> {
    return Array.from(this.resumes.values())
      .filter(resume => resume.userId === userId);
  }

  async updateResume(id: string, updates: Partial<InsertResume>): Promise<Resume> {
    const existing = this.resumes.get(id);
    if (!existing) {
      throw new Error("Resume not found");
    }

    const updated: Resume = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    this.resumes.set(id, updated);
    return updated;
  }

  async deleteResume(id: string): Promise<void> {
    this.resumes.delete(id);
  }

  async setDefaultResume(userId: string, resumeId: string): Promise<void> {
    // First, unset any existing default for this user
    Array.from(this.resumes.entries()).forEach(([id, resume]) => {
      if (resume.userId === userId && resume.isDefault) {
        this.resumes.set(id, { ...resume, isDefault: false, updatedAt: new Date() });
      }
    });

    // Set the specified resume as default
    const targetResume = this.resumes.get(resumeId);
    if (targetResume && targetResume.userId === userId) {
      this.resumes.set(resumeId, { ...targetResume, isDefault: true, updatedAt: new Date() });
    } else {
      throw new Error("Resume not found or access denied");
    }
  }

  async getNewsArticles(): Promise<NewsArticle[]> {
    return Array.from(this.newsArticles.values())
      .filter(article => article.isPublished)
      .sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0));
  }

  async getNewsArticle(id: string): Promise<NewsArticle | undefined> {
    return this.newsArticles.get(id);
  }

  async createNewsArticle(insertArticle: InsertNewsArticle): Promise<NewsArticle> {
    const id = randomUUID();
    const article: NewsArticle = {
      ...insertArticle,
      id,
      isPublished: insertArticle.isPublished ?? true,
      imageUrl: insertArticle.imageUrl || null,
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.newsArticles.set(id, article);
    return article;
  }

  async updateNewsArticle(id: string, updates: Partial<InsertNewsArticle>): Promise<NewsArticle> {
    const existing = this.newsArticles.get(id);
    if (!existing) {
      throw new Error("News article not found");
    }

    const updated: NewsArticle = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date()
    };
    this.newsArticles.set(id, updated);
    return updated;
  }

  async deleteNewsArticle(id: string): Promise<void> {
    const existing = this.newsArticles.get(id);
    if (!existing) {
      throw new Error("News article not found");
    }

    // Soft delete by setting isPublished to false
    const updated: NewsArticle = {
      ...existing,
      isPublished: false,
      updatedAt: new Date()
    };
    this.newsArticles.set(id, updated);
  }
}

// Database-backed storage implementation
export class DatabaseStorage implements IStorage {
  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      return await withDatabaseRetry(async () => {
        const [user] = await db
          .insert(users)
          .values(insertUser)
          .returning();
        return user;
      });
    } catch (error: any) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  async getUser(userId: string): Promise<User | undefined> {
    try {
      return await withDatabaseRetry(async () => {
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        return user || undefined;
      });
    } catch (error: any) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      return await withDatabaseRetry(async () => {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user || undefined;
      });
    } catch (error: any) {
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await withDatabaseRetry(async () => {
        return await db.select().from(users);
      });
    } catch (error: any) {
      throw new Error(`Failed to get all users: ${error.message}`);
    }
  }

  async getUsersWithPreferences(offset: number, limit: number): Promise<{ users: Array<{ user: User; preferences: UserPreferences | null }>; total: number }> {
    try {
      // Get total count of users first
      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(users);
      const total = Number(totalResult[0]?.count || 0); // Ensure total is a number
      
      // Get paginated users with their preferences using a left join
      // The unique constraint on userId ensures no duplicate users
      const usersWithPrefs = await db
        .select({
          user: users,
          preferences: userPreferences
        })
        .from(users)
        .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
        .limit(limit)
        .offset(offset);
      
      const result = usersWithPrefs.map(row => ({
        user: row.user,
        preferences: row.preferences
      }));
      
      return { users: result, total };
    } catch (error: any) {
      throw new Error(`Failed to get users with preferences: ${error.message}`);
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    return await withDatabaseRetry(async () => {
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    });
  }

  async saveQuestionnaireResponse(response: InsertQuestionnaireResponse): Promise<QuestionnaireResponse> {
    return await withDatabaseRetry(async () => {
      const [questionnaireResponse] = await db
        .insert(questionnaireResponses)
        .values(response)
        .returning();
      return questionnaireResponse;
    });
  }

  async getQuestionnaireResponse(userId: string): Promise<QuestionnaireResponse | undefined> {
    return await withDatabaseRetry(async () => {
      const [response] = await db
        .select()
        .from(questionnaireResponses)
        .where(eq(questionnaireResponses.userId, userId));
      return response || undefined;
    });
  }

  async saveUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    // Use upsert to handle unique constraint on userId
    const [userPrefs] = await db
      .insert(userPreferences)
      .values(preferences)
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          notificationsEnabled: preferences.notificationsEnabled,
          smsNotificationsEnabled: preferences.smsNotificationsEnabled,
          schedulePreference: preferences.schedulePreference,
          preferredJobTypes: preferences.preferredJobTypes,
          preferredLocations: preferences.preferredLocations,
          updatedAt: new Date()
        }
      })
      .returning();
    return userPrefs;
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return prefs || undefined;
  }

  async updateUserPreferences(userId: string, preferences: Partial<InsertUserPreferences>): Promise<UserPreferences> {
    const [updated] = await db
      .update(userPreferences)
      .set({ ...preferences, updatedAt: new Date() })
      .where(eq(userPreferences.userId, userId))
      .returning();

    if (!updated) {
      throw new Error("User preferences not found");
    }

    return updated;
  }

  async getJobOpportunities(): Promise<JobOpportunity[]> {
    return await withDatabaseRetry(async () => {
      return await db
        .select()
        .from(jobOpportunities)
        .where(eq(jobOpportunities.isActive, true));
    });
  }

  async getMatchingJobs(userId: string): Promise<JobOpportunity[]> {
    // For now, return all active jobs
    // In a real implementation, this would use the questionnaire responses to match jobs
    return this.getJobOpportunities();
  }

  async createJobOpportunity(job: InsertJobOpportunity): Promise<JobOpportunity> {
    try {
      const [jobOpportunity] = await db
        .insert(jobOpportunities)
        .values(job)
        .returning();
      return jobOpportunity;
    } catch (error: any) {
      throw new Error(`Failed to create job opportunity: ${error.message}`);
    }
  }

  async updateJobOpportunity(id: string, updates: Partial<InsertJobOpportunity>): Promise<JobOpportunity> {
    try {
      const [updated] = await db
        .update(jobOpportunities)
        .set(updates)
        .where(eq(jobOpportunities.id, id))
        .returning();

      if (!updated) {
        throw new Error("Job opportunity not found");
      }

      return updated;
    } catch (error: any) {
      if (error.message === "Job opportunity not found") {
        throw error;
      }
      throw new Error(`Failed to update job opportunity: ${error.message}`);
    }
  }

  async deleteJobOpportunity(id: string): Promise<void> {
    try {
      // Soft delete by setting isActive to false
      const [updated] = await db
        .update(jobOpportunities)
        .set({ isActive: false })
        .where(eq(jobOpportunities.id, id))
        .returning();

      if (!updated) {
        throw new Error("Job opportunity not found");
      }
    } catch (error: any) {
      if (error.message === "Job opportunity not found") {
        throw error;
      }
      throw new Error(`Failed to delete job opportunity: ${error.message}`);
    }
  }

  async saveJob(userId: string, jobId: string): Promise<SavedJob> {
    // Rate limiting for expensive save operations
    if (!rateLimiter.isAllowed(userId, 'saveJob')) {
      throw new Error("Rate limit exceeded for save operations. Please try again later.");
    }

    try {
      const [savedJob] = await db
        .insert(savedJobs)
        .values({ userId, jobId })
        .onConflictDoNothing()
        .returning();

      // If no savedJob was returned due to conflict, fetch the existing one
      if (!savedJob) {
        const [existing] = await db
          .select()
          .from(savedJobs)
          .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));
        return existing;
      }

      return savedJob;
    } catch (error: any) {
      throw new Error(`Failed to save job: ${error.message}`);
    }
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    // Rate limiting for expensive unsave operations
    if (!rateLimiter.isAllowed(userId, 'unsaveJob')) {
      throw new Error("Rate limit exceeded for unsave operations. Please try again later.");
    }

    try {
      await db
        .delete(savedJobs)
        .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));
    } catch (error: any) {
      throw new Error(`Failed to unsave job: ${error.message}`);
    }
  }

  async getUserSavedJobs(userId: string): Promise<Array<{ id: string; userId: string; jobId: string; savedAt: Date; job: JobOpportunity }>> {
    const results = await db
      .select()
      .from(savedJobs)
      .innerJoin(jobOpportunities, eq(savedJobs.jobId, jobOpportunities.id))
      .where(and(eq(savedJobs.userId, userId), eq(jobOpportunities.isActive, true)));

    return results.map(result => ({
      id: result.saved_jobs.id,
      userId: result.saved_jobs.userId,
      jobId: result.saved_jobs.jobId,
      savedAt: result.saved_jobs.savedAt || new Date(),
      job: result.job_opportunities
    }));
  }

  async isJobSaved(userId: string, jobId: string): Promise<boolean> {
    const [result] = await db
      .select({ count: sql`1` })
      .from(savedJobs)
      .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
      .limit(1);

    return !!result;
  }

  async saveNewsArticle(userId: string, articleId: string): Promise<SavedNewsArticle> {
    // Rate limiting for expensive save operations
    if (!rateLimiter.isAllowed(userId, 'saveNewsArticle')) {
      throw new Error("Rate limit exceeded for save operations. Please try again later.");
    }

    try {
      const [savedArticle] = await db
        .insert(savedNewsArticles)
        .values({ userId, articleId })
        .onConflictDoNothing()
        .returning();

      // If no savedArticle was returned due to conflict, fetch the existing one
      if (!savedArticle) {
        const [existing] = await db
          .select()
          .from(savedNewsArticles)
          .where(and(eq(savedNewsArticles.userId, userId), eq(savedNewsArticles.articleId, articleId)));
        return existing;
      }

      return savedArticle;
    } catch (error: any) {
      throw new Error(`Failed to save news article: ${error.message}`);
    }
  }

  async unsaveNewsArticle(userId: string, articleId: string): Promise<void> {
    // Rate limiting for expensive unsave operations
    if (!rateLimiter.isAllowed(userId, 'unsaveNewsArticle')) {
      throw new Error("Rate limit exceeded for unsave operations. Please try again later.");
    }

    try {
      await db
        .delete(savedNewsArticles)
        .where(and(eq(savedNewsArticles.userId, userId), eq(savedNewsArticles.articleId, articleId)));
    } catch (error: any) {
      throw new Error(`Failed to unsave news article: ${error.message}`);
    }
  }

  async getUserSavedNewsArticles(userId: string): Promise<Array<{ id: string; userId: string; articleId: string; savedAt: Date; article: NewsArticle }>> {
    const results = await db
      .select()
      .from(savedNewsArticles)
      .innerJoin(newsArticles, eq(savedNewsArticles.articleId, newsArticles.id))
      .where(and(eq(savedNewsArticles.userId, userId), eq(newsArticles.isPublished, true)));

    return results.map(result => ({
      id: result.saved_news_articles.id,
      userId: result.saved_news_articles.userId,
      articleId: result.saved_news_articles.articleId,
      savedAt: result.saved_news_articles.savedAt || new Date(),
      article: result.news_articles
    }));
  }

  async isNewsArticleSaved(userId: string, articleId: string): Promise<boolean> {
    const [result] = await db
      .select({ count: sql`1` })
      .from(savedNewsArticles)
      .where(and(eq(savedNewsArticles.userId, userId), eq(savedNewsArticles.articleId, articleId)))
      .limit(1);

    return !!result;
  }

  async createResume(insertResume: InsertResume): Promise<Resume> {
    const [resume] = await db
      .insert(resumes)
      .values(insertResume)
      .returning();
    return resume;
  }

  async getResume(id: string): Promise<Resume | undefined> {
    const [resume] = await db.select().from(resumes).where(eq(resumes.id, id));
    return resume || undefined;
  }

  async getUserResumes(userId: string): Promise<Resume[]> {
    return await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId));
  }

  async updateResume(id: string, updates: Partial<InsertResume>): Promise<Resume> {
    const [updated] = await db
      .update(resumes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(resumes.id, id))
      .returning();

    if (!updated) {
      throw new Error("Resume not found");
    }

    return updated;
  }

  async deleteResume(id: string): Promise<void> {
    await db.delete(resumes).where(eq(resumes.id, id));
  }

  async setDefaultResume(userId: string, resumeId: string): Promise<void> {
    try {
      // Use a transaction to ensure atomicity and prevent race conditions
      await db.transaction(async (tx) => {
        // First, unset any existing default for this user
        await tx
          .update(resumes)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(resumes.userId, userId), eq(resumes.isDefault, true)));

        // Set the specified resume as default
        const [updated] = await tx
          .update(resumes)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
          .returning();

        if (!updated) {
          throw new Error("Resume not found or access denied");
        }
      });
    } catch (error: any) {
      // Standardize error handling
      if (error.message === "Resume not found or access denied") {
        throw error;
      }
      throw new Error(`Failed to set default resume: ${error.message}`);
    }
  }

  async getNewsArticles(): Promise<NewsArticle[]> {
    return await db
      .select()
      .from(newsArticles)
      .where(eq(newsArticles.isPublished, true))
      .orderBy(sql`${newsArticles.publishedAt} DESC`);
  }

  async getNewsArticle(id: string): Promise<NewsArticle | undefined> {
    const [article] = await db
      .select()
      .from(newsArticles)
      .where(eq(newsArticles.id, id));
    return article || undefined;
  }

  async createNewsArticle(insertArticle: InsertNewsArticle): Promise<NewsArticle> {
    try {
      const [article] = await db
        .insert(newsArticles)
        .values(insertArticle)
        .returning();
      return article;
    } catch (error: any) {
      throw new Error(`Failed to create news article: ${error.message}`);
    }
  }

  async updateNewsArticle(id: string, updates: Partial<InsertNewsArticle>): Promise<NewsArticle> {
    try {
      const [updated] = await db
        .update(newsArticles)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(newsArticles.id, id))
        .returning();

      if (!updated) {
        throw new Error("News article not found");
      }

      return updated;
    } catch (error: any) {
      if (error.message === "News article not found") {
        throw error;
      }
      throw new Error(`Failed to update news article: ${error.message}`);
    }
  }

  async deleteNewsArticle(id: string): Promise<void> {
    try {
      // Soft delete by setting isPublished to false
      const [updated] = await db
        .update(newsArticles)
        .set({ isPublished: false, updatedAt: new Date() })
        .where(eq(newsArticles.id, id))
        .returning();

      if (!updated) {
        throw new Error("News article not found");
      }
    } catch (error: any) {
      if (error.message === "News article not found") {
        throw error;
      }
      throw new Error(`Failed to delete news article: ${error.message}`);
    }
  }
}

export const storage = new DatabaseStorage();
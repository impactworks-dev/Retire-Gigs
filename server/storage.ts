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
  users,
  questionnaireResponses,
  userPreferences,
  jobOpportunities,
  savedJobs
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  createUser(user: InsertUser): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
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
  
  // Saved jobs operations
  saveJob(userId: string, jobId: string): Promise<SavedJob>;
  unsaveJob(userId: string, jobId: string): Promise<void>;
  getUserSavedJobs(userId: string): Promise<Array<{ id: string; userId: string; jobId: string; savedAt: Date; job: JobOpportunity }>>;
  isJobSaved(userId: string, jobId: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private questionnaireResponses: Map<string, QuestionnaireResponse>;
  private userPreferences: Map<string, UserPreferences>;
  private jobOpportunities: Map<string, JobOpportunity>;
  private savedJobs: Map<string, SavedJob>;

  constructor() {
    this.users = new Map();
    this.questionnaireResponses = new Map();
    this.userPreferences = new Map();
    this.jobOpportunities = new Map();
    this.savedJobs = new Map();
    
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
      profileImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
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
    const id = randomUUID();
    const userPreferences: UserPreferences = {
      ...preferences,
      id,
      updatedAt: new Date(),
      notificationsEnabled: preferences.notificationsEnabled ?? true,
      schedulePreference: preferences.schedulePreference || "weekly",
      preferredJobTypes: preferences.preferredJobTypes || null,
      preferredLocations: preferences.preferredLocations || null
    };
    this.userPreferences.set(id, userPreferences);
    return userPreferences;
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
      createdAt: new Date(),
      matchScore: job.matchScore || null,
      isActive: job.isActive ?? true
    };
    this.jobOpportunities.set(id, jobOpportunity);
    return jobOpportunity;
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
}

// Database-backed storage implementation
export class DatabaseStorage implements IStorage {
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
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
  }

  async saveQuestionnaireResponse(response: InsertQuestionnaireResponse): Promise<QuestionnaireResponse> {
    const [questionnaireResponse] = await db
      .insert(questionnaireResponses)
      .values(response)
      .returning();
    return questionnaireResponse;
  }

  async getQuestionnaireResponse(userId: string): Promise<QuestionnaireResponse | undefined> {
    const [response] = await db
      .select()
      .from(questionnaireResponses)
      .where(eq(questionnaireResponses.userId, userId));
    return response || undefined;
  }

  async saveUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    const [userPrefs] = await db
      .insert(userPreferences)
      .values(preferences)
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
    return await db
      .select()
      .from(jobOpportunities)
      .where(eq(jobOpportunities.isActive, true));
  }

  async getMatchingJobs(userId: string): Promise<JobOpportunity[]> {
    // For now, return all active jobs
    // In a real implementation, this would use the questionnaire responses to match jobs
    return this.getJobOpportunities();
  }

  async createJobOpportunity(job: InsertJobOpportunity): Promise<JobOpportunity> {
    const [jobOpportunity] = await db
      .insert(jobOpportunities)
      .values(job)
      .returning();
    return jobOpportunity;
  }

  async saveJob(userId: string, jobId: string): Promise<SavedJob> {
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
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    await db
      .delete(savedJobs)
      .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));
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
}

export const storage = new DatabaseStorage();

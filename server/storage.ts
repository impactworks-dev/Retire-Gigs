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
  users,
  questionnaireResponses,
  userPreferences,
  jobOpportunities
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private questionnaireResponses: Map<string, QuestionnaireResponse>;
  private userPreferences: Map<string, UserPreferences>;
  private jobOpportunities: Map<string, JobOpportunity>;

  constructor() {
    this.users = new Map();
    this.questionnaireResponses = new Map();
    this.userPreferences = new Map();
    this.jobOpportunities = new Map();
    
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
}

export const storage = new DatabaseStorage();

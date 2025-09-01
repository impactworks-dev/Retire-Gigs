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
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  createUser(user: InsertUser): Promise<User>;
  getUser(userId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
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

  async getUser(userId: string): Promise<User | undefined> {
    return this.users.get(userId);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
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

  async getUser(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
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

  async saveNewsArticle(userId: string, articleId: string): Promise<SavedNewsArticle> {
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
  }

  async unsaveNewsArticle(userId: string, articleId: string): Promise<void> {
    await db
      .delete(savedNewsArticles)
      .where(and(eq(savedNewsArticles.userId, userId), eq(savedNewsArticles.articleId, articleId)));
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
    // First, unset any existing default for this user
    await db
      .update(resumes)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(resumes.userId, userId), eq(resumes.isDefault, true)));

    // Set the specified resume as default
    const [updated] = await db
      .update(resumes)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .returning();

    if (!updated) {
      throw new Error("Resume not found or access denied");
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
    const [article] = await db
      .insert(newsArticles)
      .values(insertArticle)
      .returning();
    return article;
  }
}

export const storage = new DatabaseStorage();
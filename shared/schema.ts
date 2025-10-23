import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define explicit schemas for resume JSONB fields to ensure type safety
export const skillSchema = z.string().min(1, "Skill cannot be empty");
export const skillsArraySchema = z.array(skillSchema);

export const educationEntrySchema = z.object({
  institution: z.string().min(1, "Institution is required"),
  degree: z.string().min(1, "Degree is required"),
  year: z.string().min(1, "Year is required"),
  details: z.string().optional()
});
export const educationArraySchema = z.array(educationEntrySchema);

export const workExperienceEntrySchema = z.object({
  company: z.string().min(1, "Company is required"),
  position: z.string().min(1, "Position is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  description: z.string().optional()
});
export const workExperienceArraySchema = z.array(workExperienceEntrySchema);

export const certificationEntrySchema = z.object({
  name: z.string().min(1, "Certification name is required"),
  issuer: z.string().min(1, "Issuer is required"),
  date: z.string().optional()
});
export const certificationsArraySchema = z.array(certificationEntrySchema);

export const achievementSchema = z.string().min(1, "Achievement cannot be empty");
export const achievementsArraySchema = z.array(achievementSchema);

// SECURITY: Add validation schemas for user preferences and questionnaire responses
export const jobTypeSchema = z.enum([
  "hands-on", "outdoor", "creative", "helping", "social", "quiet", "tech", "professional"
], { message: "Invalid job type" });

export const locationPreferenceSchema = z.enum([
  "remote", "closetohome", "anywhere", "flexible"
], { message: "Invalid location preference" });

export const schedulePreferenceSchema = z.enum([
  "daily", "weekly", "biweekly", "monthly"
], { message: "Invalid schedule preference" });

// Arrays with reasonable limits to prevent abuse
export const preferredJobTypesSchema = z.array(jobTypeSchema)
  .min(1, "At least one job type must be selected")
  .max(8, "Maximum 8 job types allowed")
  .refine(arr => arr.length === new Set(arr).size, "Duplicate job types not allowed");

export const preferredLocationsSchema = z.array(locationPreferenceSchema)
  .min(1, "At least one location preference must be selected")
  .max(3, "Maximum 3 location preferences allowed")
  .refine(arr => arr.length === new Set(arr).size, "Duplicate location preferences not allowed");

// Questionnaire responses validation with reasonable limits
export const questionnaireResponseValueSchema = z.union([
  z.string().max(500, "Response text too long"), // Limit text responses
  z.number().min(0).max(10), // Limit numeric responses (e.g., ratings)
  z.boolean(),
  z.array(z.string().max(100, "Option text too long")).max(10, "Too many options selected")
]);

export const questionnaireResponsesSchema = z.record(
  z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid question ID format").max(50, "Question ID too long"),
  questionnaireResponseValueSchema
).refine(
  (responses) => Object.keys(responses).length <= 50,
  "Too many questionnaire responses"
).refine(
  (responses) => Object.keys(responses).length >= 1,
  "At least one questionnaire response is required"
);

// Types for resume JSONB field schemas
export type Skill = z.infer<typeof skillSchema>;
export type SkillsArray = z.infer<typeof skillsArraySchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;
export type EducationArray = z.infer<typeof educationArraySchema>;
export type WorkExperienceEntry = z.infer<typeof workExperienceEntrySchema>;
export type WorkExperienceArray = z.infer<typeof workExperienceArraySchema>;
export type CertificationEntry = z.infer<typeof certificationEntrySchema>;
export type CertificationsArray = z.infer<typeof certificationsArraySchema>;
export type Achievement = z.infer<typeof achievementSchema>;
export type AchievementsArray = z.infer<typeof achievementsArraySchema>;

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  age: text("age").notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  latitude: text("latitude"), // GPS coordinates
  longitude: text("longitude"), // GPS coordinates
  phoneNumber: varchar("phone_number"), // Phone number for SMS notifications
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const questionnaireResponses = pgTable("questionnaire_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  responses: jsonb("responses").notNull(),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(), // Ensure one preferences record per user
  notificationsEnabled: boolean("notifications_enabled").default(true),
  smsNotificationsEnabled: boolean("sms_notifications_enabled").default(false),
  schedulePreference: text("schedule_preference").default("weekly"), // daily, weekly, biweekly
  preferredJobTypes: jsonb("preferred_job_types"), // Array of job types: "outdoorwork", "deskwork", etc.
  preferredLocations: jsonb("preferred_locations"), // Array of location preferences: "remote", "closetohome", etc.
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobOpportunities = pgTable("job_opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  pay: text("pay").notNull(),
  schedule: text("schedule").notNull(),
  description: text("description").notNull(),
  url: text("url"), // External URL to the actual job posting
  tags: jsonb("tags").notNull(), // Array of strings for matching
  matchScore: text("match_score"), // "great", "good", "potential"
  timeAgo: text("time_ago").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const savedJobs = pgTable("saved_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  jobId: varchar("job_id").references(() => jobOpportunities.id).notNull(),
  savedAt: timestamp("saved_at").defaultNow(),
});

export const savedNewsArticles = pgTable("saved_news_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  articleId: varchar("article_id").references(() => newsArticles.id).notNull(),
  savedAt: timestamp("saved_at").defaultNow(),
});

export const resumes = pgTable("resumes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  skills: jsonb("skills").$type<SkillsArray | null>(),
  education: jsonb("education").$type<EducationArray | null>(),
  workExperience: jsonb("work_experience").$type<WorkExperienceArray | null>(),
  certifications: jsonb("certifications").$type<CertificationsArray | null>(),
  achievements: jsonb("achievements").$type<AchievementsArray | null>(),
  uploadedFileUrl: text("uploaded_file_url"), // URL to uploaded resume file
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const newsArticles = pgTable("news_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  excerpt: text("excerpt").notNull(), // Brief summary for list view
  category: text("category").notNull(), // e.g., "market-trends", "career-tips", "industry-news"
  author: text("author").notNull(),
  imageUrl: text("image_url"), // Optional header image
  isPublished: boolean("is_published").default(true),
  publishedAt: timestamp("published_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  questionnaireResponses: many(questionnaireResponses),
  userPreferences: one(userPreferences),
  savedJobs: many(savedJobs),
  savedNewsArticles: many(savedNewsArticles),
  resumes: many(resumes),
}));

export const questionnaireResponsesRelations = relations(questionnaireResponses, ({ one }) => ({
  user: one(users, {
    fields: [questionnaireResponses.userId],
    references: [users.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const jobOpportunitiesRelations = relations(jobOpportunities, ({ many }) => ({
  savedByUsers: many(savedJobs),
}));

export const savedJobsRelations = relations(savedJobs, ({ one }) => ({
  user: one(users, {
    fields: [savedJobs.userId],
    references: [users.id],
  }),
  job: one(jobOpportunities, {
    fields: [savedJobs.jobId],
    references: [jobOpportunities.id],
  }),
}));

export const resumesRelations = relations(resumes, ({ one }) => ({
  user: one(users, {
    fields: [resumes.userId],
    references: [users.id],
  }),
}));

export const newsArticlesRelations = relations(newsArticles, ({ many }) => ({
  savedByUsers: many(savedNewsArticles),
}));

export const savedNewsArticlesRelations = relations(savedNewsArticles, ({ one }) => ({
  user: one(users, {
    fields: [savedNewsArticles.userId],
    references: [users.id],
  }),
  article: one(newsArticles, {
    fields: [savedNewsArticles.articleId],
    references: [newsArticles.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Schema for user profile updates (allows partial updates)
export const updateUserSchema = insertUserSchema.partial().omit({
  age: true, // Age shouldn't be updated after initial creation
  updatedAt: true, // This is set automatically
});

export const insertQuestionnaireResponseSchema = createInsertSchema(questionnaireResponses).omit({
  id: true,
  completedAt: true,
}).extend({
  // SECURITY: Add proper validation for questionnaire responses JSONB field
  responses: questionnaireResponsesSchema,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  updatedAt: true,
}).extend({
  // SECURITY: Add proper validation for JSONB fields
  schedulePreference: schedulePreferenceSchema.optional(),
  preferredJobTypes: preferredJobTypesSchema.optional(),
  preferredLocations: preferredLocationsSchema.optional(),
});

// Schema for updating user preferences (allows partial updates)
export const updateUserPreferencesSchema = insertUserPreferencesSchema.partial();

export const insertJobOpportunitySchema = createInsertSchema(jobOpportunities).omit({
  id: true,
  createdAt: true,
});

export const insertSavedJobSchema = createInsertSchema(savedJobs).omit({
  id: true,
  savedAt: true,
});

export const insertSavedNewsArticleSchema = createInsertSchema(savedNewsArticles).omit({
  id: true,
  savedAt: true,
});

export const insertResumeSchema = createInsertSchema(resumes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Override JSONB fields with proper typed schemas
  skills: skillsArraySchema.optional(),
  education: educationArraySchema.optional(),
  workExperience: workExperienceArraySchema.optional(),
  certifications: certificationsArraySchema.optional(),
  achievements: achievementsArraySchema.optional(),
});

// Schema for resume updates (allows partial updates)
export const updateResumeSchema = insertResumeSchema.partial();

export const insertNewsArticleSchema = createInsertSchema(newsArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpsertUser = typeof users.$inferInsert;

export type QuestionnaireResponse = typeof questionnaireResponses.$inferSelect;
export type InsertQuestionnaireResponse = z.infer<typeof insertQuestionnaireResponseSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UpdateUserPreferences = z.infer<typeof updateUserPreferencesSchema>;

// Export individual preference types for use in UI components
export type JobType = z.infer<typeof jobTypeSchema>;
export type LocationPreference = z.infer<typeof locationPreferenceSchema>;
export type SchedulePreference = z.infer<typeof schedulePreferenceSchema>;
export type PreferredJobTypes = z.infer<typeof preferredJobTypesSchema>;
export type PreferredLocations = z.infer<typeof preferredLocationsSchema>;
export type QuestionnaireResponses = z.infer<typeof questionnaireResponsesSchema>;
export type QuestionnaireResponseValue = z.infer<typeof questionnaireResponseValueSchema>;
export type JobOpportunity = typeof jobOpportunities.$inferSelect;
export type InsertJobOpportunity = z.infer<typeof insertJobOpportunitySchema>;
export type SavedJob = typeof savedJobs.$inferSelect;
export type InsertSavedJob = z.infer<typeof insertSavedJobSchema>;
export type Resume = typeof resumes.$inferSelect;
export type InsertResume = z.infer<typeof insertResumeSchema>;
export type UpdateResume = z.infer<typeof updateResumeSchema>;
export type NewsArticle = typeof newsArticles.$inferSelect;
export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;
export type SavedNewsArticle = typeof savedNewsArticles.$inferSelect;
export type InsertSavedNewsArticle = z.infer<typeof insertSavedNewsArticleSchema>;
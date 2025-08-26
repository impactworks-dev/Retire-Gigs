export interface QuestionnaireAnswers {
  question_1?: string[]; // Free time activities
  question_2?: string[]; // Job motivation
  question_3?: string[]; // Job exclusions
  question_4?: string[]; // Work location preference
  question_5?: string[]; // Work frequency
  question_6?: string[]; // Past experience
  question_7?: string[]; // Additional preferences
}

export interface Question {
  id: number;
  title: string;
  description: string;
  options: QuestionOption[];
}

export interface QuestionOption {
  value: string;
  label: string;
  icon: React.ReactNode;
}

export type SchedulePreference = "daily" | "weekly" | "biweekly";

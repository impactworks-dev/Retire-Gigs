import { useEffect } from "react";
import { Layout } from "@/components/layout";
import { QuestionnaireFlow } from "@/components/questionnaire-flow";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { QuestionnaireAnswers } from "@/types/questionnaire";

// Function to convert questionnaire answers to user preferences
function convertAnswersToPreferences(answers: QuestionnaireAnswers) {
  const preferredJobTypes: string[] = [];
  const preferredLocations: string[] = [];
  let schedulePreference = "weekly";

  // Question 1: Free time activities -> Job types
  const freeTimeActivities = answers.question_1 || [];
  if (freeTimeActivities.includes("outdoor")) preferredJobTypes.push("outdoor");
  if (freeTimeActivities.includes("helping")) preferredJobTypes.push("helping");
  if (freeTimeActivities.includes("creative")) preferredJobTypes.push("creative");
  if (freeTimeActivities.includes("hands-on")) preferredJobTypes.push("hands-on");
  if (freeTimeActivities.includes("social")) preferredJobTypes.push("social");
  if (freeTimeActivities.includes("quiet")) preferredJobTypes.push("desk");
  if (freeTimeActivities.includes("tech")) preferredJobTypes.push("tech");
  if (freeTimeActivities.includes("professional")) preferredJobTypes.push("professional");

  // Question 4: Work location
  const locationPrefs = answers.question_4 || [];
  if (locationPrefs.includes("home")) preferredLocations.push("remote");
  if (locationPrefs.includes("close")) preferredLocations.push("local");
  if (locationPrefs.includes("either")) {
    preferredLocations.push("remote", "local");
  }

  // Question 5: Work frequency -> Schedule preference
  const frequency = answers.question_5 || [];
  if (frequency.includes("occasional")) schedulePreference = "occasional";
  else if (frequency.includes("few-hours")) schedulePreference = "weekly";
  else if (frequency.includes("part-time")) schedulePreference = "biweekly";
  else if (frequency.includes("open")) schedulePreference = "weekly";

  return {
    preferredJobTypes: preferredJobTypes.length > 0 ? preferredJobTypes : null,
    preferredLocations: preferredLocations.length > 0 ? preferredLocations : null,
    schedulePreference,
    notificationsEnabled: true
  };
}

export default function RetakeAssessment() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const saveResponsesMutation = useMutation({
    mutationFn: async (answers: QuestionnaireAnswers) => {
      if (!user?.id) {
        throw new Error("User ID not found");
      }
      
      // Save new questionnaire response
      await apiRequest("POST", "/api/questionnaire", {
        userId: user.id,
        responses: answers
      });

      // Convert answers to preferences and update
      const preferences = convertAnswersToPreferences(answers);
      await apiRequest("PATCH", `/api/preferences/${user.id}`, preferences);

      return { success: true };
    },
    onSuccess: () => {
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/preferences", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      
      toast({
        title: "Assessment Complete",
        description: "Your preferences have been updated based on your new answers!",
      });
      setLocation("/dashboard");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to save your assessment. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleQuestionnaireComplete = (answers: QuestionnaireAnswers) => {
    saveResponsesMutation.mutate(answers);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading assessment...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 
            className="text-3xl font-bold text-gray-900 mb-4"
            data-testid="text-retake-title"
          >
            Retake Your Assessment
          </h1>
          <p 
            className="text-lg text-gray-600"
            data-testid="text-retake-description"
          >
            Your preferences may have changed. Let's update your job matches with fresh answers.
          </p>
        </div>

        <QuestionnaireFlow onComplete={handleQuestionnaireComplete} />
      </div>
    </Layout>
  );
}
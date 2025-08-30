import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { QuestionnaireFlow } from "@/components/questionnaire-flow";
import { ContactInfoForm } from "@/components/contact-info-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { QuestionnaireAnswers } from "@/types/questionnaire";

export default function Questionnaire() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [showContactForm, setShowContactForm] = useState(false);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<QuestionnaireAnswers>({});

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
    mutationFn: async (data: { answers: QuestionnaireAnswers; contactInfo?: { firstName: string; lastName: string; email: string; address: string } }) => {
      if (!user?.id) {
        throw new Error("User ID not found");
      }
      
      // Save questionnaire responses
      await apiRequest("POST", "/api/questionnaire", {
        userId: user.id,
        responses: data.answers
      });

      // Save contact info if provided
      if (data.contactInfo) {
        await apiRequest("PATCH", `/api/users/${user.id}`, data.contactInfo);
      }

      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your responses have been saved!",
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
        description: "Failed to save responses. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleQuestionnaireComplete = (answers: QuestionnaireAnswers) => {
    setQuestionnaireAnswers(answers);
    setShowContactForm(true);
  };

  const handleContactInfoComplete = (contactInfo: { firstName: string; lastName: string; email: string; address: string }) => {
    saveResponsesMutation.mutate({ answers: questionnaireAnswers, contactInfo });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading questionnaire...</p>
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
      {showContactForm ? (
        <ContactInfoForm onComplete={handleContactInfoComplete} />
      ) : (
        <QuestionnaireFlow onComplete={handleQuestionnaireComplete} />
      )}
    </Layout>
  );
}

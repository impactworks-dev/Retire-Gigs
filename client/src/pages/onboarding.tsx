import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Check if user has completed questionnaire
  const { data: questionnaireStatus, isLoading: statusLoading } = useQuery<{ completed: boolean }>({
    queryKey: ["/api/questionnaire/status", user?.id],
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
      return;
    }

    if (!statusLoading && questionnaireStatus && user) {
      if (questionnaireStatus.completed) {
        // User has completed questionnaire, go to dashboard
        setLocation("/dashboard");
      } else {
        // User is new, go to questionnaire
        setLocation("/questionnaire");
      }
    }
  }, [isLoading, isAuthenticated, statusLoading, questionnaireStatus, user, setLocation]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Setting up your account...</p>
        </div>
      </div>
    </Layout>
  );
}
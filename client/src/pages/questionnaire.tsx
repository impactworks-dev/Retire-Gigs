import { Layout } from "@/components/layout";
import { QuestionnaireFlow } from "@/components/questionnaire-flow";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { QuestionnaireAnswers } from "@/types/questionnaire";

export default function Questionnaire() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const saveResponsesMutation = useMutation({
    mutationFn: async (answers: QuestionnaireAnswers) => {
      const userId = localStorage.getItem("userId");
      if (!userId) {
        throw new Error("User ID not found");
      }
      
      const response = await apiRequest("POST", "/api/questionnaire", {
        userId,
        responses: answers
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your responses have been saved!",
      });
      setLocation("/dashboard");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save responses. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleQuestionnaireComplete = (answers: QuestionnaireAnswers) => {
    saveResponsesMutation.mutate(answers);
  };

  return (
    <Layout>
      <QuestionnaireFlow onComplete={handleQuestionnaireComplete} />
    </Layout>
  );
}

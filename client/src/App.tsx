import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InstallPrompt } from "@/components/install-prompt";
import { useAuth } from "@/hooks/useAuth";
import Welcome from "@/pages/welcome";
import Login from "@/pages/login";
import Onboarding from "@/pages/onboarding";
import Questionnaire from "@/pages/questionnaire";
import RetakeAssessment from "@/pages/retake-assessment";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import { SavedJobs } from "@/pages/saved-jobs";
import ResumeBuilder from "@/pages/resume-builder";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Welcome} />
          <Route path="/login" component={Login} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/onboarding" component={Onboarding} />
          <Route path="/questionnaire" component={Questionnaire} />
          <Route path="/retake-assessment" component={RetakeAssessment} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/profile" component={Profile} />
          <Route path="/saved-jobs" component={SavedJobs} />
          <Route path="/resume-builder" component={ResumeBuilder} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <InstallPrompt />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

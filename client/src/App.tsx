import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InstallPrompt } from "@/components/install-prompt";
import { useAuth } from "@/hooks/useAuth";
import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import Welcome from "@/pages/welcome";
import Login from "@/pages/login";
import Onboarding from "@/pages/onboarding";
import Questionnaire from "@/pages/questionnaire";
import RetakeAssessment from "@/pages/retake-assessment";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import { SavedJobs } from "@/pages/saved-jobs";
import SavedNews from "@/pages/saved-news";
import ResumeBuilder from "@/pages/resume-builder";
import News from "@/pages/news";
import NewsArticle from "@/pages/news-article";
import Notifications from "@/pages/notifications";
import NotFound from "@/pages/not-found";

// Error Boundary Component for catching and handling React component errors
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging and monitoring
    console.error('React Error Boundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });

    // Update state with error details
    this.setState({
      hasError: true,
      error,
      errorInfo
    });

    // Send error to monitoring service in production
    if (import.meta.env.PROD) {
      // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
    }
  }

  handleRetry = () => {
    // Reset error state to retry rendering
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    // Full page reload as last resort
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="error-boundary-fallback">
          <div className="max-w-md w-full bg-card border rounded-lg p-6 shadow-lg">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
                <p className="text-muted-foreground text-sm">The application encountered an unexpected error</p>
              </div>
            </div>
            
            {import.meta.env.DEV && this.state.error && (
              <div className="mb-4 p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-32">
                <strong>Error:</strong> {this.state.error.message}
                {this.state.error.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-muted-foreground">Stack trace</summary>
                    <pre className="mt-1 whitespace-pre-wrap text-xs">{this.state.error.stack}</pre>
                  </details>
                )}
              </div>
            )}
            
            <div className="flex space-x-3">
              <Button 
                onClick={this.handleRetry} 
                variant="default" 
                size="sm"
                data-testid="button-retry-app"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button 
                onClick={this.handleReload} 
                variant="outline" 
                size="sm"
                data-testid="button-reload-app"
              >
                Reload Page
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-4">
              If this problem persists, please refresh the page or contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
          <Route path="/saved-news" component={SavedNews} />
          <Route path="/resumes" component={ResumeBuilder} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/news" component={News} />
          <Route path="/news/:id" component={NewsArticle} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
          <InstallPrompt />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
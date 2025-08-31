import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Bookmark, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import type { JobOpportunity } from "@shared/schema";

interface SavedJobResponse {
  id: string;
  userId: string;
  jobId: string;
  savedAt: Date;
  job: JobOpportunity;
}

export function SavedJobs() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: savedJobs = [], isLoading, error } = useQuery<SavedJobResponse[]>({
    queryKey: ["/api/saved-jobs"],
    enabled: !!isAuthenticated && !!user?.id,
  });

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Please log in to view saved jobs</h1>
            <Button asChild>
              <Link href="/api/login">Log In</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="mr-4"
            data-testid="button-back-to-dashboard"
          >
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <div className="flex items-center">
            <Bookmark className="w-6 h-6 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-saved-jobs">
              Saved Jobs
            </h1>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your saved jobs...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">Failed to load saved jobs</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && savedJobs.length === 0 && (
          <div className="text-center py-12">
            <Bookmark className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2" data-testid="text-no-saved-jobs">
              No saved jobs yet
            </h2>
            <p className="text-gray-600 mb-6">
              Start browsing jobs and save the ones you're interested in!
            </p>
            <Button asChild data-testid="button-browse-jobs">
              <Link href="/">Browse Jobs</Link>
            </Button>
          </div>
        )}

        {/* Saved Jobs List */}
        {!isLoading && !error && savedJobs.length > 0 && (
          <>
            <p className="text-gray-600 mb-6" data-testid="text-saved-jobs-count">
              You have {savedJobs.length} saved job{savedJobs.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {savedJobs.map((savedJob) => (
                <JobCard
                  key={savedJob.job.id}
                  job={savedJob.job}
                  onViewDetails={(jobId) => {
                    toast({
                      title: "Job Details",
                      description: "Job details view would be implemented here.",
                    });
                  }}
                />
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    </Layout>
  );
}
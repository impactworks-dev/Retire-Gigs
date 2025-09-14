import { useState, useEffect } from "react";
import { Clock, MapPin, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { JobOpportunity } from "@shared/schema";

interface JobCardProps {
  job: JobOpportunity;
  onViewDetails: (jobId: string) => void;
}

interface SavedJobCheckResponse {
  isSaved: boolean;
}

export function JobCard({ job, onViewDetails }: JobCardProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if job is saved
  const { data: savedData } = useQuery<SavedJobCheckResponse>({
    queryKey: ["/api/saved-jobs/check", job.id],
    enabled: !!isAuthenticated && !!user?.id,
  });
  
  const isSaved = savedData?.isSaved || false;

  // Save job mutation
  const saveJobMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/saved-jobs", { jobId: job.id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-jobs/check", job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-jobs"] });
      toast({
        title: "Job saved!",
        description: "You can find this job in your saved jobs list.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to save job",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  // Unsave job mutation
  const unsaveJobMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/saved-jobs/${job.id}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-jobs/check", job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-jobs"] });
      toast({
        title: "Job removed",
        description: "Job removed from your saved list.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove job",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSaveToggle = () => {
    if (!isAuthenticated) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to save jobs.",
        variant: "destructive",
      });
      return;
    }

    if (isSaved) {
      unsaveJobMutation.mutate();
    } else {
      saveJobMutation.mutate();
    }
  };

  const getMatchScoreColor = (score: string) => {
    switch (score) {
      case "great":
        return "bg-green-100 text-green-800";
      case "good":
        return "bg-blue-100 text-blue-800";
      case "potential":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getMatchScoreLabel = (score: string) => {
    switch (score) {
      case "great":
        return "Great Match";
      case "good":
        return "Good Match";
      case "potential":
        return "Potential Match";
      default:
        return "Match";
    }
  };

  return (
    <div 
      className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-200"
      data-testid={`card-job-${job.id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h4 
            className="text-xl font-semibold text-gray-900 mb-2"
            data-testid={`text-job-title-${job.id}`}
          >
            {job.title}
          </h4>
          <p 
            className="text-lg text-gray-600 mb-2"
            data-testid={`text-company-${job.id}`}
          >
            {job.company}
          </p>
          <div className="flex items-center text-sm text-gray-500">
            <MapPin className="w-4 h-4 mr-1" />
            <span data-testid={`text-location-${job.id}`}>{job.location}</span>
          </div>
        </div>
        <div className="text-right">
          <div 
            className="text-lg font-semibold text-secondary"
            data-testid={`text-pay-${job.id}`}
          >
            {job.pay}
          </div>
          <div 
            className="text-sm text-gray-500"
            data-testid={`text-schedule-${job.id}`}
          >
            {job.schedule}
          </div>
        </div>
      </div>

      <p 
        className="text-gray-600 mb-4"
        data-testid={`text-description-${job.id}`}
      >
        {job.description}
      </p>

      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center text-sm text-gray-500">
          <Clock className="w-4 h-4 mr-1" />
          <span data-testid={`text-time-ago-${job.id}`}>{job.timeAgo}</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <Button
              variant="outline"
              size="default"
              onClick={handleSaveToggle}
              disabled={saveJobMutation.isPending || unsaveJobMutation.isPending}
              className={`${isSaved ? 'text-blue-600 border-blue-600' : 'text-gray-600'} hover:bg-blue-50 min-w-12`}
              data-testid={`button-save-job-${job.id}`}
            >
              {isSaved ? (
                <BookmarkCheck className="w-5 h-5" />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </Button>
          )}
          <Button 
            onClick={() => onViewDetails(job.id)}
            size="default"
            className="bg-primary hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
            data-testid={`button-view-details-${job.id}`}
          >
            View Details
          </Button>
        </div>
      </div>

      <div className="mt-6 flex items-center flex-wrap gap-3">
        <div 
          className={`text-sm font-medium px-3 py-2 rounded-full ${getMatchScoreColor(job.matchScore || "potential")}`}
          data-testid={`badge-match-score-${job.id}`}
        >
          {getMatchScoreLabel(job.matchScore || "potential")}
        </div>
        {Array.isArray(job.tags) && job.tags.map((tag, index) => (
          <div 
            key={index}
            className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-2 rounded-full"
            data-testid={`badge-tag-${tag}-${job.id}`}
          >
            {tag}
          </div>
        ))}
      </div>
    </div>
  );
}

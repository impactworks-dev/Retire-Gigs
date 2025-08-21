import { Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobOpportunity } from "@shared/schema";

interface JobCardProps {
  job: JobOpportunity;
  onViewDetails: (jobId: string) => void;
}

export function JobCard({ job, onViewDetails }: JobCardProps) {
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

      <div className="flex items-center justify-between">
        <div className="flex items-center text-sm text-gray-500">
          <Clock className="w-4 h-4 mr-1" />
          <span data-testid={`text-time-ago-${job.id}`}>{job.timeAgo}</span>
        </div>
        <Button 
          onClick={() => onViewDetails(job.id)}
          className="bg-primary hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200"
          data-testid={`button-view-details-${job.id}`}
        >
          View Details
        </Button>
      </div>

      <div className="mt-4 flex items-center flex-wrap gap-2">
        <div 
          className={`text-xs font-medium px-2 py-1 rounded-full ${getMatchScoreColor(job.matchScore || "potential")}`}
          data-testid={`badge-match-score-${job.id}`}
        >
          {getMatchScoreLabel(job.matchScore || "potential")}
        </div>
        {Array.isArray(job.tags) && job.tags.map((tag, index) => (
          <div 
            key={index}
            className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full"
            data-testid={`badge-tag-${tag}-${job.id}`}
          >
            {tag}
          </div>
        ))}
      </div>
    </div>
  );
}

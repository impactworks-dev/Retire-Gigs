import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, X, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InsertJobOpportunity } from "@shared/schema";

interface JobSearchDialogProps {
  onSearchComplete: (jobs: InsertJobOpportunity[]) => void;
}

const JOB_TYPE_OPTIONS = [
  { value: "outdoor", label: "Outdoor Work" },
  { value: "creative", label: "Creative" },
  { value: "helping", label: "Helping Others" },
  { value: "social", label: "Social" },
  { value: "quiet", label: "Quiet Environment" },
  { value: "tech", label: "Technology" },
  { value: "professional", label: "Professional" }
];

const SCHEDULE_OPTIONS = [
  { value: "full-time", label: "Full-Time" },
  { value: "part-time", label: "Part-Time" },
  { value: "flexible", label: "Flexible" },
  { value: "contract", label: "Contract" }
];

export function JobSearchDialog({ onSearchComplete }: JobSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [keywords, setKeywords] = useState("");
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<string>("");
  const { toast } = useToast();

  const searchMutation = useMutation({
    mutationFn: async () => {
      const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      
      const response = await apiRequest("POST", "/api/jobs/search", {
        location: location || undefined,
        jobTypes: selectedJobTypes.length > 0 ? selectedJobTypes : undefined,
        schedule: selectedSchedule || undefined,
        keywords: keywordList.length > 0 ? keywordList : undefined
      });
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Search Complete!",
        description: `Found ${data.jobs.length} job opportunities matching your criteria.`
      });
      onSearchComplete(data.jobs);
      setOpen(false);
      
      // Reset form
      setLocation("");
      setKeywords("");
      setSelectedJobTypes([]);
      setSelectedSchedule("");
    },
    onError: (error: any) => {
      toast({
        title: "Search Failed",
        description: error.message || "Unable to search for jobs. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleJobTypeToggle = (jobType: string) => {
    setSelectedJobTypes(prev => 
      prev.includes(jobType) 
        ? prev.filter(t => t !== jobType)
        : [...prev, jobType]
    );
  };

  const handleSearch = () => {
    if (!location && selectedJobTypes.length === 0 && !selectedSchedule && !keywords) {
      toast({
        title: "Please provide search criteria",
        description: "Enter at least one search parameter to find jobs.",
        variant: "destructive"
      });
      return;
    }

    searchMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="lg"
          className="bg-green-600 hover:bg-green-700 text-white text-senior-button min-h-12 px-6"
          data-testid="button-search-jobs"
        >
          <Search className="w-5 h-5 mr-2" />
          Search for Jobs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Search for Job Opportunities</DialogTitle>
          <DialogDescription className="text-senior">
            Tell us what you're looking for and we'll search for the latest job opportunities in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location" className="text-senior-large">
              Location
            </Label>
            <Input
              id="location"
              placeholder="e.g., New York, NY or Remote"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="text-senior min-h-12"
              data-testid="input-search-location"
            />
          </div>


          <div className="space-y-2">
            <Label htmlFor="keywords" className="text-senior-large">
              Keywords (comma-separated)
            </Label>
            <Input
              id="keywords"
              placeholder="e.g., customer service, administrative, healthcare"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="text-senior min-h-12"
              data-testid="input-search-keywords"
            />
            <p className="text-sm text-gray-500">
              Enter job titles, skills, or industries you're interested in
            </p>
          </div>

          {/* Job Types */}
          <div className="space-y-2">
            <Label className="text-senior-large">Job Types</Label>
            <div className="flex flex-wrap gap-2">
              {JOB_TYPE_OPTIONS.map(option => (
                <Badge
                  key={option.value}
                  variant={selectedJobTypes.includes(option.value) ? "default" : "outline"}
                  className="cursor-pointer text-senior py-2 px-3"
                  onClick={() => handleJobTypeToggle(option.value)}
                  data-testid={`badge-job-type-${option.value}`}
                >
                  {option.label}
                  {selectedJobTypes.includes(option.value) && (
                    <X className="w-3 h-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label className="text-senior-large">Schedule Preference</Label>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_OPTIONS.map(option => (
                <Badge
                  key={option.value}
                  variant={selectedSchedule === option.value ? "default" : "outline"}
                  className="cursor-pointer text-senior py-2 px-3"
                  onClick={() => setSelectedSchedule(
                    selectedSchedule === option.value ? "" : option.value
                  )}
                  data-testid={`badge-schedule-${option.value}`}
                >
                  {option.label}
                  {selectedSchedule === option.value && (
                    <X className="w-3 h-3 ml-1" />
                  )}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={searchMutation.isPending}
            data-testid="button-cancel-search"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSearch}
            disabled={searchMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-execute-search"
          >
            {searchMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

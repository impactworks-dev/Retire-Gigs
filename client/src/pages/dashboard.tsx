import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Lightbulb, Calendar, Mail, Settings, User } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Link } from "wouter";
import type { JobOpportunity, UserPreferences } from "@shared/schema";
import type { SchedulePreference } from "@/types/questionnaire";

export default function Dashboard() {
  const [selectedSchedule, setSelectedSchedule] = useState<SchedulePreference>("weekly");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
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
  }, [isAuthenticated, authLoading, toast]);

  // Fetch job opportunities
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobOpportunity[]>({
    queryKey: ["/api/jobs"],
    enabled: !!authUser?.id,
  });

  // Fetch user preferences
  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ["/api/preferences", authUser?.id],
    enabled: !!authUser?.id,
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { schedulePreference?: SchedulePreference; notificationsEnabled?: boolean }) => {
      if (!authUser?.id) throw new Error("User ID not found");
      
      if (preferences) {
        const response = await apiRequest("PATCH", `/api/preferences/${authUser.id}`, data);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/preferences", {
          userId: authUser.id,
          ...data
        });
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences", authUser?.id] });
      toast({
        title: "Preferences updated",
        description: "Your notification preferences have been saved.",
      });
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
        description: "Failed to update preferences. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Initialize preferences from API
  useEffect(() => {
    if (preferences) {
      setSelectedSchedule(preferences.schedulePreference as SchedulePreference);
      setNotificationsEnabled(preferences.notificationsEnabled ?? true);
    }
  }, [preferences]);

  const handleScheduleChange = (schedule: SchedulePreference) => {
    setSelectedSchedule(schedule);
    updatePreferencesMutation.mutate({ schedulePreference: schedule });
  };

  const handleNotificationsToggle = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    updatePreferencesMutation.mutate({ notificationsEnabled: enabled });
  };

  const handleViewJobDetails = (jobId: string) => {
    toast({
      title: "Job Details",
      description: "Job details view would be implemented here.",
    });
  };

  if (authLoading || jobsLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your job matches...</p>
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
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 
              className="text-3xl font-bold text-gray-900"
              data-testid="text-dashboard-title"
            >
              Your Job Matches
            </h2>
            <Link href="/profile">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center"
                data-testid="button-profile"
              >
                <User className="w-4 h-4 mr-2" />
                Profile
              </Button>
            </Link>
          </div>
          <p 
            className="text-xl text-gray-600"
            data-testid="text-dashboard-description"
          >
            Based on your preferences, we've found these opportunities for you.
          </p>
        </div>

        {/* Job Alert Settings */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 
              className="text-xl font-semibold text-gray-900"
              data-testid="text-alert-settings-title"
            >
              Job Alert Schedule
            </h3>
            <div className="flex items-center">
              <span className="text-sm text-gray-600 mr-3">Notifications</span>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsToggle}
                data-testid="switch-notifications"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {(["daily", "weekly", "biweekly"] as SchedulePreference[]).map((schedule) => (
              <Button
                key={schedule}
                onClick={() => handleScheduleChange(schedule)}
                variant={selectedSchedule === schedule ? "default" : "outline"}
                size="lg"
                className={`text-center ${
                  selectedSchedule === schedule
                    ? "bg-primary text-white border-primary"
                    : "bg-gray-50 hover:bg-primary hover:text-white text-gray-900"
                }`}
                data-testid={`button-schedule-${schedule}`}
              >
                <div className="flex flex-col items-center">
                  <Calendar className="w-6 h-6 mb-2" />
                  {schedule === "daily" && "Daily"}
                  {schedule === "weekly" && "Weekly"}
                  {schedule === "biweekly" && "Bi-weekly"}
                </div>
              </Button>
            ))}
          </div>

          <p 
            className="text-sm text-gray-600"
            data-testid="text-alert-description"
          >
            We'll send you job opportunities via email based on your preferences. You can change this anytime.
          </p>
        </div>

        {/* Job Listings */}
        {jobs.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onViewDetails={handleViewJobDetails}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 text-center">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Jobs Found</h3>
            <p className="text-gray-600">
              We're still searching for opportunities that match your preferences. Check back soon!
            </p>
          </div>
        )}

        {/* AI Integration Status */}
        <div className="bg-blue-50 rounded-2xl p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mr-3">
              <Lightbulb className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 
                className="text-lg font-semibold text-gray-900"
                data-testid="text-ai-integration-title"
              >
                AI-Powered Job Matching
              </h3>
              <p className="text-sm text-gray-600">Powered by Lindy AI for intelligent job sourcing</p>
            </div>
          </div>
          <p 
            className="text-gray-700"
            data-testid="text-ai-integration-description"
          >
            Our AI agent continuously scans job boards, company websites, and local opportunities to find positions that match your specific preferences and experience. New matches are automatically added to your feed.
          </p>
        </div>
      </div>
    </Layout>
  );
}

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Settings, Calendar, Mail, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { UserPreferences, User as UserType } from "@shared/schema";
import type { SchedulePreference } from "@/types/questionnaire";
import { useEffect as useRedirectEffect } from "react";

export default function Profile() {
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();
  const [selectedSchedule, setSelectedSchedule] = useState<SchedulePreference>("weekly");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Redirect to login if not authenticated
  useRedirectEffect(() => {
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
        description: "Your settings have been saved.",
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

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your profile...</p>
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
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 
            className="text-3xl font-bold text-gray-900"
            data-testid="text-profile-title"
          >
            Your Profile
          </h2>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="text-gray-600 hover:text-gray-900"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        {/* Profile Information */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="w-5 h-5 mr-2" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4">
              <Avatar className="w-16 h-16">
                <AvatarImage 
                  src={authUser?.profileImageUrl || undefined} 
                  alt={`${authUser?.firstName || 'User'}'s profile`} 
                />
                <AvatarFallback className="text-lg">
                  {authUser?.firstName?.[0] || authUser?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 
                  className="text-xl font-semibold text-gray-900"
                  data-testid="text-user-name"
                >
                  {authUser?.firstName && authUser?.lastName 
                    ? `${authUser.firstName} ${authUser.lastName}`
                    : authUser?.email || 'User'
                  }
                </h3>
                <p 
                  className="text-gray-600"
                  data-testid="text-user-email"
                >
                  {authUser?.email}
                </p>
                <Badge variant="secondary" className="mt-1">
                  Age 55+
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Job Alert Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">Email Notifications</h4>
                <p className="text-sm text-gray-600">Receive job opportunities via email</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsToggle}
                data-testid="switch-notifications"
              />
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-4">Notification Schedule</h4>
              <div className="grid grid-cols-1 gap-3">
                {(["daily", "weekly", "biweekly"] as SchedulePreference[]).map((schedule) => (
                  <Button
                    key={schedule}
                    onClick={() => handleScheduleChange(schedule)}
                    variant={selectedSchedule === schedule ? "default" : "outline"}
                    size="lg"
                    className={`justify-start ${
                      selectedSchedule === schedule
                        ? "bg-primary text-white border-primary"
                        : "bg-gray-50 hover:bg-primary hover:text-white text-gray-900"
                    }`}
                    data-testid={`button-schedule-${schedule}`}
                  >
                    <Calendar className="w-5 h-5 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">
                        {schedule === "daily" && "Daily Updates"}
                        {schedule === "weekly" && "Weekly Updates"} 
                        {schedule === "biweekly" && "Bi-weekly Updates"}
                      </div>
                      <div className="text-sm opacity-75">
                        {schedule === "daily" && "Get new jobs every day"}
                        {schedule === "weekly" && "Get new jobs once a week"}
                        {schedule === "biweekly" && "Get new jobs every two weeks"}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-start">
                <Mail className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                <div>
                  <h5 className="font-medium text-blue-900 mb-1">Email Delivery</h5>
                  <p className="text-sm text-blue-700">
                    Job opportunities will be sent to <strong>{authUser?.email}</strong> based on your selected schedule.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
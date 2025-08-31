
import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Clock, 
  Settings, 
  CheckCircle,
  AlertCircle,
  Calendar,
  Smartphone
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { UserPreferences } from "@shared/schema";

type NotificationMethod = 'email' | 'sms' | 'both';
type NotificationFrequency = 'immediate' | 'daily' | 'weekly' | 'biweekly';

export default function Notifications() {
  const { toast } = useToast();
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [frequency, setFrequency] = useState<NotificationFrequency>('daily');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");

  // Fetch user preferences
  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ["/api/preferences", authUser?.id],
    enabled: !!authUser?.id,
  });

  // Fetch user data for phone number
  const { data: userData } = useQuery<{ phoneNumber?: string }>({
    queryKey: ["/api/users", authUser?.id],
    enabled: !!authUser?.id,
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      const response = await fetch(`/api/preferences/${authUser?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update preferences");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences", authUser?.id] });
      toast({
        title: "Settings Updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update notification preferences.",
        variant: "destructive",
      });
    },
  });

  // Update user profile mutation for phone number
  const updateUserMutation = useMutation({
    mutationFn: async (updates: { phoneNumber?: string }) => {
      const response = await fetch(`/api/users/${authUser?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update user profile");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", authUser?.id] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update phone number.",
        variant: "destructive",
      });
    },
  });

  // Test email mutation
  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to send test email");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Email Sent",
        description: "Check dante@impactworks.com for the test email.",
      });
    },
    onError: (error) => {
      toast({
        title: "Email Test Failed",
        description: "There was an issue sending the test email. Check the console for details.",
        variant: "destructive",
      });
    },
  });

  // Load preferences and user data when available
  useEffect(() => {
    if (preferences) {
      setEmailEnabled(preferences.notificationsEnabled || true);
      setSmsEnabled(preferences.smsNotificationsEnabled || false);
      setFrequency((preferences.schedulePreference as NotificationFrequency) || 'daily');
    }
  }, [preferences]);

  useEffect(() => {
    if (userData?.phoneNumber) {
      setPhoneNumber(userData.phoneNumber);
    }
  }, [userData]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to access notifications settings.",
        variant: "destructive",
      });
    }
  }, [isAuthenticated, authLoading, toast]);

  const handleSaveSettings = async () => {
    // Update preferences
    updatePreferencesMutation.mutate({
      notificationsEnabled: emailEnabled,
      smsNotificationsEnabled: smsEnabled,
      schedulePreference: frequency,
    });

    // Update phone number if it has changed
    if (phoneNumber !== (userData?.phoneNumber || "")) {
      updateUserMutation.mutate({
        phoneNumber: phoneNumber.trim() || undefined,
      });
    }
  };

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading notification settings...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Bell className="w-8 h-8 text-primary mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Notification Settings</h1>
          </div>
          <p className="text-gray-600">
            Manage how and when you receive job alerts and updates.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Settings */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Email Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Mail className="w-5 h-5 mr-2" />
                  Email Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Job Match Alerts</h4>
                    <p className="text-sm text-gray-600">Get notified when new jobs match your preferences</p>
                  </div>
                  <Switch
                    checked={emailEnabled}
                    onCheckedChange={setEmailEnabled}
                    data-testid="switch-email-notifications"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Weekly Digest</h4>
                    <p className="text-sm text-gray-600">Summary of new opportunities and market insights</p>
                  </div>
                  <Switch
                    checked={true}
                    data-testid="switch-weekly-digest"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Application Updates</h4>
                    <p className="text-sm text-gray-600">Status updates on your job applications</p>
                  </div>
                  <Switch
                    checked={true}
                    data-testid="switch-application-updates"
                  />
                </div>
              </CardContent>
            </Card>

            {/* SMS Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Smartphone className="w-5 h-5 mr-2" />
                  SMS Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Urgent Job Alerts</h4>
                    <p className="text-sm text-gray-600">Text alerts for high-priority job matches</p>
                  </div>
                  <Switch
                    checked={smsEnabled}
                    onCheckedChange={setSmsEnabled}
                    data-testid="switch-sms-notifications"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    data-testid="input-phone-number"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Frequency Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  Notification Frequency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    How often would you like to receive job alerts?
                  </label>
                  <Select value={frequency} onValueChange={(value: NotificationFrequency) => setFrequency(value)}>
                    <SelectTrigger data-testid="select-frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Immediately</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">Quiet Hours</h4>
                    <p className="text-sm text-gray-600">No notifications between 8 PM and 8 AM</p>
                  </div>
                  <Switch
                    checked={quietHoursEnabled}
                    onCheckedChange={setQuietHoursEnabled}
                    data-testid="switch-quiet-hours"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSaveSettings}
                size="lg"
                disabled={updatePreferencesMutation.isPending || updateUserMutation.isPending}
                data-testid="button-save-settings"
              >
                {(updatePreferencesMutation.isPending || updateUserMutation.isPending) ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Current Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Current Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Email Alerts</span>
                  <Badge variant={emailEnabled ? "default" : "secondary"}>
                    {emailEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">SMS Alerts</span>
                  <Badge variant={smsEnabled ? "default" : "secondary"}>
                    {smsEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Frequency</span>
                  <Badge variant="outline" className="capitalize">
                    {frequency}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Sent</span>
                  <span className="text-sm text-gray-900">2 hours ago</span>
                </div>
              </CardContent>
            </Card>

            {/* Test Notifications */}
            <Card>
              <CardHeader>
                <CardTitle>Test Notifications</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Send a test notification to verify your settings are working correctly.
                </p>
                <Button
                  onClick={() => testEmailMutation.mutate()}
                  variant="outline"
                  size="sm"
                  disabled={testEmailMutation.isPending}
                  className="w-full"
                  data-testid="button-test-email"
                >
                  {testEmailMutation.isPending ? "Sending..." : "Send Test Email to Dante"}
                </Button>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-1" />
                  <div className="text-sm">
                    <p className="text-gray-900">5 job matches sent</p>
                    <p className="text-gray-600">2 hours ago</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Mail className="w-4 h-4 text-blue-600 mt-1" />
                  <div className="text-sm">
                    <p className="text-gray-900">Weekly digest delivered</p>
                    <p className="text-gray-600">2 days ago</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-4 h-4 text-orange-600 mt-1" />
                  <div className="text-sm">
                    <p className="text-gray-900">Settings updated</p>
                    <p className="text-gray-600">1 week ago</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

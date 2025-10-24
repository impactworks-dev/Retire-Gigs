import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { User, Settings, Calendar, Mail, LogOut, Edit3, MapPin, Briefcase, Navigation, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { UserPreferences, User as UserType } from "@shared/schema";
import type { SchedulePreference } from "@/types/questionnaire";
import { getCurrentLocation, isLocationSupported } from "@/lib/location";

export default function Profile() {
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();
  const [selectedSchedule, setSelectedSchedule] = useState<SchedulePreference>("weekly");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [preferredJobTypes, setPreferredJobTypes] = useState<string[]>([]);
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ["/api/preferences", authUser?.id],
    enabled: !!authUser?.id,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string; email?: string; streetAddress?: string; city?: string; state?: string; zipCode?: string }) => {
      if (!authUser?.id) throw new Error("User ID not found");
      
      const response = await apiRequest("PATCH", `/api/users/${authUser.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEditingProfile(false);
      toast({
        title: "Profile updated",
        description: "Your profile information has been saved.",
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
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: { 
      schedulePreference?: SchedulePreference; 
      notificationsEnabled?: boolean;
      preferredJobTypes?: string[];
      preferredLocations?: string[];
    }) => {
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

  // Initialize state from API data
  useEffect(() => {
    if (authUser) {
      setFirstName(authUser.firstName || "");
      setLastName(authUser.lastName || "");
      setEmail(authUser.email || "");
      setStreetAddress(authUser.streetAddress || "");
      setCity(authUser.city || "");
      setState(authUser.state || "");
      setZipCode(authUser.zipCode || "");
    }
  }, [authUser]);

  useEffect(() => {
    if (preferences) {
      setSelectedSchedule(preferences.schedulePreference as SchedulePreference);
      setNotificationsEnabled(preferences.notificationsEnabled ?? true);
      setPreferredJobTypes((preferences.preferredJobTypes as string[]) || []);
      setPreferredLocations((preferences.preferredLocations as string[]) || []);
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

  const handleProfileSave = () => {
    updateProfileMutation.mutate({ firstName, lastName, email, streetAddress, city, state, zipCode });
  };

  const handleJobTypeToggle = (jobType: string, checked: boolean) => {
    const newJobTypes = checked 
      ? [...preferredJobTypes, jobType]
      : preferredJobTypes.filter(type => type !== jobType);
    setPreferredJobTypes(newJobTypes);
    updatePreferencesMutation.mutate({ preferredJobTypes: newJobTypes });
  };

  const handleLocationToggle = (location: string, checked: boolean) => {
    const newLocations = checked 
      ? [...preferredLocations, location]
      : preferredLocations.filter(loc => loc !== location);
    setPreferredLocations(newLocations);
    updatePreferencesMutation.mutate({ preferredLocations: newLocations });
  };

  const handleGetCurrentLocation = async () => {
    if (!isLocationSupported()) {
      toast({
        title: "Location not supported",
        description: "Your browser doesn't support location services.",
        variant: "destructive"
      });
      return;
    }

    setIsGettingLocation(true);
    try {
      const location = await getCurrentLocation();
      
      // Reverse geocode the coordinates to get address
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}&countrycodes=us`,
        {
          headers: {
            'User-Agent': 'Retitree-Job-Market-Insights/1.0'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const address = data.address;
        
        if (address) {
          setStreetAddress(`${address.house_number || ''} ${address.road || ''}`.trim());
          setCity(address.city || address.town || address.village || '');
          setState(address.state || '');
          setZipCode(address.postcode || '');
          
          toast({
            title: "Location found!",
            description: "Your address has been automatically filled in.",
          });
        } else {
          throw new Error("No address found for your location");
        }
      } else {
        throw new Error("Failed to get address information");
      }
    } catch (error) {
      console.error("Location error:", error);
      toast({
        title: "Location error",
        description: error instanceof Error ? error.message : "Failed to get your location. Please enter your address manually.",
        variant: "destructive"
      });
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Clear React Query cache
      queryClient.clear();
      
      // Clear localStorage
      localStorage.clear();
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      // Clear all cookies
      const cookiesToRemove = [
        'connect.sid',
        'replit_authed',
        'ttcsid',
        'ttcsid_D004GE3C77U8PIVD',
        'sessionid',
        'auth_token',
        'csrf_token'
      ];
      
      cookiesToRemove.forEach(cookie => {
        // Clear for current path
        document.cookie = `${cookie}=; Max-Age=0; path=/;`;
        // Clear for root domain
        document.cookie = `${cookie}=; Max-Age=0; path=/; domain=${window.location.hostname};`;
        // Clear for parent domain (in case of subdomain)
        const parentDomain = window.location.hostname.split('.').slice(-2).join('.');
        if (parentDomain !== window.location.hostname) {
          document.cookie = `${cookie}=; Max-Age=0; path=/; domain=.${parentDomain};`;
        }
      });
      
      // Clear all cookies (fallback)
      document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
      });
      
      // Call server logout endpoint FIRST
      try {
        const response = await fetch('/api/logout', {
          method: 'GET',
          credentials: 'include'
        });
        
        if (!response.ok) {
          console.warn('Server logout failed:', response.status);
        }
      } catch (fetchError) {
        console.warn('Server logout call failed:', fetchError);
      }

      // Clear service worker cache
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        try {
          const messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = (event) => {
            console.log('Service worker cache cleared:', event.data);
          };
          navigator.serviceWorker.controller.postMessage(
            { type: 'CLEAR_CACHE' },
            [messageChannel.port2]
          );
        } catch (swError) {
          console.warn('Failed to clear service worker cache:', swError);
        }
      }
      
      // Force hard redirect with cache busting using replace
      const timestamp = Date.now();
      window.location.replace(`/?logout=true&_=${timestamp}`);
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect even if cleanup fails
      window.location.replace("/?logout=true");
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-senior text-senior-secondary">Loading your profile...</p>
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
            className="mobile-heading text-gray-900"
            data-testid="text-profile-title"
          >
            Your Profile
          </h2>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="default"
            className="text-senior hover:text-gray-900 min-h-12 px-4 py-2"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sign Out
          </Button>
        </div>

        {/* Profile Information */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Profile Information
              </div>
              <Button
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                variant="outline"
                size="sm"
                data-testid="button-edit-profile"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                {isEditingProfile ? "Cancel" : "Edit"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start space-x-4">
              <Avatar className="w-16 h-16">
                <AvatarImage 
                  src={authUser?.profileImageUrl || undefined} 
                  alt={`${authUser?.firstName || 'User'}'s profile`} 
                />
                <AvatarFallback className="text-lg">
                  {authUser?.firstName?.[0] || authUser?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                {isEditingProfile ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Enter your first name"
                          data-testid="input-first-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Enter your last name"
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="email" className="flex items-center">
                        <Mail className="w-4 h-4 mr-2" />
                        Email Address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        data-testid="input-email-edit"
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center">
                          <MapPin className="w-4 h-4 mr-2" />
                          Address
                        </h4>
                        {isLocationSupported() && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleGetCurrentLocation}
                            disabled={isGettingLocation}
                            data-testid="button-use-location-profile"
                          >
                            {isGettingLocation ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Getting Location...
                              </>
                            ) : (
                              <>
                                <Navigation className="w-4 h-4 mr-2" />
                                Use Current Location
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="streetAddress">Street Address</Label>
                        <Input
                          id="streetAddress"
                          value={streetAddress}
                          onChange={(e) => setStreetAddress(e.target.value)}
                          placeholder="123 Main Street"
                          data-testid="input-street-address-edit"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Your City"
                            data-testid="input-city-edit"
                          />
                        </div>

                        <div>
                          <Label htmlFor="state">State</Label>
                          <Input
                            id="state"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            placeholder="CA"
                            data-testid="input-state-edit"
                          />
                        </div>

                        <div>
                          <Label htmlFor="zipCode">ZIP Code</Label>
                          <Input
                            id="zipCode"
                            value={zipCode}
                            onChange={(e) => setZipCode(e.target.value)}
                            placeholder="12345"
                            data-testid="input-zip-code-edit"
                          />
                        </div>
                      </div>

                      <p className="text-sm text-gray-500">
                        This helps us find jobs close to you.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleProfileSave}
                        size="sm"
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-profile"
                      >
                        {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                      <Button
                        onClick={() => {
                          setIsEditingProfile(false);
                          setFirstName(authUser?.firstName || "");
                          setLastName(authUser?.lastName || "");
                          setEmail(authUser?.email || "");
                          setStreetAddress(authUser?.streetAddress || "");
                          setCity(authUser?.city || "");
                          setState(authUser?.state || "");
                          setZipCode(authUser?.zipCode || "");
                        }}
                        variant="outline"
                        size="sm"
                        data-testid="button-cancel-profile"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 
                      className="text-xl font-semibold text-foreground"
                      data-testid="text-user-name"
                    >
                      {authUser?.firstName && authUser?.lastName 
                        ? `${authUser.firstName} ${authUser.lastName}`
                        : authUser?.email || 'User'
                      }
                    </h3>
                    <div className="flex items-center text-muted-foreground">
                      <Mail className="w-4 h-4 mr-2" />
                      <span data-testid="text-user-email">
                        {authUser?.email || "Email not provided"}
                      </span>
                    </div>
                    {(authUser?.streetAddress || authUser?.city || authUser?.state || authUser?.zipCode) && (
                      <div className="flex items-center text-muted-foreground">
                        <MapPin className="w-4 h-4 mr-2" />
                        <span data-testid="text-user-address">
                          {[
                            authUser?.streetAddress,
                            authUser?.city,
                            authUser?.state,
                            authUser?.zipCode
                          ].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                    <Badge variant="secondary" className="mt-2">
                      Age 55+
                    </Badge>
                  </div>
                )}
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
                <h4 className="font-medium text-foreground">Email Notifications</h4>
                <p className="text-senior-muted">Receive job opportunities via email</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationsToggle}
                data-testid="switch-notifications"
              />
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-4">Notification Schedule</h4>
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

        {/* Job Preferences */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Briefcase className="w-5 h-5 mr-2" />
              Job Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-4">Job Types You're Interested In</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "outdoor", label: "Outdoor Work", description: "Gardening, landscaping, outdoor activities" },
                  { id: "helping", label: "Helping Others", description: "Teaching, mentoring, care services" },
                  { id: "creative", label: "Creative Work", description: "Arts, crafts, design projects" },
                  { id: "professional", label: "Professional", description: "Office work, consulting, admin" },
                  { id: "social", label: "Social Work", description: "Events, community, customer service" }
                ].map((jobType) => (
                  <div key={jobType.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <Checkbox
                      checked={preferredJobTypes.includes(jobType.id)}
                      onCheckedChange={(checked) => handleJobTypeToggle(jobType.id, checked as boolean)}
                      data-testid={`checkbox-job-type-${jobType.id}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{jobType.label}</div>
                      <div className="text-sm text-gray-600">{jobType.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-4">Work Location Preferences</h4>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { id: "remote", label: "Remote Work", description: "Work from home or anywhere" },
                  { id: "closetohome", label: "Close to Home", description: "Within 10 miles of your location" },
                  { id: "anywhere", label: "Anywhere in Town", description: "Willing to commute within the city" },
                  { id: "flexible", label: "Flexible Location", description: "Mix of locations or travel" }
                ].map((location) => (
                  <div key={location.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <Checkbox
                      checked={preferredLocations.includes(location.id)}
                      onCheckedChange={(checked) => handleLocationToggle(location.id, checked as boolean)}
                      data-testid={`checkbox-location-${location.id}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 flex items-center">
                        <MapPin className="w-4 h-4 mr-2" />
                        {location.label}
                      </div>
                      <div className="text-sm text-gray-600 ml-6">{location.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
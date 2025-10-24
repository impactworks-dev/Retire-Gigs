import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout";
import { JobCard } from "@/components/job-card";
import { JobSearchDialog } from "@/components/job-search-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
   
  Mail, 
  User, 
  TrendingUp, 
  Clock, 
  MapPin, 
  DollarSign,
  Users,
  Star,
  Target,
  Briefcase,
  Award,
  CheckCircle,
  Activity,
  Filter,
  X,
  RefreshCw
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { JobOpportunity, UserPreferences, InsertJobOpportunity } from "@shared/schema";
import headerImage from "@assets/Senior Woman Using Smartphone_1756590245643.png";

export default function Dashboard() {
  const { toast } = useToast();
  const { user: authUser, isLoading: authLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  // Search results state
  const [searchResults, setSearchResults] = useState<InsertJobOpportunity[] | null>(null);
  
  // Filter states
  const [matchScoreFilter, setMatchScoreFilter] = useState<string>("all");
  const [scheduleFilter, setScheduleFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

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

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-600">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Don't render dashboard if not authenticated
  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-600">Redirecting to login...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Fetch job opportunities - reasonable caching for development
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<JobOpportunity[]>({
    queryKey: ["/api/jobs"],
    enabled: !!authUser?.id,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnMount: false, // Don't automatically refetch on mount
    refetchOnWindowFocus: false, // Don't refetch when window gains focus
    refetchOnReconnect: true, // Only refetch when network reconnects
  });

  // Fetch user preferences
  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ["/api/preferences", authUser?.id],
    enabled: !!authUser?.id,
  });

  // Scrape fresh jobs mutation
  const scrapeJobsMutation = useMutation({
    mutationFn: async (params: { query: string; location: string; count: number }) => {
      const response = await apiRequest("POST", "/api/jobs/scrape", params);
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Fresh jobs fetched!",
        description: `Successfully scraped ${data.jobs?.length || 0} new jobs from Indeed.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to fetch fresh jobs",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  // Manual refresh jobs from database
  const refreshJobsMutation = useMutation({
    mutationFn: async () => {
      // Force refetch by invalidating and refetching
      await queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      return queryClient.refetchQueries({ queryKey: ["/api/jobs"] });
    },
    onSuccess: () => {
      toast({
        title: "Jobs refreshed!",
        description: "Latest jobs loaded from database.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to refresh jobs",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  // Determine which jobs to show (search results or default jobs)
  // Add temporary IDs to search results for rendering
  const displayJobs = useMemo(() => {
    if (searchResults !== null) {
      return searchResults.map((job, index) => ({
        ...job,
        id: `search-${index}-${Date.now()}`,
        createdAt: new Date(),
        url: job.url || null,
        matchScore: job.matchScore || null,
        isActive: job.isActive !== undefined ? job.isActive : true
      }));
    }
    return jobs;
  }, [searchResults, jobs]);

  // Filter jobs based on selected filters
  const filteredJobs = useMemo(() => {
    if (!displayJobs) return [];
    
    return displayJobs.filter((job) => {
      // Match Score filter
      if (matchScoreFilter !== "all" && job.matchScore !== matchScoreFilter) {
        return false;
      }
      
      // Schedule filter
      if (scheduleFilter !== "all" && !job.schedule.toLowerCase().includes(scheduleFilter.toLowerCase())) {
        return false;
      }
      
      // Location filter
      if (locationFilter !== "all") {
        const jobLocation = job.location.toLowerCase();
        if (locationFilter === "remote" && !jobLocation.includes("remote")) {
          return false;
        }
        if (locationFilter === "hybrid" && !jobLocation.includes("hybrid")) {
          return false;
        }
        if (locationFilter === "local" && (jobLocation.includes("remote") || jobLocation.includes("hybrid"))) {
          return false;
        }
      }
      
      // Tag filter
      if (tagFilter !== "all") {
        const jobTags = Array.isArray(job.tags) ? job.tags : [];
        if (!jobTags.includes(tagFilter)) {
          return false;
        }
      }
      
      return true;
    });
  }, [jobs, matchScoreFilter, scheduleFilter, locationFilter, tagFilter]);

  // Clear all filters
  const clearFilters = () => {
    setMatchScoreFilter("all");
    setScheduleFilter("all");
    setLocationFilter("all");
    setTagFilter("all");
  };

  // Check if any filters are active
  const hasActiveFilters = matchScoreFilter !== "all" || scheduleFilter !== "all" || locationFilter !== "all" || tagFilter !== "all";

  // Handle fetching fresh jobs
  const handleFetchFreshJobs = () => {
    scrapeJobsMutation.mutate({
      query: "remote work",
      location: "New York",
      count: 10
    });
  };

  if (authLoading || jobsLoading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-senior text-senior-secondary">Loading your dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  // Calculate metrics
  const jobMatches = jobs.filter(job => job.matchScore === "great" || job.matchScore === "good");
  const recentJobs = jobs.filter(job => job.timeAgo?.includes("day") || job.timeAgo?.includes("hour"));
  const avgPay = jobs.length > 0 ? 
    jobs.reduce((sum, job) => {
      const payMatch = job.pay.match(/\$(\d+)/);
      return sum + (payMatch ? parseInt(payMatch[1]) : 16);
    }, 0) / jobs.length : 16;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Hero Header */}
        <div className="relative mb-12">
          <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-blue-600 to-blue-800">
            <div className="flex flex-col lg:flex-row items-center">
              {/* Text Content */}
              <div className="flex-1 p-8 lg:p-12 text-white">
                <div className="flex items-center mb-4">
                  <h1 
                    className="mobile-heading lg:text-4xl font-bold"
                    data-testid="text-dashboard-welcome"
                  >
                    Welcome back, {authUser?.firstName || 'Friend'}!
                  </h1>
                  <Award className="w-8 h-8 ml-3 text-yellow-300" />
                </div>
                <p 
                  className="text-senior-large lg:text-xl mb-6 text-blue-100"
                  data-testid="text-dashboard-subtitle"
                >
                  Your personalized job matching platform for meaningful work opportunities
                </p>
                <div className="flex flex-wrap gap-4">
                  <JobSearchDialog onSearchComplete={setSearchResults} />
                  <Link href="/profile">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="bg-white text-blue-600 hover:bg-blue-50 text-senior-button min-h-12 px-6 py-3"
                      data-testid="button-manage-profile"
                    >
                      <User className="w-5 h-5 mr-2" />
                      Manage Profile
                    </Button>
                  </Link>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-senior px-4 py-2">
                    <Star className="w-4 h-4 mr-1" />
                    Premium Member
                  </Badge>
                </div>
              </div>
              {/* Header Image */}
              <div className="lg:w-80 lg:h-80 w-full h-48">
                <img 
                  src={headerImage}
                  alt="Senior woman using smartphone comfortably"
                  className="w-full h-full object-cover"
                  data-testid="img-dashboard-header"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-senior text-senior-secondary mb-1">Total Opportunities</p>
                  <p className="text-4xl font-bold text-gray-900" data-testid="metric-total-jobs">{jobs.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <p className="text-senior text-green-600 mt-2 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                +{recentJobs.length} this week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-senior text-senior-secondary mb-1">Great Matches</p>
                  <p className="text-4xl font-bold text-gray-900" data-testid="metric-matches">{jobMatches.length}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <p className="text-senior text-blue-600 mt-2">
                {Math.round((jobMatches.length / Math.max(jobs.length, 1)) * 100)}% match rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-senior text-senior-secondary mb-1">Average Pay</p>
                  <p className="text-4xl font-bold text-gray-900" data-testid="metric-avg-pay">${Math.round(avgPay)}/hr</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
              <p className="text-senior text-senior-muted mt-2">
                Range: $15-$20/hour
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-senior text-senior-secondary mb-1">Profile Score</p>
                  <p className="text-4xl font-bold text-gray-900" data-testid="metric-profile-score">92%</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Activity className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <p className="text-senior text-green-600 mt-2 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                Profile complete
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Job Market Insights */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Retitree Job Market Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Users className="w-5 h-5 text-green-600 mr-2" />
                  <h4 className="text-senior-large font-bold text-green-900">Growing Demand</h4>
                </div>
                <p className="text-green-700 text-senior">
                  Senior-friendly positions have increased 34% this year. Companies are actively seeking experienced workers.
                </p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Clock className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="text-senior-large font-bold text-blue-900">Flexible Schedules</h4>
                </div>
                <p className="text-blue-700 text-senior">
                  78% of positions offer part-time or flexible scheduling options perfect for retirement lifestyle.
                </p>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <MapPin className="w-5 h-5 text-purple-600 mr-2" />
                  <h4 className="text-senior-large font-bold text-purple-900">Local Opportunities</h4>
                </div>
                <p className="text-purple-700 text-senior">
                  Most matches are within 10 miles of your location, reducing commute stress.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link href="/profile">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-start"
                  data-testid="button-edit-preferences"
                >
                  <User className="w-5 h-5 mr-3" />
                  <div className="text-left">
                    <div className="text-senior-button font-semibold">Edit Job Preferences</div>
                    <div className="text-senior text-senior-secondary">Update your interests</div>
                  </div>
                </Button>
              </Link>

              <Link href="/retake-assessment">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-start"
                  data-testid="button-retake-questionnaire"
                >
                  <Target className="w-5 h-5 mr-3" />
                  <div className="text-left">
                    <div className="text-senior-button font-semibold">Retake Assessment</div>
                    <div className="text-senior text-senior-secondary">Update your answers</div>
                  </div>
                </Button>
              </Link>

              <Button
                variant="outline"
                size="lg"
                className="w-full justify-start"
                data-testid="button-trigger-notifications"
                onClick={async () => {
                  try {
                    const response = await fetch("/api/test-notifications", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" }
                    });
                    if (response.ok) {
                      toast({
                        title: "Notifications Sent",
                        description: "Job notifications have been processed and sent!",
                      });
                    } else {
                      throw new Error("Failed to send notifications");
                    }
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to send job notifications.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Mail className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="text-senior-button font-semibold">Send Job Alerts</div>
                  <div className="text-senior text-senior-secondary">Test email notifications</div>
                </div>
              </Button>

              <div className="pt-4 border-t">
                <h4 className="text-senior-large font-bold text-gray-900 mb-3">Your Preferences</h4>
                <div className="space-y-2 text-senior">
                  <div className="flex items-center justify-between">
                    <span className="text-senior-secondary">Email Alerts</span>
                    <Badge variant={preferences?.notificationsEnabled ? "default" : "secondary"}>
                      {preferences?.notificationsEnabled ? "On" : "Off"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-senior-secondary">Schedule</span>
                    <Badge variant="outline">
                      {preferences?.schedulePreference || "Weekly"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Results Banner */}
        {searchResults !== null && (
          <Card className="mb-6 bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Search Results</h3>
                    <p className="text-sm text-gray-600">
                      Showing {searchResults.length} jobs from your search
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setSearchResults(null)}
                  variant="outline"
                  size="sm"
                  className="text-senior"
                  data-testid="button-clear-search"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Show All Jobs
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Job Listings Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 
              className="mobile-heading text-gray-900"
              data-testid="text-job-matches-title"
            >
              {searchResults !== null ? 'Search Results' : 'Your Job Matches'}
            </h2>
            <p 
              className="text-senior-large text-senior-secondary"
              data-testid="text-job-matches-description"
            >
              {searchResults !== null ? 'Jobs matching your search criteria' : 'Based on your preferences and experience'}
            </p>
          </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleFetchFreshJobs}
            disabled={scrapeJobsMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white text-senior-button px-6 py-3 min-h-12 rounded-lg transition-colors duration-200"
            data-testid="button-fetch-fresh-jobs"
          >
            {scrapeJobsMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Fetch Fresh Jobs
              </>
            )}
          </Button>
          <Button
            onClick={() => refreshJobsMutation.mutate()}
            disabled={refreshJobsMutation.isPending}
            variant="outline"
            className="text-senior-button px-6 py-3 min-h-12 rounded-lg transition-colors duration-200"
            data-testid="button-refresh-jobs"
          >
            {refreshJobsMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Jobs
              </>
            )}
          </Button>
          <Badge variant="secondary" className="text-senior px-4 py-2">
            {filteredJobs.length} of {displayJobs.length} opportunities
          </Badge>
        </div>
        </div>

        {/* Filtering Options */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Filter className="w-5 h-5 mr-2 text-gray-600" />
                <h3 className="mobile-subheading text-gray-900">Filter Jobs</h3>
              </div>
              {hasActiveFilters && (
                <Button
                  onClick={clearFilters}
                  variant="outline"
                  size="default"
                  className="text-senior min-h-12 px-4 py-2"
                  data-testid="button-clear-filters"
                >
                  <X className="w-5 h-5 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Match Score Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Match Quality
                </label>
                <Select value={matchScoreFilter} onValueChange={setMatchScoreFilter}>
                  <SelectTrigger data-testid="select-match-score">
                    <SelectValue placeholder="All matches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All matches</SelectItem>
                    <SelectItem value="great">Great matches</SelectItem>
                    <SelectItem value="good">Good matches</SelectItem>
                    <SelectItem value="potential">Potential matches</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Schedule Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Schedule Type
                </label>
                <Select value={scheduleFilter} onValueChange={setScheduleFilter}>
                  <SelectTrigger data-testid="select-schedule">
                    <SelectValue placeholder="All schedules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All schedules</SelectItem>
                    <SelectItem value="part-time">Part-time</SelectItem>
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Location Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Location
                </label>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger data-testid="select-location">
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="local">Local/On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Job Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Category
                </label>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="outdoor">Outdoor work</SelectItem>
                    <SelectItem value="helping">Helping others</SelectItem>
                    <SelectItem value="creative">Creative work</SelectItem>
                    <SelectItem value="social">Social work</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Listings */}
        {filteredJobs.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onViewDetails={(jobId) => {
                  toast({
                    title: "Job Details",
                    description: "Job details view would be implemented here.",
                  });
                }}
              />
            ))}
          </div>
        ) : jobs.length > 0 ? (
          <Card className="mb-8">
            <CardContent className="p-12 text-center">
              <Filter className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Matching Jobs</h3>
              <p className="text-gray-600 mb-6">
                No jobs match your current filters. Try adjusting your filter criteria to see more opportunities.
              </p>
              <Button 
                onClick={clearFilters}
                variant="outline" 
                data-testid="button-clear-filters-empty"
              >
                Clear All Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-8">
            <CardContent className="p-12 text-center">
              <Mail className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Jobs Found</h3>
              <p className="text-gray-600 mb-6">
                We're actively searching for opportunities that match your preferences. Check back soon!
              </p>
              <Link href="/profile">
                <Button variant="outline" data-testid="button-update-preferences">
                  Update Preferences
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Senior Success Stories */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Star className="w-5 h-5 mr-2" />
              Success Stories from Fellow Seniors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center mb-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Margaret, 62</h4>
                    <p className="text-sm text-gray-600">Found garden coordinator role</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700">
                  "I love being outdoors and this job lets me share my passion for gardening while helping the community."
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6">
                <div className="flex items-center mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Robert, 59</h4>
                    <p className="text-sm text-gray-600">Part-time reading tutor</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700">
                  "Working with kids keeps me energized. The flexible schedule is perfect for my retirement."
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tips for Seniors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Award className="w-5 h-5 mr-2" />
              Tips for Senior Job Seekers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Flexible Scheduling</h4>
                <p className="text-sm text-gray-600">
                  Most employers are open to part-time and flexible schedules for experienced workers.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Experience Valued</h4>
                <p className="text-sm text-gray-600">
                  Your decades of experience are highly valued in today's job market.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Star className="w-6 h-6 text-purple-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Purpose-Driven</h4>
                <p className="text-sm text-gray-600">
                  Find work that provides meaning and connects you with your community.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
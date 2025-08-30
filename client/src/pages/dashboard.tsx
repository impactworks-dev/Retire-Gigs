import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { JobCard } from "@/components/job-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
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
  Activity
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { JobOpportunity, UserPreferences } from "@shared/schema";
import headerImage from "@assets/Senior Woman Using Smartphone_1756590245643.png";

export default function Dashboard() {
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

  if (authLoading || jobsLoading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your dashboard...</p>
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
                    className="text-3xl lg:text-4xl font-bold"
                    data-testid="text-dashboard-welcome"
                  >
                    Welcome back, {authUser?.firstName || 'Friend'}!
                  </h1>
                  <Award className="w-8 h-8 ml-3 text-yellow-300" />
                </div>
                <p 
                  className="text-xl mb-6 text-blue-100"
                  data-testid="text-dashboard-subtitle"
                >
                  Your personalized job matching platform for meaningful work opportunities
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/profile">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="bg-white text-blue-600 hover:bg-blue-50"
                      data-testid="button-manage-profile"
                    >
                      <User className="w-5 h-5 mr-2" />
                      Manage Profile
                    </Button>
                  </Link>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-lg px-4 py-2">
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
                  <p className="text-sm text-gray-600 mb-1">Total Opportunities</p>
                  <p className="text-3xl font-bold text-gray-900" data-testid="metric-total-jobs">{jobs.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <p className="text-sm text-green-600 mt-2 flex items-center">
                <TrendingUp className="w-4 h-4 mr-1" />
                +{recentJobs.length} this week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Great Matches</p>
                  <p className="text-3xl font-bold text-gray-900" data-testid="metric-matches">{jobMatches.length}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <p className="text-sm text-blue-600 mt-2">
                {Math.round((jobMatches.length / Math.max(jobs.length, 1)) * 100)}% match rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Average Pay</p>
                  <p className="text-3xl font-bold text-gray-900" data-testid="metric-avg-pay">${Math.round(avgPay)}/hr</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Range: $15-$20/hour
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Profile Score</p>
                  <p className="text-3xl font-bold text-gray-900" data-testid="metric-profile-score">92%</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Activity className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <p className="text-sm text-green-600 mt-2 flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
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
                Senior Job Market Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Users className="w-5 h-5 text-green-600 mr-2" />
                  <h4 className="font-semibold text-green-900">Growing Demand</h4>
                </div>
                <p className="text-green-700 text-sm">
                  Senior-friendly positions have increased 34% this year. Companies are actively seeking experienced workers.
                </p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Clock className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="font-semibold text-blue-900">Flexible Schedules</h4>
                </div>
                <p className="text-blue-700 text-sm">
                  78% of positions offer part-time or flexible scheduling options perfect for retirement lifestyle.
                </p>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <MapPin className="w-5 h-5 text-purple-600 mr-2" />
                  <h4 className="font-semibold text-purple-900">Local Opportunities</h4>
                </div>
                <p className="text-purple-700 text-sm">
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
                    <div className="font-medium">Edit Job Preferences</div>
                    <div className="text-sm text-gray-600">Update your interests</div>
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
                    <div className="font-medium">Retake Assessment</div>
                    <div className="text-sm text-gray-600">Update your answers</div>
                  </div>
                </Button>
              </Link>

              <div className="pt-4 border-t">
                <h4 className="font-medium text-gray-900 mb-3">Your Preferences</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Email Alerts</span>
                    <Badge variant={preferences?.notificationsEnabled ? "default" : "secondary"}>
                      {preferences?.notificationsEnabled ? "On" : "Off"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Schedule</span>
                    <Badge variant="outline">
                      {preferences?.schedulePreference || "Weekly"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Job Listings Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 
              className="text-2xl font-bold text-gray-900"
              data-testid="text-job-matches-title"
            >
              Your Job Matches
            </h2>
            <p 
              className="text-gray-600"
              data-testid="text-job-matches-description"
            >
              Based on your preferences and experience
            </p>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {jobs.length} opportunities
          </Badge>
        </div>

        {/* Job Listings */}
        {jobs.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {jobs.map((job) => (
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
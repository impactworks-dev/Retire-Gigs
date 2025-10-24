import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/layout";
import { UserPlus, ArrowRight, ArrowLeft, Check, CheckCircle, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

type JobType = "hands-on" | "outdoor" | "creative" | "helping" | "social" | "quiet" | "tech" | "professional";
type LocationPreference = "remote" | "closetohome" | "anywhere" | "flexible";

export default function Signup() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Basic Info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Step 2: Password & Demographics
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");

  // Step 3: Preferences
  const [preferredJobTypes, setPreferredJobTypes] = useState<JobType[]>([]);
  const [preferredLocations, setPreferredLocations] = useState<LocationPreference[]>([]);
  const [schedulePreference, setSchedulePreference] = useState<"daily" | "weekly" | "biweekly">("weekly");

  const jobTypeOptions = [
    { value: "hands-on" as JobType, label: "Hands-On Work", description: "Build, fix, or create things" },
    { value: "outdoor" as JobType, label: "Outdoor Work", description: "Work in nature or outside" },
    { value: "creative" as JobType, label: "Creative Work", description: "Art, design, writing" },
    { value: "helping" as JobType, label: "Helping Others", description: "Care, support, teaching" },
    { value: "social" as JobType, label: "Social Work", description: "Events, community, networking" },
    { value: "quiet" as JobType, label: "Quiet Work", description: "Research, analysis, focus work" },
    { value: "tech" as JobType, label: "Tech Work", description: "Computers, digital, software" },
    { value: "professional" as JobType, label: "Professional", description: "Office, consulting, advisory" },
  ];

  const locationOptions = [
    { value: "remote" as LocationPreference, label: "Remote", description: "Work from home" },
    { value: "closetohome" as LocationPreference, label: "Close to Home", description: "Within your area" },
    { value: "anywhere" as LocationPreference, label: "Anywhere", description: "Open to travel" },
    { value: "flexible" as LocationPreference, label: "Flexible", description: "Hybrid or variable" },
  ];

  const toggleJobType = (jobType: JobType) => {
    setPreferredJobTypes(prev =>
      prev.includes(jobType) ? prev.filter(t => t !== jobType) : [...prev, jobType]
    );
  };

  const toggleLocation = (location: LocationPreference) => {
    setPreferredLocations(prev =>
      prev.includes(location) ? prev.filter(l => l !== location) : [...prev, location]
    );
  };

  const handleReplitSignup = () => {
    // Redirect to Replit OAuth login, which will also handle signup
    window.location.href = "/api/login";
  };

  const validateStep1 = () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Please fill in all fields");
      return false;
    }
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError("Please enter a valid email address");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep2 = () => {
    if (!password || !confirmPassword || !gender || !age) {
      setError("Please fill in all fields");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    setError("");
    return true;
  };

  const validateStep3 = () => {
    if (preferredJobTypes.length === 0) {
      setError("Please select at least one job type");
      return false;
    }
    if (preferredLocations.length === 0) {
      setError("Please select at least one location preference");
      return false;
    }
    setError("");
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setError("");
    setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep3()) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Create account
      const signupResponse = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          age,
          gender,
        }),
        credentials: "include",
      });

      if (!signupResponse.ok) {
        const data = await signupResponse.json();
        throw new Error(data.message || "Signup failed");
      }

      const user = await signupResponse.json();

      // Save preferences
      const preferencesResponse = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          preferredJobTypes,
          preferredLocations,
          schedulePreference,
          notificationsEnabled: true,
        }),
        credentials: "include",
      });

      if (!preferencesResponse.ok) {
        const data = await preferencesResponse.json();
        throw new Error(data.message || "Failed to save preferences");
      }

      // Invalidate and refetch auth state after successful signup
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Redirect to dashboard
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Create Your Account
          </h2>
          <p className="text-senior text-muted-foreground">
            Join Retiree Gigs to find your next opportunity
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    s < step
                      ? "bg-primary text-white"
                      : s === step
                      ? "bg-primary text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-12 h-1 mx-2 ${
                      s < step ? "bg-primary" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {/* Step 1: Basic Information */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Basic Information
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <Input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    className="text-senior py-6 placeholder:text-gray-400"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <Input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="text-senior py-6 placeholder:text-gray-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@email.com"
                  className="text-senior py-6 placeholder:text-gray-400"
                  required
                />
              </div>

              <Button
                onClick={handleNext}
                size="lg"
                className="w-full bg-primary hover:bg-blue-700 text-white text-lg font-medium py-4 px-6"
              >
                Next
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or sign up with</span>
                </div>
              </div>

              {/* Replit OAuth Signup */}
              <Button
                onClick={handleReplitSignup}
                size="lg"
                variant="outline"
                className="w-full text-lg font-medium py-4 px-6"
              >
                <CheckCircle className="w-6 h-6 mr-3" />
                Sign Up with Replit
              </Button>
            </div>
          )}

          {/* Step 2: Password & Demographics */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Security & About You
              </h3>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="pr-10 text-senior py-6 placeholder:text-gray-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Must be at least 8 characters long
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="pr-10 text-senior py-6 placeholder:text-gray-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                    Gender
                  </label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-senior"
                    required
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non-binary">Non-binary</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-2">
                    Age Range
                  </label>
                  <select
                    id="age"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-senior"
                    required
                  >
                    <option value="">Select...</option>
                    <option value="55-60">55-60</option>
                    <option value="61-65">61-65</option>
                    <option value="66-70">66-70</option>
                    <option value="71-75">71-75</option>
                    <option value="76+">76+</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-4">
                <Button
                  onClick={handleBack}
                  size="lg"
                  variant="outline"
                  className="flex-1 text-lg font-medium py-4 px-6"
                >
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  size="lg"
                  className="flex-1 bg-primary hover:bg-blue-700 text-white text-lg font-medium py-4 px-6"
                >
                  Next
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Preferences */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Your Preferences
              </h3>

              {/* Job Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  What type of work interests you? (Select all that apply)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {jobTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleJobType(option.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        preferredJobTypes.includes(option.value)
                          ? "border-primary bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Location Preferences */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Where would you like to work? (Select all that apply)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {locationOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleLocation(option.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        preferredLocations.includes(option.value)
                          ? "border-primary bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule Preference */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  How often would you like job updates?
                </label>
                <div className="flex space-x-4">
                  {[
                    { value: "daily" as const, label: "Daily" },
                    { value: "weekly" as const, label: "Weekly" },
                    { value: "biweekly" as const, label: "Bi-weekly" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSchedulePreference(option.value)}
                      className={`flex-1 p-4 rounded-lg border-2 text-center transition-all ${
                        schedulePreference === option.value
                          ? "border-primary bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-medium text-gray-900">{option.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex space-x-4">
                <Button
                  type="button"
                  onClick={handleBack}
                  size="lg"
                  variant="outline"
                  className="flex-1 text-lg font-medium py-4 px-6"
                  disabled={isLoading}
                >
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1 bg-primary hover:bg-blue-700 text-white text-lg font-medium py-4 px-6"
                  disabled={isLoading}
                >
                  {isLoading ? "Creating Account..." : "Create Account"}
                  <Check className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </form>
          )}

          <p className="text-senior-muted mt-6 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login">
              <a className="text-primary hover:underline font-medium">Sign in</a>
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

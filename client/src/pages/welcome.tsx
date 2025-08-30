import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, ClipboardList, Zap, Clock, LogIn } from "lucide-react";
import { Layout } from "@/components/layout";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import seniorWomanImage from "@assets/generated_images/Senior_woman_using_smartphone_715d76e9.png";

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const handleGetStarted = () => {
    window.location.href = "/api/login";
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          {/* Hero Image */}
          <img 
            src={seniorWomanImage} 
            alt="Senior woman comfortably using smartphone on couch" 
            className="rounded-2xl shadow-lg w-full h-64 object-cover mb-8"
            data-testid="img-hero"
          />
          
          <h2 
            className="text-3xl font-bold text-gray-900 mb-4"
            data-testid="text-hero-title"
          >
            Find Meaningful Work After 55
          </h2>
          <p 
            className="text-xl text-gray-600 mb-8 leading-relaxed"
            data-testid="text-hero-description"
          >
            Connect with opportunities that match your experience, schedule, and goals. We'll help you find the perfect fit.
          </p>
        </div>

        {/* Age Verification */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h3 
            className="text-xl font-semibold text-gray-900 mb-6"
            data-testid="text-age-verification-title"
          >
            Age Verification
          </h3>
          <p 
            className="text-lg text-gray-600 mb-6"
            data-testid="text-age-verification-description"
          >
            This service is designed for adults 55 and older. Please confirm your age to continue.
          </p>
          
          <div className="space-y-4">
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="w-full bg-primary hover:bg-blue-700 text-white text-lg font-medium py-4 px-6"
              data-testid="button-get-started"
            >
              <LogIn className="w-6 h-6 mr-3" />
              I am 55 or older - Sign In to Get Started
            </Button>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm" data-testid="card-feature-assessment">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <ClipboardList className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Quick Assessment</h4>
            <p className="text-gray-600 text-sm">7 simple questions to understand your preferences</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm" data-testid="card-feature-matching">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-secondary" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Smart Matching</h4>
            <p className="text-gray-600 text-sm">AI-powered job matching based on your answers</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm" data-testid="card-feature-schedule">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Your Schedule</h4>
            <p className="text-gray-600 text-sm">Receive opportunities on your preferred schedule</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

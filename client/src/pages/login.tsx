import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/layout";
import { LogIn, CheckCircle, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleReplitLogin = () => {
    window.location.href = "/api/login";
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      if (response.ok) {
        // Invalidate and refetch auth state after successful login
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/");
      } else {
        const data = await response.json();
        setError(data.message || "Login failed");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h2 
            className="text-3xl font-bold text-foreground mb-4"
            data-testid="text-login-title"
          >
            Welcome Back
          </h2>
          <p 
            className="text-senior text-muted-foreground"
            data-testid="text-login-description"
          >
            Sign in to access your job matches and preferences.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Email/Password Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="pl-10 text-senior py-6 placeholder:text-gray-400"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pl-10 pr-10 text-senior py-6 placeholder:text-gray-400"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full bg-primary hover:bg-blue-700 text-white text-lg font-medium py-4 px-6"
              disabled={isLoading}
              data-testid="button-email-login"
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Replit OAuth Login */}
          <Button
            onClick={handleReplitLogin}
            size="lg"
            variant="outline"
            className="w-full text-lg font-medium py-4 px-6"
            data-testid="button-login"
          >
            <CheckCircle className="w-6 h-6 mr-3" />
            Sign In with Replit
          </Button>
          
          <p className="text-senior-muted mt-6 text-center text-sm">
            Don't have an account?{" "}
            <Link href="/signup">
              <a className="text-primary hover:underline font-medium">Sign up</a>
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { LogIn, CheckCircle } from "lucide-react";

export default function Login() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h2 
            className="text-3xl font-bold text-gray-900 mb-4"
            data-testid="text-login-title"
          >
            Welcome Back
          </h2>
          <p 
            className="text-lg text-gray-600"
            data-testid="text-login-description"
          >
            Sign in to access your job matches and preferences.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <Button
            onClick={handleLogin}
            size="lg"
            className="w-full bg-primary hover:bg-blue-700 text-white text-lg font-medium py-4 px-6"
            data-testid="button-login"
          >
            <CheckCircle className="w-6 h-6 mr-3" />
            Sign In with Replit
          </Button>
          
          <p 
            className="text-sm text-gray-500 mt-4 text-center"
            data-testid="text-login-help"
          >
            Secure authentication powered by Replit
          </p>
        </div>
      </div>
    </Layout>
  );
}
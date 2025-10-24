import { Menu, Briefcase, User, LogOut, Bookmark, BookmarkCheck, FileText, Newspaper, Bell } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      queryClient.clear();
      
      localStorage.clear();

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
      
      // Clear all cookies (fallback method)
      document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
      });

      // Call logout endpoint
      window.location.href = "/api/logout";
     window.location.href = "/login";
    } catch (error) {
      // If anything fails, still redirect
      window.location.href = "/api/logout";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Navigation */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 transition-colors min-h-12 -ml-2">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-white" />
                </div>
                <h1 className="mobile-subheading text-gray-900">Retiree Gigs</h1>
              </div>
            </Link>

            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="default"
                    className="text-senior-secondary hover:text-gray-900 rounded-lg min-h-12 px-4 py-2"
                    data-testid="menu-button"
                  >
                    <Menu className="w-6 h-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href="/saved-jobs">
                      <Bookmark className="w-5 h-5 mr-3" />
                      Saved Jobs
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/saved-news">
                      <BookmarkCheck className="w-5 h-5 mr-3" />
                      Saved Articles
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/resumes">
                      <FileText className="w-5 h-5 mr-3" />
                      Resume Builder
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link href="/notifications">
                      <Bell className="w-5 h-5 mr-3" />
                      Notifications
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link href="/news">
                      <Newspaper className="w-5 h-5 mr-3" />
                      News & Resources
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="w-5 h-5 mr-3" />
                      Profile & Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-5 h-5 mr-3" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login">
                <Button
                  variant="outline"
                  size="default"
                  className="text-senior-button min-h-12 px-6 py-3"
                  data-testid="button-login-nav"
                >
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {children}
      </main>
    </div>
  );
}
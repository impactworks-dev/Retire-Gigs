import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, refetch } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    refetchOnWindowFocus: true, // Refetch when window gains focus
    staleTime: 0, // Always check for fresh auth state
  });

  const invalidateAuth = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  const clearAuth = () => {
    queryClient.removeQueries({ queryKey: ["/api/auth/user"] });
    queryClient.setQueryData(["/api/auth/user"], null);
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    refetch,
    invalidateAuth,
    clearAuth,
  };
}
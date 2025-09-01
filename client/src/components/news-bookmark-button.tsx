import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface NewsBookmarkButtonProps {
  articleId: string;
  className?: string;
}

export default function NewsBookmarkButton({ articleId, className }: NewsBookmarkButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if article is saved
  const { data: savedStatus, isLoading: isCheckingStatus } = useQuery<{ isSaved: boolean }>({
    queryKey: ["/api/saved-news/check", articleId],
  });

  const isSaved = savedStatus?.isSaved || false;

  // Save article mutation
  const saveArticleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/saved-news", { articleId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-news/check", articleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-news"] });
      toast({
        title: "Article Saved",
        description: "Article has been saved to your reading list.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save article. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Unsave article mutation
  const unsaveArticleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/saved-news/${articleId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-news/check", articleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/saved-news"] });
      toast({
        title: "Article Removed",
        description: "Article has been removed from your reading list.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove article. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveToggle = () => {
    if (isSaved) {
      unsaveArticleMutation.mutate();
    } else {
      saveArticleMutation.mutate();
    }
  };

  if (isCheckingStatus) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className={`text-gray-400 ${className}`}
        data-testid={`button-save-article-loading-${articleId}`}
      >
        <Bookmark className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSaveToggle}
      disabled={saveArticleMutation.isPending || unsaveArticleMutation.isPending}
      className={`${isSaved ? 'text-blue-600 border-blue-600' : 'text-gray-600'} hover:bg-blue-50 ${className}`}
      data-testid={`button-save-article-${articleId}`}
    >
      {isSaved ? (
        <BookmarkCheck className="w-4 h-4" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
    </Button>
  );
}
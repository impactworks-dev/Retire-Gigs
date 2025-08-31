import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  User, 
  Clock, 
  Filter,
  X,
  Newspaper,
  ArrowRight
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { NewsArticle } from "@shared/schema";
import { format } from "date-fns";

export default function News() {
  // Filter states
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Fetch news articles
  const { data: articles = [], isLoading } = useQuery<NewsArticle[]>({
    queryKey: ["/api/news"],
  });

  // Filter articles based on selected category
  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    
    return articles.filter((article) => {
      if (categoryFilter !== "all" && article.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [articles, categoryFilter]);

  // Get unique categories for filter
  const categories = useMemo(() => {
    const uniqueCategories = Array.from(new Set(articles.map(article => article.category)));
    return uniqueCategories;
  }, [articles]);

  // Clear all filters
  const clearFilters = () => {
    setCategoryFilter("all");
  };

  // Check if any filters are active
  const hasActiveFilters = categoryFilter !== "all";

  // Format category for display
  const formatCategory = (category: string) => {
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'market-trends': 'bg-blue-100 text-blue-800',
      'career-tips': 'bg-green-100 text-green-800', 
      'industry-news': 'bg-purple-100 text-purple-800',
      'default': 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.default;
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Newspaper className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Job Market News & Insights</h1>
              <p className="text-gray-600 mt-1">Stay informed about job market trends and career opportunities for retirees</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filter by:</span>
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48" data-testid="filter-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {formatCategory(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearFilters}
                className="text-gray-600"
                data-testid="button-clear-filters"
              >
                <X className="w-4 h-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Articles List */}
        <div className="space-y-6">
          {filteredArticles.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Newspaper className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
                <p className="text-gray-600">
                  {hasActiveFilters 
                    ? "Try adjusting your filters to see more articles."
                    : "Check back soon for the latest job market news and insights."
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredArticles.map((article) => (
              <Card key={article.id} className="hover:shadow-lg transition-shadow duration-200" data-testid={`article-card-${article.id}`}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-3">
                        <Badge className={getCategoryColor(article.category)}>
                          {formatCategory(article.category)}
                        </Badge>
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="w-4 h-4 mr-1" />
                          {article.publishedAt ? format(new Date(article.publishedAt), 'MMM d, yyyy') : 'Recently'}
                        </div>
                      </div>
                      <CardTitle className="text-xl font-semibold text-gray-900 mb-2">
                        {article.title}
                      </CardTitle>
                      <div className="flex items-center text-sm text-gray-600 mb-3">
                        <User className="w-4 h-4 mr-1" />
                        <span>By {article.author}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-gray-600 mb-4 leading-relaxed">
                    {article.excerpt}
                  </p>
                  <Link href={`/news/${article.id}`}>
                    <Button variant="outline" className="group" data-testid={`button-read-article-${article.id}`}>
                      Read Full Article
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Stats Summary */}
        {filteredArticles.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="text-center text-sm text-gray-600">
              Showing {filteredArticles.length} of {articles.length} articles
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
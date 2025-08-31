import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  User, 
  ArrowLeft,
  Newspaper
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import type { NewsArticle } from "@shared/schema";
import { format } from "date-fns";

export default function NewsArticlePage() {
  const { id } = useParams<{ id: string }>();

  // Fetch individual article
  const { data: article, isLoading, error } = useQuery<NewsArticle>({
    queryKey: ["/api/news", id],
    enabled: !!id,
  });

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
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-12 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !article) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Card>
            <CardContent className="text-center py-12">
              <Newspaper className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Article not found</h3>
              <p className="text-gray-600 mb-4">
                The article you're looking for doesn't exist or has been removed.
              </p>
              <Link href="/news">
                <Button variant="outline" data-testid="button-back-to-news">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to News
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back button */}
        <div className="mb-6">
          <Link href="/news">
            <Button variant="ghost" className="text-gray-600 hover:text-gray-900" data-testid="button-back-to-news">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to News
            </Button>
          </Link>
        </div>

        {/* Article */}
        <article>
          <Card>
            {/* Article Header */}
            <CardHeader className="pb-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Badge className={getCategoryColor(article.category)}>
                    {formatCategory(article.category)}
                  </Badge>
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="w-4 h-4 mr-1" />
                    {article.publishedAt ? format(new Date(article.publishedAt), 'MMMM d, yyyy') : 'Recently'}
                  </div>
                </div>
                
                <h1 className="text-3xl font-bold text-gray-900 leading-tight" data-testid="article-title">
                  {article.title}
                </h1>
                
                <div className="flex items-center text-gray-600">
                  <User className="w-4 h-4 mr-1" />
                  <span className="font-medium">By {article.author}</span>
                </div>
              </div>
            </CardHeader>

            {/* Article Image */}
            {article.imageUrl && (
              <div className="px-6 mb-6">
                <img 
                  src={article.imageUrl.startsWith('attached_assets/') ? `/${article.imageUrl}` : article.imageUrl}
                  alt={article.title}
                  className="w-full h-64 object-cover rounded-lg"
                  data-testid="article-image"
                />
              </div>
            )}

            {/* Article Content */}
            <CardContent className="prose prose-lg max-w-none">
              <div 
                className="text-gray-700 leading-relaxed whitespace-pre-line"
                data-testid="article-content"
              >
                {article.content}
              </div>
            </CardContent>
          </Card>
        </article>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Published on {article.publishedAt ? format(new Date(article.publishedAt), 'MMMM d, yyyy') : 'Recently'}
            </div>
            <Link href="/news">
              <Button variant="outline" data-testid="button-more-articles">
                Read More Articles
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
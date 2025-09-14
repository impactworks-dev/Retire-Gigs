import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  User, 
  Newspaper,
  ArrowRight,
  ArrowLeft,
  BookmarkCheck
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import NewsBookmarkButton from "@/components/news-bookmark-button";

interface SavedNewsArticle {
  id: string;
  userId: string;
  articleId: string;
  savedAt: Date;
  article: {
    id: string;
    title: string;
    content: string;
    excerpt: string | null;
    author: string;
    category: string;
    imageUrl: string | null;
    publishedAt: Date | null;
    isPublished: boolean;
  };
}

export default function SavedNews() {
  // Fetch saved articles
  const { data: savedArticles = [], isLoading } = useQuery<SavedNewsArticle[]>({
    queryKey: ["/api/saved-news"],
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
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-200 rounded-lg h-48"></div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="mr-4"
            data-testid="button-back-to-dashboard"
          >
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <div className="flex items-center">
            <BookmarkCheck className="w-6 h-6 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900" data-testid="page-title-saved-news">
              Saved Articles
            </h1>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  {savedArticles.length}
                </div>
                <div className="text-gray-600">
                  {savedArticles.length === 1 ? 'Article Saved' : 'Articles Saved'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Saved Articles List */}
        <div className="space-y-6">
          {savedArticles.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Newspaper className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No saved articles yet</h3>
                <p className="text-gray-600 mb-4">
                  Start saving articles that interest you by clicking the bookmark icon on any article.
                </p>
                <Link href="/news">
                  <Button variant="outline" data-testid="button-browse-news">
                    Browse Articles
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            savedArticles.map((savedArticle) => (
              <Card key={savedArticle.id} className="hover:shadow-lg transition-shadow duration-200" data-testid={`saved-article-card-${savedArticle.article.id}`}>
                {/* Article Header Image */}
                {savedArticle.article.imageUrl && (
                  <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
                    <img 
                      src={savedArticle.article.imageUrl.startsWith('attached_assets/') ? `/${savedArticle.article.imageUrl}` : savedArticle.article.imageUrl}
                      alt={savedArticle.article.title}
                      className="w-full h-full object-cover"
                      data-testid={`saved-article-header-image-${savedArticle.article.id}`}
                    />
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-3">
                        <Badge className={getCategoryColor(savedArticle.article.category)}>
                          {formatCategory(savedArticle.article.category)}
                        </Badge>
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="w-4 h-4 mr-1" />
                          {savedArticle.article.publishedAt ? format(new Date(savedArticle.article.publishedAt), 'MMM d, yyyy') : 'Recently'}
                        </div>
                      </div>
                      <CardTitle className="text-xl font-semibold text-gray-900 mb-2">
                        {savedArticle.article.title}
                      </CardTitle>
                      <div className="flex items-center text-sm text-gray-600 mb-3">
                        <User className="w-4 h-4 mr-1" />
                        <span>By {savedArticle.article.author}</span>
                      </div>
                      <div className="text-senior-muted">
                        Saved {format(new Date(savedArticle.savedAt), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-gray-600 mb-4 leading-relaxed">
                    {savedArticle.article.excerpt || savedArticle.article.content.substring(0, 200) + '...'}
                  </p>
                  <div className="flex items-center justify-between">
                    <Link href={`/news/${savedArticle.article.id}`}>
                      <Button variant="outline" className="group" data-testid={`button-read-saved-article-${savedArticle.article.id}`}>
                        Read Full Article
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                    <NewsBookmarkButton articleId={savedArticle.article.id} />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Stats Summary */}
        {savedArticles.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="text-center text-sm text-gray-600">
              {savedArticles.length} {savedArticles.length === 1 ? 'article' : 'articles'} in your reading list
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
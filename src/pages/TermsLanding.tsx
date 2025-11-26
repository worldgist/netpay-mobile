import { FileText, Loader2 } from "lucide-react";
import { useContentPage } from "@/hooks/useContentPage";
import { MarkdownContent } from "@/components/MarkdownContent";

const TermsLanding = () => {
  const { content, loading, error } = useContentPage('terms_conditions');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-orange-600" />
          <p className="text-gray-600">Loading terms and conditions...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Terms & Conditions</h1>
          <p className="text-gray-600">{error || 'Content not available'}</p>
        </div>
      </div>
    );
  }

  const lastUpdated = new Date(content.updated_at).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30">
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg">
        <div className="container mx-auto px-6 py-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2">{content.title}</h1>
              <p className="text-orange-100 text-lg">Last updated: {lastUpdated}</p>
            </div>
          </div>
          {content.meta_description && (
            <p className="text-orange-50 max-w-3xl text-lg">
              {content.meta_description}
            </p>
          )}
        </div>
      </div>

      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="bg-white rounded-lg shadow-md p-8">
          <MarkdownContent content={content.content} />
        </div>
      </div>
    </div>
  );
};

export default TermsLanding;

import { Loader2 } from "lucide-react";
import { useContentPage } from "@/hooks/useContentPage";
import { MarkdownContent } from "@/components/MarkdownContent";

const About = () => {
  const { content, loading, error } = useContentPage('about_us');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-orange-600" />
          <p className="text-gray-600">Loading about page...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">About Us</h1>
          <p className="text-gray-600">{error || 'Content not available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="container mx-auto px-4 py-16 md:py-24 space-y-12">
        <div className="max-w-3xl space-y-6">
          <span className="text-brand font-semibold uppercase tracking-[0.35em] text-xs md:text-sm">
            Who We Are
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            {content.title}
          </h1>
          {content.meta_description && (
            <p className="text-muted-foreground text-lg leading-relaxed">
              {content.meta_description}
            </p>
          )}
        </div>

        <div className="bg-card rounded-lg shadow-md p-8">
          <MarkdownContent content={content.content} />
        </div>
      </section>
    </div>
  );
};

export default About;

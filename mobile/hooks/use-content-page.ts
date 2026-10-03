import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ContentPage {
  id: string;
  page_type: string;
  title: string;
  content: string;
  meta_description: string | null;
  is_published: boolean;
  updated_at: string;
}

export function useContentPage(pageType: string) {
  const [content, setContent] = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('content_pages')
          .select('id, page_type, title, content, meta_description, is_published, updated_at')
          .eq('page_type', pageType)
          .eq('is_published', true)
          .limit(1);

        if (fetchError) throw fetchError;

        const page = (data?.[0] as ContentPage | undefined) ?? null;
        if (cancelled) return;

        if (!page) {
          setError(`Content page "${pageType}" not found`);
          setContent(null);
        } else {
          setContent(page);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching content page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load content');
        setContent(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchContent();
    return () => {
      cancelled = true;
    };
  }, [pageType]);

  return { content, loading, error };
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ContentPage {
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
    async function fetchContent() {
      try {
        setLoading(true);
        setError(null);

        // Use limit(1) instead of maybeSingle() — the shared client sets
        // Accept: application/json, which makes PostgREST return 406 for object mode.
        const { data, error: fetchError } = await supabase
          .from('content_pages')
          .select('*')
          .eq('page_type', pageType)
          .eq('is_published', true)
          .limit(1);

        if (fetchError) {
          throw fetchError;
        }

        const page = data?.[0] ?? null;
        if (!page) {
          setError(`Content page "${pageType}" not found`);
          setContent(null);
        } else {
          setContent(page);
        }
      } catch (err) {
        console.error('Error fetching content page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load content');
        setContent(null);
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [pageType]);

  return { content, loading, error };
}





























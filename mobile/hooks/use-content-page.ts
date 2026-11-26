import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LEGAL_PRIVACY_MARKDOWN,
  LEGAL_PRIVACY_META,
  LEGAL_PRIVACY_TITLE,
  LEGAL_TERMS_MARKDOWN,
  LEGAL_TERMS_META,
  LEGAL_TERMS_TITLE,
} from '@/constants/legal-content';

export interface ContentPage {
  id: string;
  page_type: string;
  title: string;
  content: string;
  meta_description: string | null;
  is_published: boolean;
  updated_at: string;
}

function fallbackPage(pageType: string): ContentPage | null {
  if (pageType === 'terms_conditions') {
    return {
      id: 'fallback-terms',
      page_type: pageType,
      title: LEGAL_TERMS_TITLE,
      content: LEGAL_TERMS_MARKDOWN,
      meta_description: LEGAL_TERMS_META,
      is_published: true,
      updated_at: new Date().toISOString(),
    };
  }
  if (pageType === 'privacy_policy') {
    return {
      id: 'fallback-privacy',
      page_type: pageType,
      title: LEGAL_PRIVACY_TITLE,
      content: LEGAL_PRIVACY_MARKDOWN,
      meta_description: LEGAL_PRIVACY_META,
      is_published: true,
      updated_at: new Date().toISOString(),
    };
  }
  return null;
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

        // Prefer bundled legal copy when CMS content is missing or still the short seed stub.
        const local = fallbackPage(pageType);
        const cmsLooksStale =
          !!local &&
          (!page?.content?.trim() ||
            page.content.length < Math.min(1500, local.content.length * 0.4));

        if (cmsLooksStale && local) {
          setContent(local);
          setError(null);
        } else if (page) {
          setContent(page);
        } else {
          setError(`Content page "${pageType}" not found`);
          setContent(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching content page:', err);
        const local = fallbackPage(pageType);
        if (local) {
          setContent(local);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load content');
          setContent(null);
        }
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

/**
 * Sync Terms & Privacy markdown into content_pages (landing + in-app ContentPageScreen).
 */
import {
  LEGAL_PRIVACY_MARKDOWN,
  LEGAL_PRIVACY_META,
  LEGAL_PRIVACY_TITLE,
  LEGAL_TERMS_MARKDOWN,
  LEGAL_TERMS_META,
  LEGAL_TERMS_TITLE,
} from '@/content/legal-content';

export const mobileTermsContent = LEGAL_TERMS_MARKDOWN;
export const mobilePrivacyContent = LEGAL_PRIVACY_MARKDOWN;

/**
 * Sync mobile content to website content pages
 */
export async function syncMobileContentToWebsite(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User must be authenticated');
  }

  const { data: existingTerms, error: termsCheckError } = await supabase
    .from('content_pages')
    .select('id')
    .eq('page_type', 'terms_conditions')
    .maybeSingle();

  if (termsCheckError && termsCheckError.code !== 'PGRST116') {
    throw new Error(`Error checking terms page: ${termsCheckError.message}`);
  }

  const termsData = {
    page_type: 'terms_conditions',
    title: LEGAL_TERMS_TITLE,
    content: LEGAL_TERMS_MARKDOWN,
    meta_description: LEGAL_TERMS_META,
    is_published: true,
    last_updated_by: user.id,
  };

  if (existingTerms) {
    const { error: termsError } = await supabase
      .from('content_pages')
      .update(termsData)
      .eq('id', existingTerms.id);

    if (termsError) {
      throw new Error(`Error updating terms: ${termsError.message}`);
    }
  } else {
    const { error: termsError } = await supabase.from('content_pages').insert(termsData);

    if (termsError) {
      throw new Error(`Error creating terms: ${termsError.message}`);
    }
  }

  const { data: existingPrivacy, error: privacyCheckError } = await supabase
    .from('content_pages')
    .select('id')
    .eq('page_type', 'privacy_policy')
    .maybeSingle();

  if (privacyCheckError && privacyCheckError.code !== 'PGRST116') {
    throw new Error(`Error checking privacy page: ${privacyCheckError.message}`);
  }

  const privacyData = {
    page_type: 'privacy_policy',
    title: LEGAL_PRIVACY_TITLE,
    content: LEGAL_PRIVACY_MARKDOWN,
    meta_description: LEGAL_PRIVACY_META,
    is_published: true,
    last_updated_by: user.id,
  };

  if (existingPrivacy) {
    const { error: privacyError } = await supabase
      .from('content_pages')
      .update(privacyData)
      .eq('id', existingPrivacy.id);

    if (privacyError) {
      throw new Error(`Error updating privacy: ${privacyError.message}`);
    }
  } else {
    const { error: privacyError } = await supabase.from('content_pages').insert(privacyData);

    if (privacyError) {
      throw new Error(`Error creating privacy: ${privacyError.message}`);
    }
  }

  return { success: true, message: 'Mobile content synced successfully' };
}

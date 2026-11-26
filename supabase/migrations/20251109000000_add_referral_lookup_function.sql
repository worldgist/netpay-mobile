CREATE OR REPLACE FUNCTION public.find_referrer_by_referral_code(code TEXT)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_code TEXT;
  code_segment TEXT;
  referrer_id uuid;
BEGIN
  normalized_code := upper(trim(COALESCE(code, '')));
  IF normalized_code = '' THEN
    RETURN NULL;
  END IF;

  IF position('REF-' IN normalized_code) = 1 THEN
    code_segment := lower(substring(normalized_code FROM 5));
  ELSE
    code_segment := lower(normalized_code);
  END IF;

  IF code_segment = '' THEN
    RETURN NULL;
  END IF;

  SELECT p.id
  INTO referrer_id
  FROM public.profiles p
  WHERE lower(substring(p.id::text FROM 1 FOR char_length(code_segment))) = code_segment
  ORDER BY p.created_at ASC
  LIMIT 1;

  RETURN referrer_id;
END;
$$;

-- Match profile phones by last 10 digits so +234 / 0 / spacing variants all detect duplicates.
CREATE OR REPLACE FUNCTION public.check_duplicate_signup_phone(p_input text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d text := regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g');
  core text;
BEGIN
  IF length(d) < 10 THEN
    RETURN false;
  END IF;
  core := right(d, 10);
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles ph
    WHERE ph.phone IS NOT NULL
      AND length(regexp_replace(ph.phone, '[^0-9]', '', 'g')) >= 10
      AND right(regexp_replace(ph.phone, '[^0-9]', '', 'g'), 10) = core
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_duplicate_signup_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_duplicate_signup_phone(text) TO service_role;

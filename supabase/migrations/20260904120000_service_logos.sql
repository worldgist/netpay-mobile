-- Central catalogue of provider/service logos for mobile + web.
-- Images live in the public `service-logos` storage bucket.

CREATE TABLE IF NOT EXISTS public.service_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (
    category IN ('airtime', 'data', 'electricity', 'cable', 'education', 'betting')
  ),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_logos_category_code_key UNIQUE (category, code)
);

CREATE INDEX IF NOT EXISTS idx_service_logos_category
  ON public.service_logos (category);

CREATE INDEX IF NOT EXISTS idx_service_logos_active
  ON public.service_logos (is_active)
  WHERE is_active = true;

COMMENT ON TABLE public.service_logos IS
  'Provider logos for airtime, data, electricity, cable TV, education, and betting';

ALTER TABLE public.service_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active service logos" ON public.service_logos;
CREATE POLICY "Anyone can read active service logos"
ON public.service_logos
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage service logos" ON public.service_logos;
CREATE POLICY "Admins can manage service logos"
ON public.service_logos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role can manage service logos" ON public.service_logos;
CREATE POLICY "Service role can manage service logos"
ON public.service_logos
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_service_logos_updated_at ON public.service_logos;
CREATE TRIGGER update_service_logos_updated_at
BEFORE UPDATE ON public.service_logos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Public storage bucket for logo files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-logos',
  'service-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read service logos" ON storage.objects;
CREATE POLICY "Public read service logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'service-logos');

DROP POLICY IF EXISTS "Admins upload service logos" ON storage.objects;
CREATE POLICY "Admins upload service logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'service-logos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins update service logos" ON storage.objects;
CREATE POLICY "Admins update service logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'service-logos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'service-logos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins delete service logos" ON storage.objects;
CREATE POLICY "Admins delete service logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'service-logos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Ensure education_services can also store a logo_url (used by education screen)
ALTER TABLE public.education_services
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.airtime_providers
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Helper: build public storage URL for this project
-- Seed rows use relative storage paths; app resolves via EXPO_PUBLIC_SUPABASE_URL.
-- We also store absolute URLs using the project URL for convenience.

DO $$
DECLARE
  base_url TEXT := 'https://xrpuvnhmdmpgelfxpdcx.supabase.co/storage/v1/object/public/service-logos';
BEGIN
  INSERT INTO public.service_logos (category, code, name, logo_url, sort_order) VALUES
    -- Airtime / Data networks (shared logos)
    ('airtime', 'MTN', 'MTN', base_url || '/airtime/mtn.png', 1),
    ('airtime', 'AIRTEL', 'Airtel', base_url || '/airtime/airtel.png', 2),
    ('airtime', 'GLO', 'Glo', base_url || '/airtime/glo.png', 3),
    ('airtime', 'T2', 'T2', base_url || '/airtime/t2.png', 4),
    ('airtime', '9MOBILE', '9Mobile', base_url || '/airtime/9mobile.png', 5),

    ('data', 'MTN', 'MTN', base_url || '/data/mtn.png', 1),
    ('data', 'AIRTEL', 'Airtel', base_url || '/data/airtel.png', 2),
    ('data', 'GLO', 'Glo', base_url || '/data/glo.png', 3),
    ('data', 'T2', 'T2', base_url || '/data/t2.png', 4),
    ('data', '9MOBILE', '9Mobile', base_url || '/data/9mobile.png', 5),

    -- Electricity
    ('electricity', 'IKEJA', 'Ikeja Electricity', base_url || '/electricity/IKEDC.png', 1),
    ('electricity', 'EKO', 'Eko Electricity', base_url || '/electricity/EKEDC.png', 2),
    ('electricity', 'ABUJA', 'Abuja Electricity', base_url || '/electricity/AEDC.png', 3),
    ('electricity', 'KADUNA', 'Kaduna Electricity', base_url || '/electricity/KAEDCO.png', 4),
    ('electricity', 'IBADAN', 'Ibadan Electricity', base_url || '/electricity/IBEDC.png', 5),
    ('electricity', 'KANO', 'Kano Electricity', base_url || '/electricity/KEDCO.png', 6),
    ('electricity', 'PORTHARCOURT', 'Port-Harcourt Electricity', base_url || '/electricity/PHEDC.png', 7),
    ('electricity', 'JOS', 'Jos Electricity', base_url || '/electricity/JED.png', 8),
    ('electricity', 'BENIN', 'Benin Electricity', base_url || '/electricity/BEDC.png', 9),
    ('electricity', 'YOLA', 'Yola Electricity', base_url || '/electricity/YEDC.png', 10),
    ('electricity', 'ENUGU', 'Enugu Electricity', base_url || '/electricity/EEDC.png', 11),

    -- Cable TV
    ('cable', 'DSTV', 'DStv', base_url || '/cable/dstv.png', 1),
    ('cable', 'GOTV', 'GOtv', base_url || '/cable/gotv.png', 2),
    ('cable', 'STARTIMES', 'StarTimes', base_url || '/cable/startimes.png', 3),

    -- Education
    ('education', 'WAEC', 'WAEC', base_url || '/education/waec.png', 1),
    ('education', 'NECO', 'NECO', base_url || '/education/neco.png', 2),
    ('education', 'JAMB', 'JAMB', base_url || '/education/jamb.png', 3),

    -- Betting
    ('betting', 'BET9JA', 'Bet9ja', base_url || '/betting/bet9ja.png', 1),
    ('betting', 'NAIRABET', 'Nairabet', base_url || '/betting/nairabet.png', 2),
    ('betting', '1XBET', '1xBet', base_url || '/betting/1xbet.png', 3),
    ('betting', 'BETKING', 'BetKing', base_url || '/betting/betking.png', 4),
    ('betting', 'BETWAY', 'Betway', base_url || '/betting/betway.png', 5),
    ('betting', 'MERRYBET', 'MerryBet', base_url || '/betting/merrybet.png', 6),
    ('betting', 'BANGBET', 'BangBet', base_url || '/betting/bangbet.png.jpeg', 7),
    ('betting', 'BETLAND', 'BetLand', base_url || '/betting/betland.png.jpeg', 8),
    ('betting', 'BETLION', 'BetLion', base_url || '/betting/betlion.png.jpeg', 9),
    ('betting', 'CLOUDBET', 'CloudBet', base_url || '/betting/cloudbet.png.jpeg', 10),
    ('betting', 'LIVESCOREBET', 'LiveScoreBet', base_url || '/betting/livescorebet.png.jpeg', 11),
    ('betting', 'NAIJABET', 'NaijaBet', base_url || '/betting/naijabet.png.jpeg', 12),
    ('betting', 'SUPABET', 'SupaBet', base_url || '/betting/supabet.png.jpeg', 13),
    ('betting', 'SPORTYBET', 'SportyBet', base_url || '/betting/sportybet.png', 14),
    ('betting', 'ACCESSBET', 'AccessBet', base_url || '/betting/accessbet.png', 15)
  ON CONFLICT (category, code) DO UPDATE
  SET
    name = EXCLUDED.name,
    logo_url = EXCLUDED.logo_url,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

  -- Mirror network logos onto airtime_providers.logo_url
  UPDATE public.airtime_providers
  SET logo_url = base_url || '/airtime/mtn.png'
  WHERE upper(network_name) LIKE '%MTN%';

  UPDATE public.airtime_providers
  SET logo_url = base_url || '/airtime/airtel.png'
  WHERE upper(network_name) LIKE '%AIRTEL%';

  UPDATE public.airtime_providers
  SET logo_url = base_url || '/airtime/glo.png'
  WHERE upper(network_name) LIKE '%GLO%';

  UPDATE public.airtime_providers
  SET logo_url = base_url || '/airtime/9mobile.png'
  WHERE upper(network_name) LIKE '%9MOBILE%' OR upper(network_name) LIKE '%9 MOBILE%';

  UPDATE public.education_services
  SET logo_url = base_url || '/education/waec.png'
  WHERE upper(exam_type) = 'WAEC' AND (logo_url IS NULL OR logo_url = '');

  UPDATE public.education_services
  SET logo_url = base_url || '/education/neco.png'
  WHERE upper(exam_type) = 'NECO' AND (logo_url IS NULL OR logo_url = '');

  UPDATE public.education_services
  SET logo_url = base_url || '/education/jamb.png'
  WHERE upper(exam_type) = 'JAMB' AND (logo_url IS NULL OR logo_url = '');
END $$;

-- Broadcast logo updates to connected clients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'service_logos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_logos;
  END IF;
END $$;

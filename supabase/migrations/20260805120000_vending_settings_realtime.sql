-- Allow authenticated users to read vending provider settings (for app realtime + direct queries)
DROP POLICY IF EXISTS "Authenticated users can read vending provider settings" ON public.app_settings;

CREATE POLICY "Authenticated users can read vending provider settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (
  setting_key IN (
    'airtime_provider',
    'data_provider',
    'cable_provider',
    'electricity_provider',
    'betting_provider'
  )
);

-- Broadcast admin vending provider changes to connected clients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
  END IF;
END $$;

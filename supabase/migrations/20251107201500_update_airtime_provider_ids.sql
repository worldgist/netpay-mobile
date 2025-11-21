-- Align airtime provider network IDs with SMEPlug numbering
-- 1: MTN, 2: Airtel, 3: 9Mobile, 4: Glo

UPDATE public.airtime_providers
SET api_code = '1', updated_at = now()
WHERE upper(network_name) IN ('MTN', 'MTN NIGERIA');

UPDATE public.airtime_providers
SET api_code = '2', updated_at = now()
WHERE upper(network_name) IN ('AIRTEL', 'AIRTEL NIGERIA');

UPDATE public.airtime_providers
SET api_code = '3', updated_at = now()
WHERE upper(network_name) IN ('9MOBILE', '9 MOBILE', 'ETISALAT');

UPDATE public.airtime_providers
SET api_code = '4', updated_at = now()
WHERE upper(network_name) IN ('GLO', 'GLOBACOM');








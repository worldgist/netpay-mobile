-- Update airtime_providers with correct MobileNig API codes
UPDATE public.airtime_providers
SET api_code = 'BAD', updated_at = now()
WHERE network_name = 'MTN';

UPDATE public.airtime_providers
SET api_code = 'BAA', updated_at = now()
WHERE network_name = 'AIRTEL';

UPDATE public.airtime_providers
SET api_code = 'BAC', updated_at = now()
WHERE network_name = '9MOBILE';

UPDATE public.airtime_providers
SET api_code = 'BAB', updated_at = now()
WHERE network_name = 'GLO';
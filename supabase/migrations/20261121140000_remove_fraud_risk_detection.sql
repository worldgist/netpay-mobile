-- Remove fraud / risk detection tables and settings introduced in 20261121120000.

DROP POLICY IF EXISTS "Admins can manage fraud_cases" ON public.fraud_cases;
DROP POLICY IF EXISTS "Admins can read fraud_signals" ON public.fraud_signals;

DROP TABLE IF EXISTS public.fraud_cases;
DROP TABLE IF EXISTS public.fraud_signals;

DELETE FROM public.app_settings WHERE setting_key = 'purchase_risk_limits';

UPDATE public.app_settings
SET setting_value = setting_value - 'hold_score_threshold' - 'block_score_threshold',
    updated_at = now()
WHERE setting_key = 'transfer_risk_limits';

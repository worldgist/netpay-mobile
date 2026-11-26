-- Treasury Phase 2: liquidity bands + vendor balance alert thresholds.
-- Bank/gateway balance source of truth remains Flutterwave API (fetch-flutterwave-balance).

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'treasury_liquidity_thresholds',
  '{
    "healthy_min_pct": 100,
    "moderate_min_pct": 75,
    "low_min_pct": 50,
    "bank_gateway_source": "flutterwave"
  }'::jsonb,
  'system',
  'Liquidity coverage bands (%). Bank/gateway balance is read from Flutterwave API.'
)
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'treasury_low_balance_threshold',
  '{"threshold": 5000, "critical_threshold": 2000}'::jsonb,
  'system',
  'Vendor wallet low/critical balance alerts (NGN). Flutterwave is treated as bank/gateway, not a vending vendor for float totals.'
)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = COALESCE(public.app_settings.setting_value, '{}'::jsonb)
    || EXCLUDED.setting_value
    || CASE
         WHEN public.app_settings.setting_value ? 'critical_threshold' THEN '{}'::jsonb
         ELSE '{"critical_threshold": 2000}'::jsonb
       END,
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.app_settings (setting_key, setting_value, setting_category, description)
VALUES (
  'treasury_vendor_thresholds',
  '{
    "smeplug": {"low": 5000, "critical": 2000},
    "ebills": {"low": 5000, "critical": 2000},
    "mobilenig": {"low": 5000, "critical": 2000},
    "payvessel": {"low": 5000, "critical": 2000}
  }'::jsonb,
  'system',
  'Optional per-vendor low/critical balance thresholds (NGN). Falls back to treasury_low_balance_threshold.'
)
ON CONFLICT (setting_key) DO NOTHING;

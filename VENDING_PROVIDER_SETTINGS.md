# Vending Provider Settings

## Overview
All vending provider settings are now configured in the `app_settings` table. These settings control which API provider is used for each service type across the entire application.

## Provider Settings

### 1. Airtime Provider
**Setting Key:** `airtime_provider`
**Default:** vtpass
**Available Providers:**
- vtpass - VTpass API
- mobilenig - MobileNig API
- smeplug - SMEPLUG API
- ebills - eBills Africa API

### 2. Data Provider
**Setting Key:** `data_provider`
**Default:** smeplug
**Available Providers:**
- smeplug - SMEPLUG API (default, best for data plans)
- vtpass - VTpass API
- mobilenig - MobileNig API
- ebills - eBills Africa API

### 3. Cable TV Provider
**Setting Key:** `cable_provider`
**Default:** ebills
**Available Providers:**
- ebills - eBills Africa API (default, modern API)
- vtpass - VTpass API
- mobilenig - MobileNig API
- anyone - ANYONE API

**Supported Cable Providers:** DSTV, GOTV, STARTIMES

### 4. Electricity Provider
**Setting Key:** `electricity_provider`
**Default:** ebills
**Available Providers:**
- ebills - eBills Africa API (default)
- mobilenig - MobileNig API
- vtpass - VTpass API
- smeplug - SMEPLUG API

**Supported Disco:** AEDC, EKEDC, IKEDC, PHED, EEDC, KAEDCO, JED, IBEDC, and more

### 5. Education Provider
**Setting Key:** `education_provider`
**Default:** vtpass
**Available Providers:**
- vtpass - VTpass API (default)
- ebills - eBills Africa API

**Supported Services:** WAEC, NECO, NABTEB, JAMB

### 6. Betting Provider
**Setting Key:** `betting_provider`
**Default:** ebills
**Available Providers:**
- ebills - eBills Africa API (default)
- vtpass - VTpass API
- mobilenig - MobileNig API

## Admin Management

Each service has an admin management page where the vending provider can be changed:

1. **Airtime Management** - `/airtime-providers`
2. **Data Management** - `/data-plans`
3. **Cable TV Management** - `/cable-tv-plans`
4. **Electricity Management** - `/electricity-plans`
5. **Education Management** - `/education-services`
6. **Betting Management** - `/betting-management`

## How to Change Provider

### Via Admin Panel:
1. Navigate to the service management page (e.g., Cable TV Plans)
2. Look for "Vending Provider Settings" card
3. Select new provider from dropdown
4. System automatically updates and saves
5. All new transactions will use the selected provider

### Via SQL:
```sql
-- Update cable TV provider to mobilenig
UPDATE app_settings
SET setting_value = '{"provider": "mobilenig"}'::jsonb
WHERE setting_key = 'cable_provider';

-- Update electricity provider to ebills
UPDATE app_settings
SET setting_value = '{"provider": "ebills"}'::jsonb
WHERE setting_key = 'electricity_provider';
```

## Verification

Run this SQL to verify all provider settings:

```sql
SELECT 
  setting_key,
  setting_value->>'provider' as active_provider,
  description
FROM app_settings
WHERE setting_key LIKE '%_provider'
ORDER BY setting_key;
```

## Transaction Flow

When a user makes a purchase:

1. System fetches the provider setting from `app_settings`
2. Based on the provider, the appropriate edge function is called
3. Transaction is recorded with `vending_provider` field
4. Admin can track transactions by provider in management pages

## Database Schema

```sql
-- Provider settings are stored as JSONB
{
  "provider": "ebills"  -- or vtpass, mobilenig, smeplug, anyone
}

-- Each transaction table has a vending_provider column
vending_provider TEXT  -- stores which provider was used
```

## Files Modified

### Migrations:
- `supabase/migrations/20260117000000_add_all_vending_provider_settings.sql`

### SQL Scripts:
- `add-all-vending-provider-settings.sql` - Initial setup script
- `verify-all-provider-settings.sql` - Verification script

### Edge Functions:
- `fetch-mobilenig-cable-packages` - Fetches cable packages from MobileNig
- `fetch-ebills-cable-packages` - Fetches cable packages from eBills
- `fetch-vtpass-cable-packages` - Fetches cable packages from VTpass

### Admin Pages:
- `src/pages/CableTvPlans.tsx` - Cable TV provider management
- `src/pages/ElectricityPlans.tsx` - Electricity provider management
- `src/pages/DataPlans.tsx` - Data provider management
- `src/pages/AirtimeProviders.tsx` - Airtime provider management
- `src/pages/EducationServices.tsx` - Education provider management
- `src/pages/BettingManagement.tsx` - Betting provider management

### User Pages:
- `src/pages/user/PurchaseCableTv.tsx` - Fetches packages based on provider setting
- `src/pages/user/PurchaseElectricity.tsx` - Uses electricity provider setting
- And other purchase pages...

## Best Practices

1. **Test Before Switching:** Test new provider with a small transaction first
2. **Monitor Transactions:** Check transaction success rates after switching
3. **Balance Monitoring:** Some providers require sufficient balance
4. **API Credentials:** Ensure API credentials are configured in Supabase secrets
5. **Backup Settings:** Document provider changes for audit purposes

## Troubleshooting

### Provider not working after change:
1. Check console logs in browser developer tools
2. Verify API credentials in Supabase dashboard
3. Check provider balance (for mobilenig, vtpass, etc.)
4. Ensure edge functions are deployed
5. Verify RLS policies allow admin updates

### Packages not loading:
1. Check network requests in browser
2. Verify edge function is deployed
3. Check provider API status
4. Review Supabase function logs

## Support

For issues with specific providers:
- **VTpass:** Check VTpass dashboard and balance
- **MobileNig:** Verify enterprise API credentials
- **eBills:** Check JWT token and balance
- **SMEPLUG:** Verify API key and secret

## Migration History

- **2026-01-17:** Added all vending provider settings to app_settings
- Each provider setting can now be managed independently
- All services support multiple vending providers

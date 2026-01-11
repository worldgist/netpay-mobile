# VTpass Error Code 001 - Troubleshooting Guide

## What Error Code 001 Means

Error code "001" from VTpass API typically indicates:
1. **Invalid API credentials** (API key or Public key is incorrect)
2. **Service not authorized** - Your VTpass account doesn't have access to the JAMB service
3. **Account limitations** - Your account may not have JAMB service enabled
4. **API mode mismatch** - Using live credentials with sandbox endpoint or vice versa

## Your Current Configuration ✅

From your database check:
- ✅ Table structure is correct (`vending_provider`, `vtpass_code` columns exist)
- ✅ WAEC service imports successfully (means credentials work)
- ✅ Education provider is set to `vtpass`

## Likely Issue: JAMB Service Not Enabled

Since WAEC works but JAMB fails with code 001, this suggests:
- Your VTpass credentials are **valid** ✅
- Your account **has access to WAEC** ✅
- Your account **may NOT have access to JAMB** ❌

## How to Fix

### Option 1: Contact VTpass Support
1. Log in to your VTpass dashboard
2. Check if JAMB service is enabled for your account
3. Request JAMB service activation if needed
4. Verify your API credentials have access to JAMB

### Option 2: Check VTpass Dashboard
1. Go to: https://vtpass.com (or https://sandbox.vtpass.com for sandbox)
2. Log in to your account
3. Check "Services" or "Products" section
4. Verify JAMB is listed and enabled

### Option 3: Test in Sandbox Mode
If you have sandbox credentials:
1. Set `VTPASS_MODE=sandbox` in Supabase Edge Function secrets
2. Try importing JAMB again
3. Sandbox may have different service availability

### Option 4: Verify API Credentials Scope
1. Check if your API keys have access to education services
2. Some VTpass accounts have limited service access
3. You may need to upgrade your account plan

## What to Check in Supabase

### 1. Verify Environment Variables
Go to: Supabase Dashboard → Edge Functions → Secrets
- ✅ `VTPASS_API_KEY` - Should be set
- ✅ `VTPASS_PUBLIC_KEY` - Should be set
- ✅ `VTPASS_MODE` - Should be "live" or "sandbox"

### 2. Check Function Logs
1. Go to: Supabase Dashboard → Edge Functions → Logs
2. Filter for `fetch-education-services`
3. Look for the error details:
   - What URL was called?
   - What was the exact error response?
   - Are credentials being detected?

## Next Steps

1. **Contact VTpass** to verify JAMB service access
2. **Test with sandbox** if available
3. **Check function logs** for detailed error information
4. **Verify credentials** are correct in Supabase secrets

## Summary

Your database configuration is correct. The issue is with VTpass API access - specifically, your account likely doesn't have JAMB service enabled. Contact VTpass support to enable JAMB service on your account.
































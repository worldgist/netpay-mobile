# Demo User Setup for Apple App Review

This document explains how to set up a demo user account for Apple App Review and testing purposes.

## Demo User Credentials

- **Email**: `demo@netpayy.ng`
- **Password**: `Demo@1234`
- **PIN**: `1234`
- **Initial Balance**: ₦50,000.00

## Setup Methods

### Method 1: Using Edge Function (Recommended)

1. Deploy the edge function:
   ```bash
   supabase functions deploy create-demo-user
   ```

2. Call the function (no authentication required):
   ```bash
   curl -X POST https://<your-project>.supabase.co/functions/v1/create-demo-user \
     -H "Content-Type: application/json"
   ```

   Or from your browser/Postman, make a POST request to:
   ```
   https://<your-project>.supabase.co/functions/v1/create-demo-user
   ```

3. The function will:
   - Create the user in `auth.users` if it doesn't exist
   - Create/update the profile in `profiles` table
   - Set up PIN authentication (PIN: 1234)
   - Set initial balance to ₦50,000

### Method 2: Manual Setup via Supabase Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user" → "Create new user"
3. Enter:
   - Email: `demo@netpayy.ng`
   - Password: `Demo@1234`
   - Auto Confirm User: ✅ (checked)
4. After user is created, run the SQL migration:
   ```sql
   SELECT public.setup_demo_user();
   ```

### Method 3: Direct SQL (Advanced)

Run these SQL commands in Supabase SQL Editor:

```sql
-- First, create the user via Supabase Auth API or Dashboard
-- Then run:
SELECT public.setup_demo_user();
```

## Verification

After setup, verify the demo user:

```sql
-- Check profile
SELECT 
  id, 
  email, 
  full_name, 
  phone, 
  balance, 
  pin_enabled, 
  biometric_enabled, 
  status 
FROM profiles 
WHERE email = 'demo@netpayy.ng';

-- Check auth user
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email = 'demo@netpayy.ng';
```

## Testing Features

The demo user can test:

1. **Login**: Use email/password to login
2. **PIN Setup/Login**: PIN is already set to `1234`
3. **Biometric Login**: Can be enabled in app settings
4. **Transactions**: With ₦50,000 balance, can test:
   - Airtime purchases
   - Data purchases
   - Cable TV subscriptions
   - Electricity bill payments
   - Education services (WAEC, JAMB)
   - Fund transfers
   - Add money features

## Resetting Demo User

To reset the demo user's balance and settings:

```sql
UPDATE profiles 
SET 
  balance = 50000.00,
  status = 'active',
  pin_enabled = true,
  biometric_enabled = false,
  updated_at = now()
WHERE email = 'demo@netpayy.ng';

-- Reset PIN
SELECT public.setup_demo_user_pin(
  (SELECT id FROM profiles WHERE email = 'demo@netpayy.ng'),
  '1234'
);
```

## Security Notes

⚠️ **Important**: 
- This is a demo account with simple credentials
- Only use in development/staging environments
- Do NOT use in production
- Consider disabling this account after App Review
- The credentials are intentionally simple for Apple reviewers

## Apple App Review Notes

When submitting for review, provide these credentials in the App Review Information section:

```
Demo Account Credentials:
Email: demo@netpayy.ng
Password: Demo@1234
PIN: 1234
Referral Code: Check profile after login (format: DEMO-XXXX)

This account has been pre-loaded with ₦50,000 balance for testing all app features including:
- Airtime and data purchases
- Cable TV subscriptions
- Electricity bill payments
- Education services (WAEC, JAMB)
- Fund transfers
- Add money to wallet
- Referral code system
- Biometric authentication
- Account deletion (⚠️ permanent - account can be recreated via create-demo-user function)
- Transaction history

All features are functional and can be tested with this account.

For detailed testing instructions, please refer to APPLE_APP_REVIEW_GUIDE.md
```

**Important:** Include the APPLE_APP_REVIEW_GUIDE.md file with your submission for comprehensive testing instructions.

## Demo Test Numbers

For quick reference, see **DEMO_TEST_NUMBERS.md** which contains all test numbers for:
- Phone numbers (Airtime/Data)
- Electricity meter numbers
- Cable TV smart card numbers
- Education service test IDs


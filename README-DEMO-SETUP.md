# Demo User Setup Guide

This guide explains how to set up the demo user for Apple App Review testing.

## Quick Setup

### Option 1: Using Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/functions
2. Navigate to **Edge Functions** → **create-and-setup-demo-user**
3. Click **Invoke** button
4. The function will create the demo user and all demo data

### Option 2: Using Supabase CLI

```bash
# Make sure you're logged in
supabase login

# Link to your project (if not already linked)
supabase link --project-ref rekkdwpkzkhgnejgzhac

# Invoke the function
supabase functions invoke create-and-setup-demo-user
```

### Option 3: Using cURL

```bash
curl -X POST \
  "https://rekkdwpkzkhgnejgzhac.supabase.co/functions/v1/create-and-setup-demo-user" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

## Demo User Credentials

After running the setup, you can use these credentials:

- **Email**: `demo@netpayy.ng`
- **Password**: `Demo@1234`
- **PIN**: `1234` (if PIN setup is enabled)

## What Gets Created

The setup function creates:

1. **Auth User**: Demo user in Supabase Auth
2. **Profile**: User profile with initial balance of ₦50,000
3. **Virtual Account**: Demo virtual account for funding
4. **Transactions**:
   - 10 user_transactions (general transaction history)
   - 2 airtime_transactions (MTN and AIRTEL)
   - 2 data_transactions (MTN and GLO)
   - 2 electricity_transactions (EKEDC and PHEDC)
   - 1 funding_transaction (initial funding)

## After Setup

Once the demo user is created:

1. **Login**: Use the demo credentials to log in to the mobile app
2. **Auto-Setup**: The login screen will automatically call `setup-demo-user` to ensure all data is present
3. **Auto-Credit**: When the demo user clicks "I have added the money" in the Add Money screen, ₦50,000 will be automatically credited

## Testing the Demo User

### Quick Test Script

We've provided test scripts to verify the demo user setup:

**Bash Script:**
```bash
# Make sure SUPABASE_ANON_KEY is set
export SUPABASE_ANON_KEY="your-anon-key"
./scripts/test-demo-user.sh
```

**Node.js Script:**
```bash
# Make sure SUPABASE_ANON_KEY is set
export SUPABASE_ANON_KEY="your-anon-key"
node scripts/test-demo-simple.js
```

### Manual Testing Checklist

1. **Login Test**
   - Email: `demo@netpayy.ng`
   - Password: `Demo@1234`
   - Should login successfully

2. **Balance Check**
   - Should show balance of ₦100,000
   - Balance should be visible on home screen

3. **Transactions**
   - Should see demo transactions in transaction history
   - Should see transactions on home screen

4. **Airtime Purchase**
   - Should be able to purchase airtime without "insufficient balance" error
   - Test with small amount (₦100-₦500)

5. **Data Purchase**
   - Should be able to purchase data bundles
   - Test with small data plan

6. **Auto-Credit**
   - Go to "Add Money" screen
   - Click "I have added the money"
   - Should automatically credit ₦50,000

## Troubleshooting

If transactions are not visible:

1. Make sure the demo user has logged in (which triggers the setup)
2. Check the function logs in Supabase Dashboard
3. Verify RLS policies allow users to see their own transactions
4. Try manually calling `setup-demo-user` function after logging in

If you get "insufficient balance" errors:

1. Re-run the setup function to ensure balance is set to ₦100,000
2. Check the profile balance in Supabase Dashboard
3. Manually update balance: `UPDATE profiles SET balance = 100000.00 WHERE email = 'demo@netpayy.ng';`

## Functions Available

- **create-and-setup-demo-user**: Creates auth user and all demo data (no auth required)
- **setup-demo-user**: Sets up demo data for existing demo user (requires demo user auth)
- **demo-auto-credit**: Automatically credits ₦50,000 to demo user wallet (requires demo user auth)


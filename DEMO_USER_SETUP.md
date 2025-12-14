# Demo User Setup for Apple Review Testing

This document explains how to set up a demo user account for Apple App Store review testing.

## Demo User Credentials

- **Email**: `demo@netpayy.ng`
- **Password**: (Set when creating the auth user)
- **Virtual Account**: `1234567890`
- **Initial Balance**: ₦50,000

## Setup Steps

### 1. Create Auth User

Create the demo user via Supabase Auth API or Dashboard:

```bash
# Using Supabase CLI (if available)
# Or use Supabase Dashboard > Authentication > Users > Add User
```

**Required fields:**
- Email: `demo@netpayy.ng`
- Password: (choose a secure password for testing)
- Email confirmed: `true` (to skip email verification)

### 2. Initialize Demo Data

After creating the auth user, call the setup function to create all demo data:

```bash
# Using curl or Postman
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/setup-demo-user \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

Or use the Supabase Dashboard:
1. Go to Edge Functions
2. Find `setup-demo-user`
3. Click "Invoke" with empty body `{}`

### 3. Verify Setup

The setup function creates:
- ✅ Profile with ₦50,000 balance
- ✅ Virtual account (1234567890)
- ✅ Sample transactions (airtime, data, cable, electricity, transfer)
- ✅ Funding transaction record

## Demo Features

### Auto-Credit on Add Money

When the demo user clicks "I have added the money" in the Add Money screen:
- Automatically credits ₦50,000 to their wallet
- No actual bank transfer needed
- Works instantly for testing

### Demo Mode on Login

When demo user logs in:
- Automatically calls `setup-demo-user` to ensure all data exists
- Sets up demo mode for seamless testing

## Demo Data Created

The setup creates sample transactions for:

1. **Initial Funding** - ₦50,000 credit
2. **Airtime Purchase** - MTN ₦1,000
3. **Data Purchase** - 5GB MTN ₦2,000
4. **Cable TV** - DStv Compact ₦1,500
5. **Electricity** - EKEDC ₦5,000
6. **Transfer Received** - ₦10,000 credit

## Testing Checklist

Use the demo user to test:

- [ ] Login/Logout
- [ ] View balance
- [ ] Add money (auto-credits ₦50,000)
- [ ] Transfer money
- [ ] Purchase airtime
- [ ] Purchase data
- [ ] Purchase cable TV
- [ ] Purchase electricity
- [ ] Change PIN
- [ ] Delete account
- [ ] View transaction history

## Notes

- Demo user is identified by email: `demo@netpayy.ng`
- Auto-credit only works for demo user
- All demo transactions are marked with "DEMO-" prefix in reference
- Demo user can perform all normal app functions
- Virtual account is fake (1234567890) - no real bank account needed

## Troubleshooting

If demo user setup fails:
1. Verify auth user exists with email `demo@netpayy.ng`
2. Check edge function logs in Supabase Dashboard
3. Ensure RLS policies allow the operations
4. Verify all required tables exist (profiles, virtual_accounts, user_transactions, funding_transactions)

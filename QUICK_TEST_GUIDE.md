# Quick Demo Account Test Guide

This guide provides quick instructions to test all features with the demo account.

## 🚀 Quick Start

### 1. Ensure Demo User Exists

Run this command to create/reset the demo user:

```bash
curl -X POST https://rekkdwpkzkhgnejgzhac.supabase.co/functions/v1/create-demo-user \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "email": "demo@netpayy.ng",
  "balance": 50000,
  "referral_code": "DEMO-REF",
  ...
}
```

### 2. Login to App

**Web:**
- Navigate to your app URL (e.g., `https://netpayy.ng` or `http://localhost:5173`)
- Go to Login page
- Email: `demo@netpayy.ng`
- Password: `Demo@1234`

**Mobile:**
- Open the app
- Email: `demo@netpayy.ng`
- Password: `Demo@1234`
- PIN: `1234`

---

## 📋 Essential Features to Test

### ✅ Must Test (High Priority)

1. **Login** - Email/Password + PIN
2. **Airtime Purchase** - Buy ₦100 airtime for `08012345678` (MTN)
3. **Data Purchase** - Buy any 1GB data plan for `08012345678`
4. **View Transactions** - Check transaction history
5. **View Balance** - Verify balance updates after purchases

### ⭐ Recommended Test (Medium Priority)

6. **Electricity Payment** - Pay ₦500 for prepaid meter `1111111111111`
7. **Cable TV** - Subscribe to DStv package with card `1234567890`
8. **Add Money** - Add ₦5,000 to wallet (if payment method configured)
9. **Transfer** - Send ₦1,000 to another account (if testing with real recipient)
10. **Profile** - View and edit profile information

### 🔍 Optional Test (Low Priority)

11. **Education Services** - Purchase WAEC/JAMB PIN
12. **Referrals** - View referral code and earnings
13. **Notifications** - Check notification center
14. **Biometric Login** - Enable and test Face ID/Touch ID
15. **Delete Account** - ⚠️ Only test last (will delete account permanently)

---

## 🧪 Automated Test Script

You can run the automated test script (requires Node.js 18+):

```bash
# Set environment variables
export VITE_SUPABASE_URL="https://rekkdwpkzkhgnejgzhac.supabase.co"
export VITE_SUPABASE_ANON_KEY="your-anon-key-here"

# Run tests
node test-demo-features.js
```

Or create a `.env.test` file:
```
VITE_SUPABASE_URL=https://rekkdwpkzkhgnejgzhac.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Then run:
```bash
source .env.test && node test-demo-features.js
```

---

## 📱 Test Data Quick Reference

### Phone Numbers (for Airtime/Data)
- **MTN**: `08012345678`
- **Airtel**: `07012345678`
- **Glo**: `08098765432`
- **9mobile**: `09012345678`

⚠️ **Note**: These will receive actual airtime/data, use numbers you can verify!

### Electricity Meter Numbers
- **Prepaid (Test)**: `1111111111111`
- **Postpaid (Test)**: `1010101010101`

### Cable TV Smart Card Numbers
- **DStv**: `1234567890`
- **GOtv**: `9876543210`
- **Startimes**: `4567890123`

---

## 🐛 Common Issues & Solutions

### Issue: "Insufficient balance"
**Solution:** Reset demo user balance:
```sql
UPDATE profiles SET balance = 50000.00 WHERE email = 'demo@netpayy.ng';
```

### Issue: "Demo user not found"
**Solution:** Recreate demo user:
```bash
curl -X POST https://rekkdwpkzkhgnejgzhac.supabase.co/functions/v1/create-demo-user \
  -H "Content-Type: application/json"
```

### Issue: "Purchase failed"
**Possible Causes:**
1. Vendor API credentials not configured
2. Insufficient balance
3. Invalid phone/meter/card number
4. Network connectivity issue

**Solution:** Check function logs in Supabase Dashboard → Edge Functions → Logs

### Issue: "Account deleted"
**Solution:** Recreate demo user (see above)

---

## ✅ Test Checklist

For a comprehensive checklist, see: **DEMO_ACCOUNT_TEST_CHECKLIST.md**

---

## 📞 Support

If you encounter issues during testing:
- Check Supabase Dashboard → Edge Functions → Logs
- Verify environment variables are set correctly
- Ensure demo user exists and has balance
- Check vendor API credentials in Supabase secrets

---

**Last Updated:** February 2025

























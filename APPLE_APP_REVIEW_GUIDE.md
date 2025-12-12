# Apple App Review Testing Guide

This guide provides comprehensive instructions for Apple reviewers to test all app features using the demo account.

## Demo Account Credentials

```
Email:        demo@netpayy.ng
Password:     Demo@1234
PIN:          1234
Balance:      ₦50,000.00
Referral Code: DEMO-REF (or check profile for actual code)
```

## Testing Checklist

### ✅ 1. Login & Authentication

**Email/Password Login:**
1. Open the app
2. Enter email: `demo@netpayy.ng`
3. Enter password: `Demo@1234`
4. Tap "Sign In"
5. Should successfully log in

**PIN Login:**
1. After email login, you'll be prompted to enter PIN
2. Enter PIN: `1234`
3. Should successfully authenticate

**Biometric Authentication (Optional):**
1. After login, go to Profile → Settings → Security
2. Enable "Biometric Login" toggle
3. Logout and login again
4. Should prompt for biometric (Face ID/Touch ID)
5. Approve biometric to login

---

### ✅ 2. Airtime Purchase

**Steps:**
1. From Dashboard, tap "Buy Airtime"
2. Select Network (MTN, Airtel, Glo, or 9mobile)
3. Enter Phone Number (must be 11 digits, starting with 0)
4. Enter Amount (e.g., ₦100, ₦500, ₦1000)
5. Tap "Continue"
6. Review order summary
7. Tap "Confirm Payment"
8. Enter PIN: `1234` if prompted
9. Transaction should complete successfully
10. Airtime should be credited (check balance deducted)

**Test Phone Numbers:**
For testing airtime purchases, use any valid 11-digit Nigerian phone number format:

- **Format**: Must be exactly 11 digits starting with 0
- **Examples**:
  - `08012345678` (MTN format)
  - `07012345678` (Airtel/Glo format)
  - `09012345678` (9mobile format)
  - `08123456789` (Any valid format)

⚠️ **Important Notes:**
- The phone number you enter will receive the actual airtime purchase
- Use a phone number you have access to verify the airtime was credited
- Phone number must match the selected network (MTN number for MTN network, etc.)
- The system accepts formats like: `08012345678`, `+2348012345678`, or `2348012345678` (all will be normalized)

**Test Amounts:**
- Small: ₦100
- Medium: ₦500
- Large: ₦2000

---

### ✅ 3. Data Purchase

**Steps:**
1. From Dashboard, tap "Buy Data"
2. Select Network (MTN, Airtel, Glo, or 9mobile)
3. Select a data plan (prices displayed)
4. Enter Phone Number (11 digits, starting with 0, e.g., `08012345678`)
5. Tap "Continue"
6. Review order summary
7. Tap "Confirm Payment"
8. Enter PIN: `1234` if prompted
9. Transaction should complete successfully
10. Data should be credited

**Test Phone Numbers:**
Use the same format as airtime purchases:
- `08012345678` (MTN)
- `07012345678` (Airtel/Glo)
- `09012345678` (9mobile)
- Or any valid 11-digit Nigerian phone number

⚠️ **Note:** The phone number will receive the actual data bundle, so use a number you can verify.

**What to Test:**
- View available data plans for different networks
- Select different plan sizes
- Confirm balance is deducted correctly

---

### ✅ 4. Cable TV Subscription

**Steps:**
1. From Dashboard, tap "Cable TV"
2. Select Provider (DSTV, GOTV, Startimes, etc.)
3. Select Package (e.g., DSTV Compact, GOTV Smallie)
4. Enter Smart Card/Decoder Number (must be at least 10 digits)
5. Tap "Continue" or "Validate Card" (if available)
6. Review order summary (customer name should display if validation successful)
7. Tap "Confirm Payment"
8. Enter PIN: `1234` if prompted
9. Transaction should complete successfully
10. Subscription should be activated

**Demo Smart Card/Decoder Numbers:**
Use these test numbers for cable TV subscriptions:

- **DSTV**: 
  - `1234567890` (10 digits)
  - `1122334455` (10 digits)
  - Any valid 10-11 digit number format

- **GOTV**: 
  - `9876543210` (10 digits)
  - `2233445566` (10 digits)
  - Any valid 10-11 digit number format

- **Startimes**: 
  - `4567890123` (10 digits)
  - `3344556677` (10 digits)
  - Any valid 10-11 digit number format

⚠️ **Important Notes:**
- Card numbers must be at least 10 digits
- The system will validate the card number before purchase
- If validation fails, try a different number format
- Actual subscription will be activated on the entered card number
- For testing, use any valid format - the vendor API will handle validation

---

### ✅ 5. Electricity Bill Payment

**Steps:**
1. From Dashboard, tap "Electricity"
2. Select Disco (IKEDC, EKEDC, AEDC, etc.)
3. Select Meter Type (Prepaid or Postpaid)
4. Enter Meter Number (11-13 digits depending on disco)
5. Tap "Validate Meter" or "Continue"
6. Review order summary (customer name and address should display)
7. Select Amount (e.g., ₦1000, ₦2000, ₦5000)
8. Tap "Confirm Payment"
9. Enter PIN: `1234` if prompted
10. Transaction should complete successfully
11. Token should be generated and displayed (for prepaid)

**Demo Meter Numbers for Testing:**

**VTpass Sandbox Test Numbers** (if using sandbox mode):
- **Prepaid (Successful)**: `1111111111111` (13 digits)
- **Postpaid (Successful)**: `1010101010101` (13 digits)
- **Pending Transaction**: `201000000000` (12 digits)
- **General Test Format**: `12345678901` (11 digits)

**General Test Meter Numbers** (any valid format):
- **IKEDC (Ikeja)**: `12345678901` (11 digits)
- **EKEDC (Eko)**: `98765432109` (11 digits)
- **AEDC (Abuja)**: `11223344556` (11 digits)
- **PHED (Port Harcourt)**: `22334455667` (11 digits)
- **KEDCO (Kano)**: `33445566778` (11 digits)

⚠️ **Important Notes:**
- Meter numbers vary by Disco (11-13 digits)
- The system will validate the meter number before purchase
- Customer name and address will display after validation
- For prepaid meters, a token will be generated after payment
- For postpaid meters, the bill amount will be paid
- Use any valid format - the vendor API will handle validation
- Actual electricity will be credited to the entered meter number

**What to Test:**
- Meter number validation
- Customer information display
- Token generation (for prepaid)
- Balance deduction

---

### ✅ 6. Education Services

**WAEC Result Checker:**
1. From Dashboard, tap "Education"
2. Select "WAEC"
3. Enter Phone Number (optional for WAEC)
4. Select Service/Package
5. Review and confirm payment
6. PIN should be displayed after purchase

**JAMB PIN Purchase:**
1. From Dashboard, tap "Education"
2. Select "JAMB"
3. Enter **JAMB Profile ID** (required field)
   - Use demo Profile ID: `0123456789` (if testing in sandbox)
4. Select PIN type (UTME with mock / UTME without mock)
5. Review and confirm payment
6. Enter PIN: `1234` if prompted
7. PIN should be displayed after purchase

---

### ✅ 7. Fund Transfer

**Steps:**
1. From Dashboard, tap "Transfer"
2. Enter Recipient Email (must be another registered user)
3. Enter Amount (e.g., ₦1000)
4. Add optional Note/Memo
5. Tap "Continue"
6. Review transfer details
7. Tap "Confirm Transfer"
8. Enter PIN: `1234` if prompted
9. Transfer should complete successfully
10. Check transaction history for confirmation

**Testing Tips:**
- You can transfer to any valid email address
- Minimum transfer amount: Check app settings
- Balance should update immediately

---

### ✅ 8. Add Money

**Steps:**
1. From Dashboard, tap "Add Money" or "Fund Wallet"
2. Select payment method (if multiple available)
3. Enter Amount (e.g., ₦1000, ₦5000)
4. Follow payment instructions
5. Complete payment process
6. Balance should update after successful payment

**Note:** If payment gateway is configured, actual payment may be required. Otherwise, check if there's a test/demo mode.

---

### ✅ 9. Referral Code Testing

**View Your Referral Code:**
1. Go to Profile
2. Tap "Referral"
3. Your referral code should be displayed (format: `DEMO-XXXX` or `REF-XXXX`)
4. Copy the referral code

**Test Referral System:**
1. Logout from demo account
2. Create a new test account (or use another test account)
3. During signup, enter the demo account's referral code
4. Complete signup
5. Make a transaction (e.g., buy ₦1000 airtime)
6. Check if referral rewards are credited to the demo account

**Expected Behavior:**
- Referral code should be visible in profile
- When someone uses your code, you may receive rewards
- Check referral history for completed referrals

---

### ✅ 10. Transaction History

**View Transactions:**
1. From Dashboard, tap "Transactions" or go to Profile → Transactions
2. Should see list of all transactions:
   - Airtime purchases
   - Data purchases
   - Cable TV subscriptions
   - Electricity payments
   - Education purchases
   - Transfers (sent/received)
   - Add money transactions
3. Tap any transaction to view details
4. Should see:
   - Transaction date/time
   - Amount
   - Status (Success/Failed/Pending)
   - Reference number
   - Details specific to transaction type

---

### ✅ 11. Account Management

**Edit Profile:**
1. Go to Profile
2. Tap "Edit Profile"
3. Update Full Name, Phone Number
4. Save changes
5. Verify changes are reflected

**Change PIN:**
1. Go to Profile → Security
2. Tap "PIN Code" or "Change PIN"
3. Enter current PIN: `1234`
4. Enter new PIN
5. Confirm new PIN
6. Save changes

**Biometric Setup:**
1. Go to Profile → Security
2. Toggle "Biometric Login" ON
3. Approve biometric prompt
4. Logout and login again
5. Should prompt for biometric instead of PIN

---

### ✅ 12. Delete Account

**Test Account Deletion:**
1. Go to Profile
2. Scroll to "Delete Account" option
3. Tap "Delete Account"
4. Read the warning message about permanent deletion
5. Type "DELETE MY ACCOUNT" to confirm (exactly as shown)
6. Optionally enter password for additional verification
7. Tap "Delete My Account"
8. Confirm the final confirmation dialog
9. Account should be permanently deleted
10. You should be logged out and redirected to login screen

**Important Notes:**
- ⚠️ This action is PERMANENT and cannot be undone
- All data, transactions, and account information will be deleted
- If the demo account is deleted during review, you can recreate it by calling the create-demo-user function again
- After deletion, you cannot login with the same credentials unless the account is recreated

**What Gets Deleted:**
- User profile and personal information
- All transaction history
- Wallet balance (ensure you've tested purchases first)
- Referral codes and referral history
- All saved preferences and settings

---

### ✅ 13. Notifications

**Check Notifications:**
1. Go to Profile → Notifications
2. Should see:
   - Transaction notifications
   - Account updates
   - Promotional messages (if any)

---

## Expected Behavior Summary

### ✅ Should Work:
- All purchases complete successfully
- Balance updates correctly after transactions
- Transaction history shows all activities
- PIN authentication works for all transactions
- Biometric login can be enabled/disabled
- Referral code is visible and functional
- Profile can be edited
- Account deletion works with proper confirmation
- All services display correct prices and options

### ⚠️ Things to Note:
- Some transactions may use test/sandbox modes
- Actual services (airtime, data, etc.) may require real vendor integrations
- Payment gateways may be in test mode
- Referral rewards may have minimum transaction requirements

---

## Common Issues & Solutions

**Issue: Transaction fails**
- Check if balance is sufficient
- Verify network connection
- Try a different amount or service

**Issue: PIN not working**
- Default PIN is `1234`
- Try resetting PIN from profile settings

**Issue: Biometric not available**
- Ensure device supports biometric authentication
- Check app permissions for biometric access

**Issue: Services not loading**
- Check network connection
- Some services may require active vendor accounts

---

## Support Information

If you encounter any issues during testing:
1. Check the transaction history for error messages
2. Verify account balance is sufficient
3. Ensure network connectivity
4. Try logging out and logging back in

For technical support during review, contact:
- Support Email: support@netpayy.ng
- Support Phone: +234 706 739 8399

---

## Demo Account Reset/Recreation

**If Demo Account is Deleted During Testing:**

If the demo account gets deleted (especially after testing the delete account feature), you can recreate it:

**Option 1: Using Edge Function (Recommended)**
```bash
curl -X POST https://rekkdwpkzkhgnejgzhac.supabase.co/functions/v1/create-demo-user \
  -H "Content-Type: application/json"
```

**Option 2: Manual Recreation via Supabase Dashboard**
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user" → "Create new user"
3. Enter:
   - Email: `demo@netpayy.ng`
   - Password: `Demo@1234`
   - Auto Confirm User: ✓
4. Run SQL in SQL Editor:
   ```sql
   SELECT public.setup_demo_user();
   ```

**Reset Account (Without Deleting):**

If you just need to reset the demo account without deleting:
- Call the create-demo-user function again (it will update existing account)
- Or use the reset SQL script in DEMO_USER_SETUP.md

This will:
- Reset balance to ₦50,000
- Reset PIN to `1234`
- Keep existing transaction history (depending on implementation)

---

## Testing Priority

**High Priority (Must Test):**
1. ✅ Login (Email/Password)
2. ✅ PIN Authentication
3. ✅ Airtime Purchase
4. ✅ Data Purchase
5. ✅ View Transaction History

**Medium Priority:**
6. ✅ Cable TV Subscription
7. ✅ Electricity Payment
8. ✅ Fund Transfer
9. ✅ Add Money

**Low Priority (Nice to Have):**
10. ✅ Education Services
11. ✅ Referral Code
12. ✅ Biometric Login
13. ✅ Profile Management
14. ✅ Delete Account (⚠️ Test Last - Account will be permanently deleted)

---

**Last Updated:** February 2025
**Demo Account Status:** Active and Ready for Testing


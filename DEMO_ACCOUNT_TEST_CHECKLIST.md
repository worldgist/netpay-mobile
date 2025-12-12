# Demo Account Comprehensive Test Checklist

This checklist covers all features that should be tested with the demo account for Apple App Review and general QA.

## Demo Account Credentials

```
Email:    demo@netpayy.ng
Password: Demo@1234
PIN:      1234
Balance:  ₦50,000.00
```

---

## ✅ Authentication & Security

### 1. Email/Password Login
- [ ] Login with email: `demo@netpayy.ng`
- [ ] Login with password: `Demo@1234`
- [ ] Successfully redirected to dashboard
- [ ] Balance displayed correctly (₦50,000)

### 2. PIN Authentication
- [ ] Prompted to enter PIN after login
- [ ] Enter PIN: `1234`
- [ ] Successfully authenticated
- [ ] Can access dashboard

### 3. Biometric Authentication (Optional)
- [ ] Navigate to Profile → Settings
- [ ] Enable "Biometric Login" toggle
- [ ] Logout
- [ ] Login again
- [ ] Biometric prompt appears (Face ID/Touch ID)
- [ ] Approve biometric → Successfully logged in

---

## ✅ Wallet & Transactions

### 4. View Balance
- [ ] Balance is visible on dashboard
- [ ] Balance shows/hides with eye icon toggle
- [ ] Balance updates after transactions

### 5. Transaction History
- [ ] Navigate to "Transactions" page
- [ ] View all transaction types (airtime, data, cable, electricity, transfers)
- [ ] Filter by transaction type works
- [ ] Transaction details are accurate
- [ ] Dates and amounts are correct

---

## ✅ Bill Payments

### 6. Airtime Purchase
**Steps:**
1. Navigate to "Pay Bills" → "Airtime"
2. Select Network: MTN
3. Enter Phone Number: `08012345678` (use a real number you can verify)
4. Enter Amount: ₦100
5. Tap "Continue"
6. Review order summary
7. Tap "Confirm Payment"
8. Enter PIN: `1234`

**Expected:**
- [ ] Transaction completes successfully
- [ ] Success message displayed
- [ ] Reference number shown
- [ ] Balance deducted correctly
- [ ] Transaction appears in history
- [ ] Airtime credited to phone number (verify on phone)

**Test with different networks:**
- [ ] MTN: `08012345678`
- [ ] Airtel: `07012345678`
- [ ] Glo: `08098765432`
- [ ] 9mobile: `09012345678`

### 7. Data Purchase
**Steps:**
1. Navigate to "Pay Bills" → "Data"
2. Select Network: MTN
3. Select a data plan (e.g., 1GB for ₦500)
4. Enter Phone Number: `08012345678`
5. Tap "Continue"
6. Review order summary
7. Tap "Confirm Payment"
8. Enter PIN: `1234`

**Expected:**
- [ ] Transaction completes successfully
- [ ] Success message displayed
- [ ] Reference number shown
- [ ] Balance deducted correctly
- [ ] Transaction appears in history
- [ ] Data credited to phone number (verify on phone)

**Test with different networks:**
- [ ] MTN
- [ ] Airtel
- [ ] Glo
- [ ] 9mobile

### 8. Electricity Payment
**Steps:**
1. Navigate to "Pay Bills" → "Electricity"
2. Select Disco: Ikeja Electric (or any available)
3. Enter Meter Number: `1111111111111` (Prepaid test number)
4. Select Meter Type: Prepaid
5. Enter Amount: ₦500
6. Enter Phone: `08012345678`
7. Tap "Continue"
8. Review order summary
9. Tap "Confirm Payment"
10. Enter PIN: `1234`

**Expected:**
- [ ] Meter validated successfully
- [ ] Customer name displayed (for test numbers)
- [ ] Transaction completes successfully
- [ ] Token generated (for prepaid)
- [ ] Balance deducted correctly
- [ ] Transaction appears in history

**Test with:**
- [ ] Prepaid meter: `1111111111111`
- [ ] Postpaid meter: `1010101010101` (if available)

### 9. Cable TV Subscription
**Steps:**
1. Navigate to "Pay Bills" → "Cable TV"
2. Select Provider: DStv (or any available)
3. Enter Smart Card Number: `1234567890`
4. Select Package: Compact (or any available)
5. Enter Phone: `08012345678`
6. Tap "Continue"
7. Review order summary
8. Tap "Confirm Payment"
9. Enter PIN: `1234`

**Expected:**
- [ ] Smart card validated successfully
- [ ] Customer name displayed
- [ ] Transaction completes successfully
- [ ] Reference number shown
- [ ] Balance deducted correctly
- [ ] Transaction appears in history

**Test with different providers:**
- [ ] DStv: `1234567890`
- [ ] GOtv: `9876543210`
- [ ] Startimes: `4567890123`

### 10. Education Services
**Steps:**
1. Navigate to "Pay Bills" → "Education"
2. Select Exam Type: WAEC (or JAMB)
3. Select a service/pin
4. Enter Quantity: 1
5. Tap "Continue"
6. Review order summary
7. Tap "Confirm Payment"
8. Enter PIN: `1234`

**Expected:**
- [ ] Transaction completes successfully
- [ ] PIN/Result displayed
- [ ] Balance deducted correctly
- [ ] Transaction appears in history

---

## ✅ Wallet Management

### 11. Add Money
**Steps:**
1. Navigate to "Add Money"
2. Select payment method (if multiple available)
3. Enter Amount: ₦5,000
4. Follow payment instructions
5. Complete payment

**Expected:**
- [ ] Virtual account generated (if applicable)
- [ ] Payment instructions clear
- [ ] Balance updates after successful payment
- [ ] Transaction appears in history

### 12. Fund Transfer
**Steps:**
1. Navigate to "Transfer"
2. Enter Recipient Phone/Account: `08098765432` (or valid recipient)
3. Enter Amount: ₦1,000
4. Add Note (optional): "Test transfer"
5. Tap "Continue"
6. Review transfer details
7. Tap "Confirm Transfer"
8. Enter PIN: `1234`

**Expected:**
- [ ] Recipient validated successfully
- [ ] Transfer completes successfully
- [ ] Reference number shown
- [ ] Balance deducted correctly
- [ ] Transaction appears in history (sent)
- [ ] Recipient receives funds (if testing with real account)

---

## ✅ Profile & Settings

### 13. View Profile
- [ ] Navigate to "Profile"
- [ ] Name displayed correctly
- [ ] Email displayed correctly
- [ ] Phone number displayed
- [ ] Balance displayed
- [ ] Profile picture (if applicable)

### 14. Edit Profile
- [ ] Tap "Edit Profile"
- [ ] Update Full Name
- [ ] Update Phone Number
- [ ] Save changes
- [ ] Changes reflected on profile page

### 15. Notifications
- [ ] Navigate to "Notifications"
- [ ] View notification list
- [ ] Notifications are readable
- [ ] Mark as read works (if available)

### 16. Referral System
- [ ] Navigate to "Referral"
- [ ] View referral code (should be `DEMO-REF` or similar)
- [ ] Copy referral code works
- [ ] Referral statistics displayed
- [ ] Referral earnings shown (if any)

---

## ✅ Support & Legal

### 17. Contact Us
- [ ] Navigate to "Contact Us"
- [ ] Form is accessible
- [ ] Can submit contact form (optional - don't spam)
- [ ] Support information displayed

### 18. Terms & Conditions
- [ ] Navigate to "Terms & Conditions"
- [ ] Page loads successfully
- [ ] Content is readable

### 19. Privacy Policy
- [ ] Navigate to "Privacy Policy"
- [ ] Page loads successfully
- [ ] Content is readable

---

## ✅ Account Management

### 20. Delete Account (⚠️ TEST LAST)
**Warning:** This will permanently delete the demo account!

**Steps:**
1. Navigate to "Profile" → "Delete Account"
2. Read warning message
3. Enter Password: `Demo@1234`
4. Confirm deletion
5. Enter PIN: `1234` (if prompted)

**Expected:**
- [ ] Warning message clearly displayed
- [ ] Account deleted successfully
- [ ] Redirected to login page
- [ ] Cannot login with deleted account

**After Testing Delete Account:**
- [ ] Recreate demo account using: `create-demo-user` function
- [ ] Verify account is recreated with ₦50,000 balance

---

## ✅ Edge Cases & Error Handling

### 21. Insufficient Balance
- [ ] Attempt purchase with amount greater than balance
- [ ] Error message displayed clearly
- [ ] Transaction not processed

### 22. Invalid Phone Number
- [ ] Enter invalid phone number format
- [ ] Error message displayed
- [ ] Transaction not processed

### 23. Invalid Meter/Card Number
- [ ] Enter invalid meter number for electricity
- [ ] Error message displayed
- [ ] Transaction not processed

### 24. Network Connectivity
- [ ] Test with poor/no network
- [ ] Appropriate error handling
- [ ] User-friendly error messages

---

## ✅ UI/UX

### 25. Navigation
- [ ] Bottom navigation works
- [ ] All pages accessible
- [ ] Back button works
- [ ] Loading states displayed

### 26. Responsive Design
- [ ] Works on different screen sizes
- [ ] Layout adapts correctly
- [ ] Text is readable
- [ ] Buttons are tappable

### 27. Accessibility
- [ ] Text is readable
- [ ] Colors have sufficient contrast
- [ ] Interactive elements are accessible

---

## Test Results Summary

**Date Tested:** _______________

**Tester:** _______________

**Environment:** [ ] Web [ ] Mobile (iOS) [ ] Mobile (Android)

**Overall Status:**
- [ ] ✅ All tests passed
- [ ] ⚠️  Some tests failed (see notes below)
- [ ] ❌ Multiple critical failures

**Notes:**
```
[Add any issues, observations, or notes here]
```

**Failed Tests:**
1. ________________________________
2. ________________________________
3. ________________________________

---

## Quick Test Commands

### Ensure Demo User Exists:
```bash
curl -X POST https://rekkdwpkzkhgnejgzhac.supabase.co/functions/v1/create-demo-user \
  -H "Content-Type: application/json"
```

### Reset Demo User Balance:
```sql
UPDATE profiles 
SET balance = 50000.00, updated_at = now()
WHERE email = 'demo@netpayy.ng';
```

### Check Demo User Status:
```sql
SELECT id, email, full_name, balance, status, pin_enabled
FROM profiles 
WHERE email = 'demo@netpayy.ng';
```

---

**Last Updated:** February 2025
**Test Coverage:** All major features and user flows


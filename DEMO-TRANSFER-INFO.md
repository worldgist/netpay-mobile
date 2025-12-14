# Demo Transfer Information

## Demo User Credentials

### Primary Demo User (Sender)
- **Email:** `demo@netpayy.ng`
- **Password:** `Demo@1234`
- **Balance:** ₦100,000 (can be auto-credited)

### Demo Recipient User (For Testing Transfers)
- **Email:** `demo-recipient@netpayy.ng`
- **Password:** `Demo@1234`
- **Balance:** ₦10,000 (initial balance)
- **Status:** ✅ Created and ready to use

## How to Test Transfers

### Step-by-Step Instructions

1. **Login as Demo User:**
   - Email: `demo@netpayy.ng`
   - Password: `Demo@1234`

2. **Navigate to Transfer Screen:**
   - Go to the Transfer option in the app

3. **Enter Recipient Email:**
   - **Recipient Email:** `demo-recipient@netpayy.ng`
   - Click "Verify" to verify the recipient

4. **Enter Transfer Details:**
   - Amount: e.g., ₦1,000
   - Description: (optional) e.g., "Test transfer"

5. **Complete Transfer:**
   - Review the transfer details
   - Confirm the transfer
   - The recipient will receive the amount in their wallet

## Transfer Fee
- **Fee:** 5% of transfer amount
- **Minimum Fee:** ₦10
- **Example:** 
  - Transfer Amount: ₦1,000
  - Transfer Fee: ₦50 (5%)
  - **Total Deducted:** ₦1,050

## Demo Recipient Details
- **Email:** `demo-recipient@netpayy.ng`
- **Name:** Demo Recipient
- **Phone:** 08098765432
- **Initial Balance:** ₦10,000

## Notes
- ✅ Demo recipient user is already created and ready to use
- ✅ Both users use the same password (`Demo@1234`) for simplicity
- ✅ The recipient user will receive the transferred amount in their wallet
- ✅ Transfer transactions will appear in both users' transaction history
- ✅ You can login as the recipient user to see received transfers

## Creating Demo Recipient (If Needed)

If the demo recipient doesn't exist, you can create it by calling:
```bash
curl -X POST \
  "https://rekkdwpkzkhgnejgzhac.supabase.co/functions/v1/create-demo-recipient" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```


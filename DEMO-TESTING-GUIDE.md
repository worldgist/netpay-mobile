# Demo User Testing Guide

## Demo User Credentials

- **Email:** `demo@netpayy.ng`
- **Password:** `Demo@1234`
- **Phone Number:** `08012345678` ⭐

---

## Quick Reference: What Numbers to Use

### 📱 Airtime Purchase
- **Use:** `08012345678` (demo user's phone number)
- **Works for:** All networks (MTN, AIRTEL, GLO, 9MOBILE)
- **Note:** This is the demo user's registered phone number

### 📶 Data Purchase
- **Use:** `08012345678` (demo user's phone number)
- **Works for:** All networks (MTN, AIRTEL, GLO, 9MOBILE)
- **Note:** This is the demo user's registered phone number

### 📺 Cable TV Purchase
- **DStv:** Use smartcard `1234567890`
- **GOtv:** Use smartcard `3456789012`
- **StarTimes:** Use smartcard `5678901234`
- See `DEMO-SMARTCARD-METER-NUMBERS.md` for full list

### ⚡ Electricity Purchase
- **EKEDC:** Use meter `12345678901`
- **PHEDC:** Use meter `98765432109`
- **IKEDC:** Use meter `11223344556`
- **AEDC:** Use meter `99887766554`
- **KAEDC:** Use meter `55667788990`
- **JED:** Use meter `44332211009`
- See `DEMO-SMARTCARD-METER-NUMBERS.md` for full list

### 💸 Money Transfer
- **Recipient Email:** `demo-recipient@netpayy.ng`
- See `DEMO-TRANSFER-INFO.md` for details

---

## Step-by-Step Testing

### 1. Login
- Email: `demo@netpayy.ng`
- Password: `Demo@1234`

### 2. Add Money (Auto-Credit)
- Go to "Add Money" screen
- Click "I have added the money"
- System automatically credits ₦50,000 to wallet

### 3. Purchase Airtime
- Select any network (MTN, AIRTEL, GLO, 9MOBILE)
- Enter phone number: `08012345678`
- Enter amount
- Complete purchase

### 4. Purchase Data
- Select any network (MTN, AIRTEL, GLO, 9MOBILE)
- Enter phone number: `08012345678`
- Select data plan
- Complete purchase

### 5. Purchase Cable TV
- Select provider (DStv, GOtv, StarTimes)
- Enter smartcard number (see table above)
- Select plan
- Complete purchase

### 6. Purchase Electricity
- Select provider (EKEDC, PHEDC, etc.)
- Select meter type (prepaid/postpaid)
- Enter meter number (see table above)
- Enter amount
- Complete purchase

### 7. Transfer Money
- Enter recipient email: `demo-recipient@netpayy.ng`
- Enter amount
- Complete transfer

---

## Important Notes

1. **Phone Number:** Always use `08012345678` for airtime and data purchases
2. **Auto-Credit:** Demo user gets ₦50,000 automatically when clicking "I have added the money"
3. **Demo Transactions:** Demo user has pre-populated transaction history
4. **Balance:** Demo user starts with ₦100,000 balance
5. **All numbers are demo/test numbers** - they won't actually receive services

---

## Related Documentation

- `DEMO-PHONE-NUMBERS.md` - Phone numbers for airtime/data
- `DEMO-SMARTCARD-METER-NUMBERS.md` - Smartcard and meter numbers
- `DEMO-TRANSFER-INFO.md` - Transfer recipient information
- `README-DEMO-SETUP.md` - Setup instructions






















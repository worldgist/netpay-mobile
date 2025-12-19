# Purchase Features Backup

This backup contains all code and functions related to the following purchase features:

## Features Backed Up

### Purchase Features
1. **Airtime Purchase**
2. **Data Purchase**
3. **Cable TV Purchase**
4. **Electricity Purchase**
5. **Education Purchase**
6. **Add Money (Wallet Top-up)**

### Authentication Features
7. **Login** - User authentication with email/password and biometric support
8. **Signup** - User registration with email verification
9. **Forgot Password** - Password reset with OTP code verification
10. **Reset Password** - Password reset flow with 8-digit code input
11. **Email Verification** - Email verification screen for new signups

## Directory Structure

```
backup/purchases/
├── mobile/
│   ├── app/              # Mobile app screens
│   │   ├── auth/         # Authentication screens
│   │   │   ├── login.tsx
│   │   │   └── signup.tsx
│   │   ├── forget-password.tsx
│   │   ├── reset-password.tsx
│   │   ├── email-verification.tsx
│   │   ├── airtime-purchase.tsx
│   │   ├── data-purchase.tsx
│   │   ├── cable-tv.tsx
│   │   ├── electricity.tsx
│   │   ├── education.tsx
│   │   ├── add-money.tsx
│   │   └── payment-success.tsx
│   └── utils/            # Mobile utilities
│       └── transactionStorage.ts
├── web/
│   └── pages/
│       ├── user/         # User-facing purchase pages
│       │   ├── PurchaseAirtime.tsx
│       │   ├── PurchaseData.tsx
│       │   ├── PurchaseCableTv.tsx
│       │   ├── PurchaseElectricity.tsx
│       │   └── PurchaseEducation.tsx
│       └──              # Admin/management pages
│           ├── AirtimeProviders.tsx
│           ├── CableTvPlans.tsx
│           ├── ElectricityPlans.tsx
│           └── EducationServices.tsx
├── functions/            # Supabase Edge Functions
│   ├── purchase-smeplug-airtime/
│   ├── purchase-smeplug-data/
│   ├── purchase-vtpass-data/
│   ├── purchase-cable-tv/
│   ├── purchase-vtpass-cable/
│   ├── purchase-mobilenig-electricity/
│   ├── purchase-education/
│   ├── fetch-cable-packages/
│   ├── fetch-education-prices/
│   ├── fetch-education-services/
│   ├── fetch-electricity-packages/
│   ├── fetch-smeplug-airtime-providers/
│   ├── fetch-smeplug-data-plans/
│   ├── fetch-vtpass-data-plans/
│   ├── fetch-vtpass-cable-packages/
│   ├── validate-cable-customer/
│   ├── validate-meter-number/
│   ├── validate-mobilenig-meter/
│   ├── validate-jamb-profile/
│   ├── get-virtual-account/
│   └── transfer-funds/
└── shared/              # Shared utilities
    ├── wallet.ts
    ├── push-notifications.ts
    └── vendor-calls.ts
```

## Backup Information

- **Total Files**: 46 files (including auth features)
- **Total Size**: ~1.2MB
- **Backup Date**: See BACKUP_DATE.txt

## Restoration Instructions

### 1. Mobile App Files
```bash
# Purchase screens
cp backup/purchases/mobile/app/*.tsx mobile/app/

# Authentication screens
cp -r backup/purchases/mobile/app/auth mobile/app/

# Utilities
cp backup/purchases/mobile/utils/* mobile/utils/
```

### 2. Web Pages
```bash
cp backup/purchases/web/pages/user/* src/pages/user/
cp backup/purchases/web/pages/*.tsx src/pages/
```

### 3. Supabase Functions
```bash
cp -r backup/purchases/functions/* supabase/functions/
```

### 4. Shared Utilities
```bash
cp backup/purchases/shared/* supabase/functions/_shared/
```

## Notes

- All files maintain their original directory structure
- This backup includes both mobile and web implementations
- All Supabase Edge Functions for purchases are included
- Shared utilities used across purchase features are included
- Validation and fetch functions are included for completeness
- Payment success screen is included as it's used by all purchases
- Authentication features include:
  - Login with email/password and biometric authentication
  - Signup with email verification
  - Password reset flow with OTP code verification (8-digit codes)
  - Email verification screen for new user signups

## Related Files (Not Included)

The following files are related but not included in this backup:
- Database migrations and schemas
- Configuration files (app.json, package.json, etc.)
- Client-side push notification utilities (mobile/utils/push-notifications.ts)
- Other utility files not directly related to purchases

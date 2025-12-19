#!/bin/bash

# Create backup directories
mkdir -p backup/purchases/mobile/app
mkdir -p backup/purchases/web/pages/user
mkdir -p backup/purchases/web/pages
mkdir -p backup/purchases/functions
mkdir -p backup/purchases/shared

# Backup mobile app files
echo "Backing up mobile app files..."
cp mobile/app/airtime-purchase.tsx backup/purchases/mobile/app/ 2>/dev/null
cp mobile/app/data-purchase.tsx backup/purchases/mobile/app/ 2>/dev/null
cp mobile/app/cable-tv.tsx backup/purchases/mobile/app/ 2>/dev/null
cp mobile/app/electricity.tsx backup/purchases/mobile/app/ 2>/dev/null
cp mobile/app/education.tsx backup/purchases/mobile/app/ 2>/dev/null
cp mobile/app/add-money.tsx backup/purchases/mobile/app/ 2>/dev/null

# Backup web pages
echo "Backing up web pages..."
cp src/pages/user/PurchaseAirtime.tsx backup/purchases/web/pages/user/ 2>/dev/null
cp src/pages/user/PurchaseData.tsx backup/purchases/web/pages/user/ 2>/dev/null
cp src/pages/user/PurchaseCableTv.tsx backup/purchases/web/pages/user/ 2>/dev/null
cp src/pages/user/PurchaseElectricity.tsx backup/purchases/web/pages/user/ 2>/dev/null
cp src/pages/user/PurchaseEducation.tsx backup/purchases/web/pages/user/ 2>/dev/null
cp src/pages/AirtimeProviders.tsx backup/purchases/web/pages/ 2>/dev/null
cp src/pages/CableTvPlans.tsx backup/purchases/web/pages/ 2>/dev/null
cp src/pages/ElectricityPlans.tsx backup/purchases/web/pages/ 2>/dev/null
cp src/pages/EducationServices.tsx backup/purchases/web/pages/ 2>/dev/null

# Backup Supabase functions
echo "Backing up Supabase functions..."
cp -r supabase/functions/purchase-smeplug-airtime backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/purchase-smeplug-data backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/purchase-vtpass-data backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/purchase-cable-tv backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/purchase-vtpass-cable backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/purchase-mobilenig-electricity backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/purchase-education backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-cable-packages backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-education-prices backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-education-services backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-electricity-packages backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-smeplug-airtime-providers backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-smeplug-data-plans backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-vtpass-data-plans backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/fetch-vtpass-cable-packages backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/validate-cable-customer backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/validate-meter-number backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/validate-mobilenig-meter backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/validate-jamb-profile backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/get-virtual-account backup/purchases/functions/ 2>/dev/null
cp -r supabase/functions/transfer-funds backup/purchases/functions/ 2>/dev/null

# Backup shared utilities
echo "Backing up shared utilities..."
cp supabase/functions/_shared/wallet.ts backup/purchases/shared/ 2>/dev/null
cp supabase/functions/_shared/push-notifications.ts backup/purchases/shared/ 2>/dev/null
cp supabase/functions/_shared/vendor-calls.ts backup/purchases/shared/ 2>/dev/null

echo "Backup completed!"

# Vendor-Based Data Plan System - Complete Implementation

## ✅ All Tasks Completed

### 1. Database Schema ✅
**Migration File:** `supabase/migrations/20251202000000_create_vendors_system.sql`

- ✅ Created `vendors` table with vendor information
- ✅ Enhanced `data_plans` table with:
  - `plan_type` (SME, Gifting, VTU, etc.)
  - `size` (1GB, 2GB, etc.)
  - `vendor_price` (cost from vendor)
  - `user_price` (selling price to user)
  - `vtpass_code`, `smeplug_code`, `mobilenig_code` (vendor-specific codes)
  - `is_active` (enable/disable plan)
- ✅ Created `vendor_priority` table for fallback configuration
- ✅ All tables have proper RLS policies
- ✅ Migration includes data migration from old structure

### 2. Backend Implementation ✅

#### Shared Vendor Functions
**File:** `supabase/functions/_shared/vendor-calls.ts`
- ✅ `purchaseViaVTpass()` - Handles VTpass API calls
- ✅ `purchaseViaSMEPlug()` - Handles SMEPlug API calls
- ✅ `purchaseViaMobilenig()` - Handles Mobilenig API calls
- ✅ `purchaseViaVendor()` - Unified wrapper function

#### Unified Purchase Function
**File:** `supabase/functions/purchase-data/index.ts`
- ✅ Implements automatic fallback logic
- ✅ Tries vendors in priority order
- ✅ Handles pending/success/failed statuses
- ✅ Records transaction with vendor information
- ✅ Backward compatible with old structure

#### Webhook Handlers
- ✅ **mobilenig-webhook** - Updated to handle `data_transactions`
- ✅ **smeplug-webhook** - New webhook handler for SMEPlug
- ✅ **update-vtpass-transaction-status** - Enhanced to work with vendor system

### 3. Admin UI ✅

#### Vendor Management
**File:** `src/pages/Vendors.tsx`
- ✅ View all vendors
- ✅ Edit vendor credentials (API key, secret)
- ✅ Activate/deactivate vendors
- ✅ Secure credential handling

#### Vendor Priority Management
**File:** `src/pages/VendorPriority.tsx`
- ✅ View all vendor priorities by network/plan_type
- ✅ Create new priority configurations
- ✅ Edit priority order (drag/arrow interface)
- ✅ Delete priority configurations
- ✅ Visual priority display with arrows

#### Data Plans Management
**File:** `src/pages/DataPlans.tsx`
- ✅ Updated edit form with new vendor fields:
  - Plan Type
  - Size
  - Vendor Price
  - User Price
  - Vendor Codes (VTpass, SMEPlug, Mobilenig)
  - Active/Inactive status
- ✅ Backward compatible with old structure
- ✅ Supports legacy fields for smooth migration

### 4. Frontend Purchase Flow ✅

#### Web App
**File:** `src/pages/user/PurchaseData.tsx`
- ✅ Updated to use unified `/functions/v1/purchase-data` endpoint
- ✅ Removed vendor-specific logic
- ✅ Handles unified response format
- ✅ Shows vendor information in success messages
- ✅ Handles pending transactions properly

#### Mobile App
**File:** `mobile/app/data-purchase.tsx`
- ✅ Updated to use unified `/functions/v1/purchase-data` endpoint
- ✅ Removed vendor-specific logic
- ✅ Handles unified response format
- ✅ Shows vendor information in alerts
- ✅ Handles pending transactions properly

## How It Works

### Purchase Flow

1. **User selects a plan** from the frontend
2. **Frontend calls** `/functions/v1/purchase-data` with:
   - `phone_number`
   - `plan_id`
3. **Backend fetches:**
   - Data plan details
   - Vendor priority for network/plan_type
   - Active vendors from database
4. **Backend tries vendors in priority order:**
   - Checks if vendor is active
   - Checks if plan has code for that vendor
   - Attempts purchase via vendor API
   - If success → records transaction and returns
   - If fails → tries next vendor
5. **Transaction recorded** with:
   - Vendor used
   - Status (success/pending/failed)
   - Reference number
   - Pricing information

### Fallback Logic

Example Priority: `['vtpass', 'smeplug', 'mobilenig']`

1. Try VTpass first
   - If VTpass returns success → Complete transaction
   - If VTpass returns pending → Record as pending, complete
   - If VTpass fails → Try next vendor
2. Try SMEPlug second
   - Same logic as above
3. Try Mobilenig third
   - Same logic as above
4. If all vendors fail → Return error (user not debited)

### Webhook Flow

1. **Vendor sends webhook** when transaction status changes
2. **Webhook handler:**
   - Verifies signature (if configured)
   - Finds transaction by reference
   - Updates transaction status
   - Sends notification to user
   - Logs for refund processing if needed

## Setup Instructions

### 1. Run Migration
```bash
supabase migration up
```

### 2. Configure Vendors
1. Go to `/vendors` admin page
2. Edit each vendor with their credentials:
   - VTpass: Set API key and public key
   - SMEPlug: Set secret key
   - Mobilenig: Set API key and username
3. Ensure all vendors are set to "active"

### 3. Set Vendor Priorities
1. Go to `/vendor-priority` admin page
2. For each network/plan_type combination:
   - Create or edit priority
   - Set vendor order (e.g., `['vtpass', 'smeplug', 'mobilenig']`)
   - First vendor tried first, then falls back if needed

### 4. Update Data Plans
1. Go to `/data-plans` admin page
2. Edit each plan:
   - Set `plan_type` (SME, Gifting, VTU, etc.)
   - Set `size` (1GB, 2GB, etc.)
   - Set `vendor_price` (what vendor charges)
   - Set `user_price` (what user pays)
   - Set vendor codes:
     - `vtpass_code` - VTpass variation code
     - `smeplug_code` - SMEPlug plan ID
     - `mobilenig_code` - Mobilenig plan code
   - Mark as active/inactive

### 5. Configure Webhooks
1. **SMEPlug:** Set webhook URL to `/functions/v1/smeplug-webhook`
   - Configure `SMEPLUG_WEBHOOK_SECRET` environment variable
2. **Mobilenig:** Webhook already configured at `/functions/v1/mobilenig-webhook`
3. **VTpass:** Use manual requery via `/functions/v1/update-vtpass-transaction-status`
   - Or configure VTpass webhook if available

## Environment Variables Needed

```env
# VTpass
VTPASS_API_KEY=your_api_key
VTPASS_PUBLIC_KEY=your_public_key
VTPASS_SECRET_KEY=your_secret_key (optional)
VTPASS_MODE=live|sandbox

# SMEPlug
SMEPLUG_SECRET_KEY=your_secret_key
SMEPLUG_WEBHOOK_SECRET=your_webhook_secret (optional)

# Mobilenig
MOBILENIG_API_KEY=your_api_key
MOBILENIG_USERNAME=your_username
```

## Testing Checklist

- [ ] Run migration successfully
- [ ] Configure vendors in admin panel
- [ ] Set vendor priorities
- [ ] Update data plans with vendor codes
- [ ] Test purchase flow:
  - [ ] First vendor succeeds
  - [ ] First vendor fails, second succeeds (fallback)
  - [ ] All vendors fail (error handling)
- [ ] Test pending transactions:
  - [ ] Transaction marked as pending
  - [ ] Webhook updates status to success
  - [ ] User receives notification
- [ ] Test webhook handlers:
  - [ ] Mobilenig webhook updates transaction
  - [ ] SMEPlug webhook updates transaction
  - [ ] VTpass requery updates transaction

## Important Notes

1. **Backward Compatibility:** Old plans without vendor codes will still work, but won't benefit from fallback
2. **Pricing:** `vendor_price` is cost, `user_price` is selling price, admin revenue = `user_price - vendor_price`
3. **Priority Order:** First vendor in array is tried first
4. **Status Handling:** Pending transactions are recorded and user is debited, status updated via webhook
5. **Security:** Vendor credentials stored securely, webhook signatures verified when configured

## Support & Troubleshooting

### Transaction Not Found in Webhook
- Check that reference matches exactly
- Verify transaction was created with correct reference
- Check webhook payload structure

### Fallback Not Working
- Verify vendor priorities are set correctly
- Ensure vendors are marked as "active"
- Check that plans have codes for vendors in priority list
- Verify vendor credentials are correct

### Pending Transactions Not Updating
- Check webhook is receiving requests
- Verify webhook handler is working
- Check transaction reference matches
- Verify vendor is sending webhooks

## Next Steps (Optional Enhancements)

1. Add vendor balance monitoring
2. Add automatic retry logic for failed transactions
3. Add refund processing for failed transactions
4. Add analytics dashboard for vendor performance
5. Add A/B testing for vendor priority
6. Add vendor cost tracking and profit analysis


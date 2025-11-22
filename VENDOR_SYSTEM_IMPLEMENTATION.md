# Vendor-Based Data Plan System Implementation

## Overview
This document describes the new vendor-based data plan system with automatic fallback capabilities.

## What's Been Implemented

### 1. Database Schema ✅
- **vendors** table: Stores vendor information (VTpass, SMEPlug, Mobilenig)
- **data_plans** table: Enhanced with vendor codes (vtpass_code, smeplug_code, mobilenig_code), plan_type, size, vendor_price, user_price
- **vendor_priority** table: Defines fallback order for each network/plan_type combination

### 2. Backend Functions ✅
- **`_shared/vendor-calls.ts`**: Shared functions for calling vendor APIs
  - `purchaseViaVTpass()`: Handles VTpass API calls
  - `purchaseViaSMEPlug()`: Handles SMEPlug API calls
  - `purchaseViaMobilenig()`: Handles Mobilenig API calls
  - `purchaseViaVendor()`: Unified wrapper function

- **`purchase-data/index.ts`**: New unified purchase function
  - Implements fallback logic
  - Tries vendors in priority order
  - Records transaction with vendor information
  - Handles pending/success/failed statuses

### 3. Admin UI Updates ✅
- **DataPlans.tsx**: Updated to support new vendor fields
  - Edit form includes: plan_type, size, vendor_price, user_price, vendor codes
  - Backward compatible with old structure

- **Vendors.tsx**: New vendor management page
  - View all vendors
  - Edit vendor credentials and status
  - Secure credential storage

### 4. Migration ✅
- **20251202000000_create_vendors_system.sql**: Complete migration
  - Creates all tables
  - Migrates existing data
  - Sets up default priorities

## What Still Needs to Be Done

### 1. Vendor Priority Management UI ⏳
Create a page at `src/pages/VendorPriority.tsx` to:
- View vendor priorities by network/plan_type
- Edit priority order (drag and drop or reorder interface)
- Add new priority configurations

### 2. Frontend Purchase Flow Update ⏳
Update purchase flows to use the new unified endpoint:
- `src/pages/user/PurchaseData.tsx`: Update to call `/functions/v1/purchase-data`
- `mobile/app/data-purchase.tsx`: Update to call `/functions/v1/purchase-data`
- Remove old vendor-specific logic
- Handle the unified response format

### 3. Webhook Handlers ⏳
Create/update webhook handlers:
- **`smeplug-webhook/index.ts`**: Handle SMEPlug webhooks
  - Verify signature
  - Update transaction status
  - Handle delivered/failed statuses

- **`mobilenig-webhook/index.ts`**: Update existing handler
  - Already exists, may need enhancement

- **`vtpass-webhook/index.ts`**: Create if needed
  - Or enhance existing `update-vtpass-transaction-status`

### 4. Testing ⏳
- Test purchase flow with all vendors
- Test fallback logic
- Test pending transaction handling
- Test webhook status updates

### 5. Documentation ⏳
- API documentation for new endpoints
- Admin guide for managing vendors and priorities
- Migration guide for existing data

## Usage Examples

### Setting Up Vendors
1. Go to `/vendors` admin page
2. Edit each vendor with their credentials
3. Set status to "active" for vendors you want to use

### Setting Vendor Priorities
1. Go to `/vendor-priority` admin page (to be created)
2. For each network/plan_type, set priority order
3. Example: MTN/SME → ['vtpass', 'smeplug', 'mobilenig']

### Managing Data Plans
1. Go to `/data-plans` admin page
2. Edit a plan
3. Set vendor codes (vtpass_code, smeplug_code, mobilenig_code)
4. Set vendor_price (what vendor charges) and user_price (what user pays)
5. Set plan_type (SME, Gifting, VTU, etc.)

### Purchase Flow
1. User selects a plan
2. System calls `/functions/v1/purchase-data` with plan_id and phone_number
3. Backend tries vendors in priority order
4. First successful vendor completes the purchase
5. Transaction is recorded with vendor information
6. User is charged user_price
7. Admin revenue = user_price - vendor_price

## Important Notes

- The system is backward compatible with existing data
- Old `provider` field still exists but is deprecated
- Use `user_price` instead of `custom_price` for new plans
- Use `vendor_price` instead of `original_price` for clarity
- Always set vendor codes for vendors you want to use
- Priority order determines fallback sequence

## Migration Steps

1. Run the migration: `supabase migration up`
2. Verify tables were created
3. Update vendor credentials in admin panel
4. Migrate existing plans to include vendor codes
5. Set vendor priorities
6. Test purchase flow
7. Monitor transactions for any issues


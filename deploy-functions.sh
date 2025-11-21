#!/bin/bash

# Script to deploy Supabase Edge Functions with updated environment variables

echo "=== Supabase Edge Functions Deployment ==="
echo ""

# Check if SUPABASE_ACCESS_TOKEN is set
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN is not set."
    echo "Please set it first:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"your-token-here\""
    echo ""
    echo "Or run: ./setup-supabase-auth.sh YOUR_TOKEN"
    exit 1
fi

# Check if project is linked
echo "Checking project link..."
supabase status > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Project not linked. Linking now..."
    supabase link --project-ref rekkdwpkzkhgnejgzhac
    if [ $? -ne 0 ]; then
        echo "❌ Failed to link project. Please check your authentication."
        exit 1
    fi
fi

echo "✅ Project linked"
echo ""

# Set environment variables for Edge Functions
echo "Setting Edge Functions environment variables..."
echo ""

# Get the new Supabase URL and keys from .env
SUPABASE_URL="https://rekkdwpkzkhgnejgzhac.supabase.co"

echo "Setting SUPABASE_URL: $SUPABASE_URL"
supabase secrets set SUPABASE_URL="$SUPABASE_URL"

echo ""
echo "⚠️  IMPORTANT: You need to set the following secrets manually:"
echo "  1. SUPABASE_SERVICE_ROLE_KEY - Get from: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/settings/api"
echo "  2. SUPABASE_ANON_KEY - Get from: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/settings/api"
echo ""
echo "To set them, run:"
echo "  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=\"your-service-role-key\""
echo "  supabase secrets set SUPABASE_ANON_KEY=\"your-anon-key\""
echo ""

# List all functions
FUNCTIONS=(
    "credit-user"
    "debit-user"
    "fetch-admin-transactions"
    "fetch-cable-packages"
    "fetch-education-services"
    "fetch-electricity-packages"
    "fetch-mobilenig-balance"
    "fetch-mobilenig-wallet-history"
    "fetch-smeplug-airtime-providers"
    "fetch-smeplug-balance"
    "fetch-smeplug-data-plans"
    "fetch-smeplug-networks"
    "fetch-vtpass-data-plans"
    "get-virtual-account"
    "get-data-provider"
    "payvessel-webhook"
    "process-referral-earning"
    "purchase-cable-tv"
    "purchase-electricity"
    "purchase-smeplug-airtime"
    "purchase-smeplug-data"
    "purchase-vtpass-data"
    "suspend-user"
    "transfer-funds"
    "validate-cable-customer"
    "validate-meter-number"
    "withdraw-referral-earnings"
)

echo "Functions to deploy: ${#FUNCTIONS[@]}"
echo ""

read -p "Do you want to deploy all functions now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Deploying functions..."
    echo ""
    
    for func in "${FUNCTIONS[@]}"; do
        echo "Deploying $func..."
        supabase functions deploy "$func" --no-verify-jwt 2>&1 | grep -E "(Deployed|Error|error)" || echo "  ✓ $func"
    done
    
    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "To verify, run: supabase functions list"
else
    echo ""
    echo "To deploy individual functions, run:"
    echo "  supabase functions deploy <function-name>"
    echo ""
    echo "To deploy all functions:"
    for func in "${FUNCTIONS[@]}"; do
        echo "  supabase functions deploy $func"
    done
fi


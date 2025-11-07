#!/bin/bash

# Deploy all Supabase Edge Functions

set -e

echo "=== Deploying Supabase Edge Functions ==="
echo ""

# Check authentication
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN is not set."
    echo ""
    echo "Please set it first:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"your-token-here\""
    echo ""
    echo "Get your token from: https://supabase.com/dashboard/account/tokens"
    exit 1
fi

# Link project if not already linked
echo "Checking project link..."
if ! supabase status > /dev/null 2>&1; then
    echo "Linking project..."
    supabase link --project-ref rekkdwpkzkhgnejgzhac
    if [ $? -ne 0 ]; then
        echo "❌ Failed to link project"
        exit 1
    fi
fi
echo "✅ Project linked"
echo ""

# Set environment variables
echo "Setting Edge Functions secrets..."
SUPABASE_URL="https://rekkdwpkzkhgnejgzhac.supabase.co"
supabase secrets set SUPABASE_URL="$SUPABASE_URL" 2>&1 | grep -v "Warning" || true
echo "✅ SUPABASE_URL set"
echo ""

echo "⚠️  IMPORTANT: You need to set these secrets manually:"
echo "  1. SUPABASE_SERVICE_ROLE_KEY"
echo "  2. SUPABASE_ANON_KEY"
echo ""
echo "Get them from: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/settings/api"
echo ""
read -p "Do you have the keys ready? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please get the keys and run this script again."
    exit 0
fi

# Deploy all functions
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
    "get-virtual-account"
    "payvessel-webhook"
    "process-referral-earning"
    "purchase-cable-tv"
    "purchase-electricity"
    "purchase-smeplug-airtime"
    "purchase-smeplug-data"
    "suspend-user"
    "transfer-funds"
    "validate-cable-customer"
    "validate-meter-number"
    "withdraw-referral-earnings"
)

echo ""
echo "Deploying ${#FUNCTIONS[@]} functions..."
echo ""

SUCCESS=0
FAILED=0

for func in "${FUNCTIONS[@]}"; do
    echo -n "Deploying $func... "
    if supabase functions deploy "$func" --no-verify-jwt > /tmp/deploy_${func}.log 2>&1; then
        echo "✅"
        ((SUCCESS++))
    else
        echo "❌ (check /tmp/deploy_${func}.log)"
        ((FAILED++))
    fi
done

echo ""
echo "=== Deployment Summary ==="
echo "✅ Success: $SUCCESS"
echo "❌ Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 All functions deployed successfully!"
else
    echo "⚠️  Some functions failed to deploy. Check the logs above."
fi


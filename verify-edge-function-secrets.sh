#!/bin/bash

# Script to verify and set Edge Function secrets for PayVessel

set -e

echo "=== Verifying Edge Function Secrets ==="
echo ""

# Check if SUPABASE_ACCESS_TOKEN is set
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ SUPABASE_ACCESS_TOKEN is not set."
    echo ""
    echo "Please set it first:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"your-token-here\""
    echo ""
    echo "Get your token from: https://supabase.com/dashboard/account/tokens"
    exit 1
fi

PROJECT_REF="rekkdwpkzkhgnejgzhac"

# Link project if not already linked
echo "Checking project link..."
if ! supabase status > /dev/null 2>&1; then
    echo "Linking project..."
    supabase link --project-ref "$PROJECT_REF"
    if [ $? -ne 0 ]; then
        echo "❌ Failed to link project"
        exit 1
    fi
fi
echo "✅ Project linked"
echo ""

# Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically available
# in Supabase Edge Functions, but we can verify PayVessel secrets are set

echo "Checking PayVessel secrets..."
echo ""

# List all secrets (this will show if they're set)
echo "Current Edge Function secrets:"
supabase secrets list 2>&1 | grep -E "(PAYVESSEL|SUPABASE)" || echo "No PayVessel secrets found"
echo ""

# PayVessel secrets that should be set
PAYVESSEL_SECRETS=(
    "PAYVESSEL_API_KEY"
    "PAYVESSEL_SECRET_KEY"
    "PAYVESSEL_BUSINESS_ID"
)

echo "Required PayVessel secrets:"
for secret in "${PAYVESSEL_SECRETS[@]}"; do
    echo "  - $secret"
done
echo ""

echo "Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically"
echo "injected by Supabase and should be available in Edge Functions."
echo ""

echo "If PayVessel secrets are missing, set them with:"
echo "  supabase secrets set PAYVESSEL_API_KEY=\"your-key\""
echo "  supabase secrets set PAYVESSEL_SECRET_KEY=\"your-secret\""
echo "  supabase secrets set PAYVESSEL_BUSINESS_ID=\"your-business-id\""
echo ""


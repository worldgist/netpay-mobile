#!/bin/bash

# Script to set PayVessel secrets for Edge Functions

set -e

echo "=== Setting PayVessel Secrets ==="
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

# Set PayVessel secrets
echo "Setting PayVessel secrets..."
echo ""

supabase secrets set PAYVESSEL_API_KEY="PVKEY-7XH6AWXB4NCPEWFNG701D1EKV3OB7OP9" 2>&1 | grep -v "Warning" || true
echo "✅ PAYVESSEL_API_KEY set"

supabase secrets set PAYVESSEL_SECRET_KEY="PVSECRET-0PHG8T5NEQOO8ILAUONKDFHSWG6P9MKRP1PHX7QZ36U9N3CA83KRDXPRBYZQF66Y" 2>&1 | grep -v "Warning" || true
echo "✅ PAYVESSEL_SECRET_KEY set"

supabase secrets set PAYVESSEL_BUSINESS_ID="5EE89DA992424C6DA0234577E7E4ECAA" 2>&1 | grep -v "Warning" || true
echo "✅ PAYVESSEL_BUSINESS_ID set"

echo ""
echo "🎉 All PayVessel secrets have been set!"
echo ""
echo "Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically"
echo "injected by Supabase and should be available in Edge Functions."
echo ""


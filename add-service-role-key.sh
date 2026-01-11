#!/bin/bash

# Quick script to add SUPABASE_SERVICE_ROLE_KEY to .env file

echo "🔑 Adding SUPABASE_SERVICE_ROLE_KEY to .env"
echo "============================================"
echo ""

# Check if key already exists in .env
if [ -f .env ] && grep -q "SUPABASE_SERVICE_ROLE_KEY" .env; then
    echo "⚠️  SUPABASE_SERVICE_ROLE_KEY already exists in .env"
    read -p "Do you want to update it? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing key."
        exit 0
    fi
    # Remove old key
    sed -i.bak '/^SUPABASE_SERVICE_ROLE_KEY=/d' .env
fi

echo "To get your service role key:"
echo "1. Go to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/settings/api"
echo "2. Scroll down to 'Project API keys'"
echo "3. Copy the 'service_role' key (the secret one, not the anon key)"
echo ""

read -sp "Paste your SUPABASE_SERVICE_ROLE_KEY here: " SERVICE_KEY
echo ""

if [ -z "$SERVICE_KEY" ]; then
    echo "❌ No key provided. Exiting."
    exit 1
fi

# Add to .env file
if [ ! -f .env ]; then
    touch .env
fi

echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY" >> .env

echo ""
echo "✅ Service role key added to .env file!"
echo ""
echo "You can now run:"
echo "  source .env && node check-first-credit.js"
echo ""
echo "Or use the setup script:"
echo "  ./setup-check-first-credit.sh"











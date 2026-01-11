#!/bin/bash

# Setup script for checking first credit transaction
# This script helps you set up the SUPABASE_SERVICE_ROLE_KEY

echo "🔧 Setting up First Credit Check Script"
echo "========================================"
echo ""

# Check if service role key is already set
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "✅ SUPABASE_SERVICE_ROLE_KEY is already set in environment"
    echo ""
    echo "Running check script..."
    node check-first-credit.js
    exit $?
fi

# Check if .env file exists
if [ -f ".env" ]; then
    echo "📄 Found .env file, checking for SUPABASE_SERVICE_ROLE_KEY..."
    source .env
    if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        echo "✅ Found SUPABASE_SERVICE_ROLE_KEY in .env file"
        echo ""
        echo "Running check script..."
        export SUPABASE_SERVICE_ROLE_KEY
        node check-first-credit.js
        exit $?
    fi
fi

# If not found, prompt user
echo "❌ SUPABASE_SERVICE_ROLE_KEY not found"
echo ""
echo "To get your service role key:"
echo "1. Go to https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac"
echo "2. Navigate to Settings > API"
echo "3. Copy the 'service_role' key (⚠️  Keep it secret!)"
echo ""
echo "Then either:"
echo "  Option A: Set it temporarily for this session:"
echo "    export SUPABASE_SERVICE_ROLE_KEY='your-key-here'"
echo "    node check-first-credit.js"
echo ""
echo "  Option B: Add it to a .env file:"
echo "    echo 'SUPABASE_SERVICE_ROLE_KEY=your-key-here' >> .env"
echo "    source .env"
echo "    node check-first-credit.js"
echo ""
echo "  Option C: Run this script again after setting the key"
echo ""

read -p "Do you want to enter the key now? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -sp "Enter SUPABASE_SERVICE_ROLE_KEY: " SERVICE_KEY
    echo ""
    if [ -n "$SERVICE_KEY" ]; then
        export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY"
        echo "✅ Key set! Running check script..."
        echo ""
        node check-first-credit.js
    else
        echo "❌ No key provided"
        exit 1
    fi
else
    echo "Please set the key and try again."
    exit 1
fi











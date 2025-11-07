#!/bin/bash

# Supabase Authentication Setup Script
# This script helps you authenticate with Supabase using a token

echo "=== Supabase Authentication Setup ==="
echo ""
echo "To authenticate with Supabase, you need an access token."
echo ""
echo "Steps:"
echo "1. Go to: https://supabase.com/dashboard/account/tokens"
echo "2. Click 'Generate new token'"
echo "3. Copy the token"
echo "4. Run this script with your token:"
echo "   ./setup-supabase-auth.sh YOUR_TOKEN_HERE"
echo ""

if [ -z "$1" ]; then
    echo "No token provided. Please provide your access token as an argument."
    echo "Example: ./setup-supabase-auth.sh sbp_xxxxxxxxxxxxx"
    exit 1
fi

TOKEN=$1

# Set the access token as environment variable
export SUPABASE_ACCESS_TOKEN="$TOKEN"

echo "Token set. Testing authentication..."
echo ""

# Try to list projects to verify authentication
supabase projects list

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Authentication successful!"
    echo ""
    echo "Now you can link your project:"
    echo "  supabase link --project-ref rekkdwpkzkhgnejgzhac"
    echo ""
    echo "To persist the token, add this to your ~/.bashrc or ~/.zshrc:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"$TOKEN\""
else
    echo ""
    echo "❌ Authentication failed. Please check your token."
    exit 1
fi


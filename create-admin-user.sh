#!/bin/bash

# Script to create admin user in Supabase
# This script creates a user via Supabase Auth API and grants admin role

set -e

EMAIL="oluwapainz@gmail.com"
PASSWORD="Salifu147@"
FULL_NAME="Admin User"

echo "=== Creating Admin User ==="
echo "Email: $EMAIL"
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
SUPABASE_URL="https://rekkdwpkzkhgnejgzhac.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjQzMTQ1MiwiZXhwIjoyMDc4MDA3NDUyfQ.tV2XsL_Rl1o-r7OUvFbObehGmQqhsz9NeSm2vIVub7o"

echo "Creating user via Supabase Auth API..."

# Create user using Supabase Management API
RESPONSE=$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/auth/users" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"email_confirm\": true,
    \"user_metadata\": {
      \"full_name\": \"$FULL_NAME\"
    }
  }")

echo "Response: $RESPONSE"

# Check if user was created or already exists
if echo "$RESPONSE" | grep -q "already registered\|already exists"; then
    echo "✅ User already exists. Granting admin role..."
else
    echo "✅ User created successfully!"
fi

# Grant admin role via database function
echo ""
echo "Granting admin role..."
supabase db execute "
SELECT public.grant_admin_role_by_email('$EMAIL');
" --project-ref "$PROJECT_REF"

echo ""
echo "🎉 Admin user setup complete!"
echo ""
echo "Login credentials:"
echo "  Email: $EMAIL"
echo "  Password: $PASSWORD"
echo ""


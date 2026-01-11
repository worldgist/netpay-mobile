#!/bin/bash

# Script to create and setup demo user
# This script invokes the create-and-setup-demo-user edge function

echo "Setting up demo user..."
echo ""

# Get Supabase project URL and anon key from environment or config
SUPABASE_URL="${SUPABASE_URL:-https://rekkdwpkzkhgnejgzhac.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"

if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Error: SUPABASE_ANON_KEY not set"
  echo "Please set it in your environment or update this script"
  exit 1
fi

# Invoke the function
echo "Calling create-and-setup-demo-user function..."
RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/create-and-setup-demo-user" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json")

echo ""
echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Demo user setup completed successfully!"
  echo ""
  echo "Demo user credentials:"
  echo "$RESPONSE" | jq -r '.credentials | "Email: \(.email)\nPassword: \(.password)\nPIN: \(.pin)"' 2>/dev/null || echo "Check response above for credentials"
else
  echo "❌ Demo user setup failed. Check the error message above."
  exit 1
fi






















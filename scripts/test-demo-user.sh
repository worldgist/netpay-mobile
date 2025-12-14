#!/bin/bash

# Test script for demo user functionality
# This script tests the demo user setup and various features

set -e

SUPABASE_URL="${SUPABASE_URL:-https://rekkdwpkzkhgnejgzhac.supabase.co}"
DEMO_EMAIL="demo@netpayy.ng"
DEMO_PASSWORD="Demo@1234"

echo "🧪 Testing Demo User Functionality"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq is not installed. JSON output will not be formatted.${NC}"
    JQ_CMD="cat"
else
    JQ_CMD="jq"
fi

echo "Step 1: Creating/Setting up demo user..."
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/create-and-setup-demo-user" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY:-}" \
  -H "Content-Type: application/json")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Demo user setup successful!${NC}"
    echo "$RESPONSE" | $JQ_CMD '.'
    DEMO_USER_ID=$(echo "$RESPONSE" | $JQ_CMD -r '.demo_user_id // empty')
else
    echo -e "${RED}❌ Demo user setup failed!${NC}"
    echo "$RESPONSE" | $JQ_CMD '.' || echo "$RESPONSE"
    exit 1
fi

echo ""
echo "Step 2: Testing demo user login..."
echo "-----------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY:-}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | $JQ_CMD -r '.access_token // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
    echo -e "${RED}❌ Login failed!${NC}"
    echo "$LOGIN_RESPONSE" | $JQ_CMD '.' || echo "$LOGIN_RESPONSE"
    exit 1
else
    echo -e "${GREEN}✅ Login successful!${NC}"
    echo "Access token obtained (truncated): ${ACCESS_TOKEN:0:20}..."
fi

echo ""
echo "Step 3: Checking demo user profile and balance..."
echo "--------------------------------------------------"
PROFILE_RESPONSE=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/profiles?email=eq.${DEMO_EMAIL}&select=*" \
  -H "apikey: ${SUPABASE_ANON_KEY:-}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json")

BALANCE=$(echo "$PROFILE_RESPONSE" | $JQ_CMD -r '.[0].balance // 0')
FULL_NAME=$(echo "$PROFILE_RESPONSE" | $JQ_CMD -r '.[0].full_name // "N/A"')

echo "Profile Details:"
echo "  Name: $FULL_NAME"
echo "  Email: $DEMO_EMAIL"
echo "  Balance: ₦$(printf "%.2f" $BALANCE | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"

if (( $(echo "$BALANCE >= 10000" | bc -l 2>/dev/null || echo "0") )); then
    echo -e "${GREEN}✅ Balance is sufficient (₦${BALANCE})${NC}"
else
    echo -e "${YELLOW}⚠️  Balance might be low (₦${BALANCE})${NC}"
fi

echo ""
echo "Step 4: Checking demo transactions..."
echo "--------------------------------------"
TRANSACTIONS=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/user_transactions?user_id=eq.${DEMO_USER_ID}&select=*&order=created_at.desc&limit=5" \
  -H "apikey: ${SUPABASE_ANON_KEY:-}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json")

TRANSACTION_COUNT=$(echo "$TRANSACTIONS" | $JQ_CMD '. | length')

if [ "$TRANSACTION_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Found ${TRANSACTION_COUNT} transactions${NC}"
    echo ""
    echo "Recent transactions:"
    echo "$TRANSACTIONS" | $JQ_CMD -r '.[] | "  - \(.description // "N/A") | \(.transaction_type) | ₦\(.amount)"'
else
    echo -e "${YELLOW}⚠️  No transactions found${NC}"
fi

echo ""
echo "Step 5: Testing demo auto-credit function..."
echo "---------------------------------------------"
AUTO_CREDIT_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/functions/v1/demo-auto-credit" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json")

if echo "$AUTO_CREDIT_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Auto-credit function works!${NC}"
    NEW_BALANCE=$(echo "$AUTO_CREDIT_RESPONSE" | $JQ_CMD -r '.newBalance // 0')
    echo "  New balance: ₦$(printf "%.2f" $NEW_BALANCE | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"
else
    echo -e "${YELLOW}⚠️  Auto-credit function returned:${NC}"
    echo "$AUTO_CREDIT_RESPONSE" | $JQ_CMD '.' || echo "$AUTO_CREDIT_RESPONSE"
fi

echo ""
echo "===================================="
echo -e "${GREEN}✅ Demo user testing completed!${NC}"
echo ""
echo "Demo User Credentials:"
echo "  Email: $DEMO_EMAIL"
echo "  Password: $DEMO_PASSWORD"
echo ""
echo "You can now test the demo user in the mobile app!"




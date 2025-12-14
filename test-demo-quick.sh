#!/bin/bash
# Quick test to verify demo user exists and has balance

echo "🧪 Quick Demo User Test"
echo "======================"
echo ""

# Check if we can access Supabase
SUPABASE_URL="https://rekkdwpkzkhgnejgzhac.supabase.co"
DEMO_EMAIL="demo@netpayy.ng"

echo "Testing demo user setup..."
echo ""

# Try to get profile (this will work if RLS allows)
echo "1. Checking if demo user profile exists..."
PROFILE_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/profiles?email=eq.${DEMO_EMAIL}&select=email,full_name,balance" \
  -H "apikey: ${SUPABASE_ANON_KEY:-}" \
  -H "Content-Type: application/json" 2>/dev/null)

if echo "$PROFILE_CHECK" | grep -q "$DEMO_EMAIL"; then
  echo "✅ Demo user profile exists"
  BALANCE=$(echo "$PROFILE_CHECK" | grep -o '"balance":[0-9.]*' | cut -d: -f2)
  if [ ! -z "$BALANCE" ]; then
    echo "   Balance: ₦$(printf "%.2f" $BALANCE | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta')"
    if (( $(echo "$BALANCE >= 10000" | bc -l 2>/dev/null || echo "0") )); then
      echo "   ✅ Balance is sufficient"
    else
      echo "   ⚠️  Balance might be low - run setup function"
    fi
  fi
else
  echo "❌ Demo user profile not found"
  echo "   Run: create-and-setup-demo-user function"
fi

echo ""
echo "2. Testing login..."
LOGIN_TEST=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY:-}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"Demo@1234\"}" 2>/dev/null)

if echo "$LOGIN_TEST" | grep -q "access_token"; then
  echo "✅ Login works!"
else
  echo "❌ Login failed - check credentials"
fi

echo ""
echo "======================"
echo "Demo Credentials:"
echo "  Email: $DEMO_EMAIL"
echo "  Password: Demo@1234"
echo ""

#!/bin/bash
TOKEN=$(curl -s -X POST "https://rekkdwpkzkhgnejgzhac.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzE0NTIsImV4cCI6MjA3ODAwNzQ1Mn0.8Lo84bFhMQ2O18UPjyj2gHpzNTDFUmpMo0y96fRscsA" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@netpayy.ng","password":"Demo@1234"}' | jq -r '.access_token')

USER_ID="e496bwpkzkhgnejgzhac.supabase.co/rest/v1/user_transactions?user_id=eq.e496b381-2eae-492f-a237-f78f182693f9&select=*&limit=10" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzE0NTIsImV4cCI6MjA3ODAwNzQ1Mn0.8Lo84bFhMQ2O18UPjyj2gHpzNTDFUmpMo0y96fRscsA" \
  -H "Authorization: Bearer $TOKEN" | jq 'length'

echo "Airtime:"
curl -s "https://rekkdwpkzkhgnejgzhac.supabase.co/rest/v1/airtime_transactions?user_id=eq.e496b381-2eae-492f-a237-f78f182693f9&select=*&limit=10" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzE0NTIsImV4cCI6MjA3ODAwNzQ1Mn0.8Lo84bFhMQ2O18UPjyj2gHpzNTDFUmpMo0y96fRscsA" \
  -H "Authorization: Bearer $TOKEN" | jq 'length'

echo "Data:"
curl -s "https://rekkdwpkzkhgnejgzhac.supabase.co/rest/v1/data_transactions?user_id=eq.e496b381-2eae-492f-a237-f78f182693f9&select=*&limit=10" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla2tkd3BremtoZ25lamd6aGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzE0NTIsImV4cCI6MjA3ODAwNzQ1Mn0.8Lo84bFhMQ2O18UPjyj2gHpzNTDFUmpMo0y96fRscsA" \
  -H "Authorization: Bearer $TOKEN" | jq 'length'

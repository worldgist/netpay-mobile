#!/bin/bash
# Deploy purchase-data function to Supabase

echo "Deploying purchase-data function..."
supabase functions deploy purchase-data --project-ref rekkdwpkzkhgnejgzhac

if [ $? -eq 0 ]; then
  echo "✅ Function deployed successfully!"
else
  echo "❌ Deployment failed. Try deploying via Supabase Dashboard:"
  echo "   https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/functions"
fi

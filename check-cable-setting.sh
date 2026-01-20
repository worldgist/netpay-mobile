#!/bin/bash

echo "Checking cable provider setting..."
npx supabase db execute "SELECT setting_key, setting_value FROM app_settings WHERE setting_key = 'cable_provider';" --output json

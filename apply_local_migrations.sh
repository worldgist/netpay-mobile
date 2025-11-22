#!/bin/bash
# Script to apply education vendor migrations to local Supabase

echo "Checking if local Supabase is running..."

# Check if local database is running, if not start it
if ! supabase status 2>/dev/null | grep -q "API URL"; then
    echo "Starting local Supabase..."
    supabase start
fi

echo "Applying education vendor migrations to local Supabase..."

# Apply migrations using migration up (applies all pending migrations)
supabase migration up

echo "Migrations applied successfully!"


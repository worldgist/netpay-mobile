# Email Verification Setup Guide

## Issue
Signup is not sending verification tokens/emails.

## Solution: Configure Supabase Email Settings

### Step 1: Enable Email Confirmation
1. Go to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/auth/providers
2. Under "Email" provider, ensure it's enabled
3. Go to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/auth/url-configuration
4. Set "Site URL" to: `http://localhost:8080` (for development)
5. Add redirect URLs:
   - `http://localhost:8080/**`
   - `http://192.168.42.76:8080/**` (your network URL)

### Step 2: Configure Email Templates
1. Go to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/auth/templates
2. Check "Confirm signup" template
3. Ensure it includes the OTP code: `{{ .Token }}`
4. Or use the confirmation link: `{{ .ConfirmationURL }}`

### Step 3: Enable Email Confirmation
1. Go to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/auth/settings
2. Under "User Management" → "Email Auth"
3. Enable "Enable email confirmations"
4. Choose one:
   - **OTP Codes**: For 6-digit codes (current implementation)
   - **Email Links**: For clickable links in emails

### Step 4: Configure SMTP (Optional but Recommended)
1. Go to: https://supabase.com/dashboard/project/rekkdwpkzkhgnejgzhac/settings/auth
2. Under "SMTP Settings"
3. Configure your SMTP provider OR use Supabase's default email service

## For Development/Testing
If you want to disable email confirmation temporarily:
1. Go to Auth Settings
2. Disable "Enable email confirmations"
3. Users will be automatically confirmed on signup

## Current Implementation
The app expects **6-digit OTP codes**. Make sure your Supabase project is configured to send OTP codes, not email links.


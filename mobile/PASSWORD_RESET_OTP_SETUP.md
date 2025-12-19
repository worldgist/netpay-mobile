# Password Reset OTP Setup Guide

## Issue: "Verification Failed - Token has expired or invalid"

If you're getting this error when entering the correct OTP code, check the following:

### 1. Supabase Email Template Configuration

The `resetPasswordForEmail` method by default sends a **password reset link**, not an OTP code. To send OTP codes:

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Find the **Reset Password** template
4. Ensure the template includes the OTP code variable: `{{ .Token }}` or `{{ .OTP }}`
5. The template should display the code clearly (e.g., "Your reset code is: 12345678")

### 2. Verify OTP Code Format

- OTP codes are typically **6 or 8 digits**
- They expire quickly (usually within 5-15 minutes)
- Make sure you're entering the code from the most recent email

### 3. Check Supabase Auth Settings

In Supabase Dashboard → **Authentication** → **Settings**:
- Ensure **Enable email confirmations** is enabled
- Check **Email OTP expiry** (should be reasonable, e.g., 3600 seconds)
- Verify **Site URL** is set correctly

### 4. Alternative: Use Magic Link Instead

If OTP codes aren't working, you can use the magic link approach:
- User clicks the link in email
- App handles deep link with tokens
- No manual code entry needed

### 5. Debug Steps

1. Check the console logs when verifying:
   - Look for "Verifying OTP with recovery type"
   - Check for any error messages

2. Verify the email received:
   - Check if the email contains an 8-digit code
   - Or if it contains a link instead

3. Try resending:
   - Request a new code
   - Make sure to use the latest code

### 6. Code Verification Types

The app tries two verification types:
- `recovery` - Standard password reset OTP
- `email` - Alternative type (some Supabase configs use this)

If both fail, the issue is likely:
- Code expired
- Wrong code format
- Email template not configured for OTP codes

### 7. Manual Testing

To test if OTP codes are being sent:
1. Request password reset
2. Check email - does it contain a code or a link?
3. If link: Email template needs to be updated
4. If code: Verify the code format matches what you're entering


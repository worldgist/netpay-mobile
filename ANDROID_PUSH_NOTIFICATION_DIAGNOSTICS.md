# Android Push Notification Registration Diagnostics

## Current Status
- ✅ **5 iOS devices** registered and active
- ❌ **0 Android devices** registered

## Potential Issues & Solutions

### 1. **Expo Go Limitation** ⚠️
**Issue**: Android push notifications are NOT available in Expo Go.

**Check**: 
- Are Android users testing in Expo Go?
- If yes, they need to use a development build or production build

**Code Location**: `mobile/utils/push-notifications.ts` lines 20-24
```typescript
if (isAndroidExpoGo) {
  console.warn('Android push notifications are not available in Expo Go...');
  return null;
}
```

**Solution**: Ensure Android users are using:
- Development build (`eas build --profile development --platform android`)
- Production build (from App Store/Play Store)

---

### 2. **Permission Not Granted** 🔐
**Issue**: Android 13+ requires explicit notification permissions.

**Check**: 
- Are Android users granting notification permissions when prompted?
- Check device settings: Settings → Apps → NetPay → Notifications

**Code Location**: `mobile/utils/push-notifications.ts` lines 128-155

**Solution**: 
- Users must grant permissions when the app requests them
- If denied, they need to enable in device settings

---

### 3. **Registration Not Being Called** 📱
**Issue**: The registration function might not be called on Android devices.

**Check**: 
- Check app logs for "Attempting to register push token" messages
- Verify registration is called in:
  - `_layout.tsx` (on app start)
  - `(tabs)/index.tsx` (on home screen)
  - `auth/login.tsx` (after login)

**Code Locations**:
- `mobile/app/_layout.tsx` lines 58-96
- `mobile/app/(tabs)/index.tsx` lines 148-165
- `mobile/app/auth/login.tsx` lines 121-131

**Solution**: 
- Check console logs on Android devices
- Ensure user is authenticated before registration

---

### 4. **Platform Value Not Being Sent** 🔧
**Issue**: Platform might not be sent correctly to the backend.

**Check**: 
- Check edge function logs in Supabase dashboard
- Look for "Registering push token" logs with platform value

**Code Location**: 
- `mobile/utils/push-notifications.ts` line 172: `const platform = Platform.OS;`
- `supabase/functions/register-push-token/index.ts` line 68

**Solution**: 
- Platform should be sent as `"android"` (lowercase)
- Check edge function logs to verify

---

### 5. **Physical Device Requirement** 📲
**Issue**: Push notifications require a physical device (not simulator/emulator).

**Check**: 
- Are Android users testing on physical devices?
- Simulators/emulators cannot receive push notifications

**Code Location**: `mobile/utils/push-notifications.ts` line 124
```typescript
if (!isPhysicalDevice()) {
  return { registered: false, reason: 'Push notifications require a physical device.' };
}
```

**Solution**: Test on real Android devices only

---

## Diagnostic Steps

### Step 1: Check App Logs
On an Android device, check the console for:
```
Attempting to register push token: { platform: 'android', ... }
Push token registered successfully for platform: android
```

If you see errors, note the error message.

### Step 2: Check Edge Function Logs
1. Go to Supabase Dashboard → Edge Functions → `register-push-token`
2. Check logs for:
   - "Registering push token" messages
   - Any errors during registration
   - Platform value being received

### Step 3: Verify Permissions
1. On Android device: Settings → Apps → NetPay → Notifications
2. Ensure notifications are enabled
3. Try re-registering by restarting the app

### Step 4: Test Registration Manually
Add this to a test screen or use the debug utility:

```typescript
import { debugPushNotifications } from '@/utils/push-notifications-debug';

// Call this to get detailed debug info
const debugInfo = await debugPushNotifications();
console.log(debugInfo);
```

### Step 5: Check Database
Run this SQL query to see all registration attempts:

```sql
SELECT 
  platform,
  is_active,
  created_at,
  LEFT(expo_push_token, 30) as token_preview
FROM user_push_tokens
WHERE platform = 'android' OR platform IS NULL
ORDER BY created_at DESC;
```

---

## Recent Improvements Made

1. ✅ **Improved Logging**: Added console logs to track registration attempts
2. ✅ **Fixed Platform Storage**: Ensured platform is stored correctly (not converted to empty string)
3. ✅ **Added Debug Utility**: Created `push-notifications-debug.ts` for diagnostics
4. ✅ **Better Error Messages**: More descriptive error messages for Android

---

## Next Steps

1. **Deploy the updated code** to get better logging
2. **Test on an Android device** and check logs
3. **Check Supabase edge function logs** for registration attempts
4. **Verify Android users are using production/development builds** (not Expo Go)
5. **Ensure permissions are granted** on Android devices

---

## Quick Test Checklist

- [ ] Android device is physical (not emulator)
- [ ] Using production/development build (not Expo Go)
- [ ] User is authenticated
- [ ] Notification permissions granted
- [ ] App logs show registration attempt
- [ ] Edge function logs show registration
- [ ] Database query shows Android token (if registered)

---

## Contact Points

If issues persist after checking all above:
1. Check Supabase edge function logs for errors
2. Check Android device logs for permission/registration errors
3. Verify Expo project configuration for Android
4. Check if Firebase/Google Cloud Messaging is properly configured for Android



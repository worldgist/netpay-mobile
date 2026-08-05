# NetPay deep links (`https://netppay.com`)

## Site URL

Production website: **https://netppay.com**

Set in environment:

- Web: `VITE_SITE_URL=https://netppay.com`
- Mobile: `EXPO_PUBLIC_SITE_URL=https://netppay.com`
- Supabase Edge Functions: `NETPAY_SITE_URL` or `SITE_URL`

## Supabase Auth redirect URLs

In [Supabase Dashboard → Authentication → URL Configuration](https://supabase.com/dashboard):

| Setting | Value |
|---------|--------|
| **Site URL** | `https://netppay.com` |
| **Redirect URLs** (add each) | `https://netppay.com/**` |
| | `https://www.netppay.com/**` |
| | `netpay://**` |

## App link paths

| URL | Opens in app |
|-----|----------------|
| `https://netppay.com/reset-password` | Password reset |
| `https://netppay.com/pay?screen=airtime` | Airtime purchase |
| `https://netppay.com/open/signup?ref=CODE` | Sign up with referral |
| `https://netppay.com/open/verify-email?email=` | Email verification |
| `netpay://reset-password` | Password reset (custom scheme) |

## Universal links setup (required once per store build)

### iOS

1. Replace `TEAM_ID` in `public/.well-known/apple-app-site-association` with your Apple Team ID (e.g. `AB12CD34EF`).
2. Host the file at `https://netppay.com/.well-known/apple-app-site-association` (no file extension, `application/json`).
3. Rebuild the iOS app after updating `associatedDomains` in `app.config.js`.

### Android

1. Add your release keystore SHA-256 fingerprint to `public/.well-known/assetlinks.json`.
   - EAS: `eas credentials -p android`
   - Or: `keytool -list -v -keystore your.keystore`
2. Host at `https://netppay.com/.well-known/assetlinks.json`.
3. Rebuild the Android app (App Links verification runs on install).

## Custom scheme

`netpay://` is registered for fallback when universal links are not verified.

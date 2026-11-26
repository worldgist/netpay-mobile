# Expo Server Connection Troubleshooting

## Common Issues and Solutions

### 1. Clear Cache and Restart
```bash
cd mobile
rm -rf .expo node_modules/.cache
npx expo start --clear
```

### 2. Check Port Availability
```bash
# Kill any process on port 8081
lsof -ti:8081 | xargs kill -9

# Or use a different port
npx expo start --port 8082
```

### 3. Check Network Connection
- Ensure your device/emulator is on the same network as your computer
- For physical devices, use `npx expo start --tunnel` (requires Expo account)
- Check firewall settings

### 4. Environment Variables
Ensure `.env` file exists in the `mobile` directory with:
```
EXPO_PUBLIC_SUPABASE_URL=your_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key
```

### 5. Restart Metro Bundler
```bash
# Stop the server (Ctrl+C) then:
npx expo start --reset-cache
```

### 6. Check Expo CLI Version
```bash
npx expo --version
# Should be compatible with your Expo SDK version
```

### 7. Network Mode Options
```bash
# LAN (same network)
npx expo start --lan

# Tunnel (works across networks, requires Expo account)
npx expo start --tunnel

# Localhost only
npx expo start --localhost
```

### 8. Check for Node Modules Issues
```bash
rm -rf node_modules
npm install
# or
npm install --legacy-peer-deps
```

### 9. Check Device Connection
- **iOS Simulator**: Should connect automatically
- **Android Emulator**: Ensure emulator is running
- **Physical Device**: 
  - Scan QR code with Expo Go app
  - Or use `npx expo start --tunnel`

### 10. Check Logs
Look for error messages in the terminal where Expo is running. Common errors:
- "Unable to resolve module"
- "Network request failed"
- "Port already in use"

## Quick Fix Commands

```bash
# Full reset
cd mobile
rm -rf .expo node_modules/.cache node_modules
npm install
npx expo start --clear

# If still not working, try:
npx expo start --tunnel --clear
```

## Verify Environment Variables Are Loaded

The app should log Supabase configuration status. Check the console for:
- "Supabase is properly configured" ✅
- "Supabase is not configured" ❌

If not configured, ensure `.env` file is in the `mobile` directory and restart the server.














# NetPay Platform

A monorepo that powers the NetPay ecosystem:

- **Web Super Admin** – Vite + React dashboard located at the repository root.
- **Mobile App** – Expo Router application inside [`mobile/`].
- **Supabase** – Edge functions, migrations, and configuration inside [`supabase/`].

---

## Repository Structure

```
netpay-super-admin/
├── src/                    # Web admin source code
├── mobile/                 # Expo mobile app
├── supabase/               # Supabase config, functions & migrations
├── public/                 # Web static assets
├── .github/workflows/      # CI configuration
└── package.json            # Root (web) project manifest
```

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ (20 recommended) | Manage via [nvm](https://github.com/nvm-sh/nvm) |
| npm | ^9 | ships with Node |
| Supabase CLI | latest | Required for functions & migrations |
| Expo CLI | (`npx expo`) | Installed per-project |

---

## Environment Variables

1. Copy the provided `.env` file (or create a new one) at the repository root and populate the Supabase credentials and 3rd‑party API keys.
2. Create a companion `.env` inside `mobile/` for any Expo-specific secrets (the root `.gitignore` now ignores both files).
3. When running CI or deployments, configure the same variables as secrets in your hosting provider.

> ⚠️ Never commit production secrets. Rotate any keys that were committed previously.

---

## Install Dependencies

```bash
# Web admin (root)
npm install

# Mobile app
cd mobile
npm install
cd ..
```

---

## Development

### Web Super Admin
```bash
npm run dev
# Open http://localhost:5173 (default Vite port)
```

### Mobile App (Expo)
```bash
cd mobile
npx expo start --port 8082
# Scan the QR code with Expo Go, or press i / a / w for iOS, Android, or Web
```

> The Expo server uses port **8082** to avoid clashing with the Vite dev server.

---

## Supabase Tooling

Ensure you are authenticated (`supabase login`) and linked to the correct project (`supabase link --project-ref <ref>`).

Common commands:

```bash
# Deploy edge functions (all) using the helper script
./deploy-all-functions.sh

# Push database migrations
./deploy-database.sh

# Update function secrets
./set-function-secrets.sh
```

Refer to the scripts in the repository for exact environment variables required during deployment.

---

## NPM Scripts

### Root (Web)
| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Production build |
| `npm run build:dev` | Development-mode build |
| `npm run lint` | ESLint over the entire project |
| `npm run preview` | Preview production build |

### Mobile (`mobile/`)
| Script | Description |
|--------|-------------|
| `npm run start` | Expo development server |
| `npm run android` / `npm run ios` | Launch Expo for Android/iOS |
| `npm run web` | Run Expo in a web browser |
| `npm run lint` | Run Expo lint (ESLint) |

---

## Continuous Integration

GitHub Actions workflow: `.github/workflows/ci.yml`

- Runs on every push and pull request targeting `main`.
- **Web job**: installs dependencies, lints, and builds the Vite app.
- **Mobile job**: installs dependencies and runs `npm run lint` for the Expo project.

Ensure any additional checks (tests, type checks, E2E suites) are added to the respective jobs as the project evolves.

---

## Deployment Overview

| Component | Suggested Target | Notes |
|-----------|------------------|-------|
| Web Admin | Vercel / Netlify / Cloudflare Pages | Output from `npm run build` (Vite static assets) |
| Supabase | Supabase Dashboard / CLI | Deploy functions & migrations via provided scripts |
| Mobile | Expo EAS / App Store / Play Store | Use `eas build` & `eas submit` workflows |

Always confirm the latest Supabase project reference, secrets, and third-party API keys before pushing to production.

---

## Troubleshooting

- **Port collisions** – Vite uses `5173`, Expo uses `8082`. Stop any previous sessions before relaunching.
- **Supabase auth errors** – Re-run `supabase login` and ensure `SUPABASE_ACCESS_TOKEN` is available to scripts.
- **Expo CLI complaints about missing packages** – Run `npm install` in both the root and `mobile/` directories.

---

## Contributing

1. Create a feature branch
2. Commit using conventional messages when possible
3. Open a pull request
4. CI must pass before merging into `main`

---

Happy building! 🎉

# Shipaton submission notes

Built from monorepo commit on branch `cursor/shipaton-opensource-apk-a3f4` (latest `main` app tree under `xecuteApp/XecuteApp-main`).

## Artifacts

- Open-source folder: `shipaton-opensource/` (MIT)
- App source of record in monorepo: `xecuteApp/XecuteApp-main/`
- Release APK (arm64-v8a): `xecute-android/dist/xecute-release-arm64.apk`
- Package id: `com.xecute.app` · version `0.1.0`

## What is / isn’t included

| Included | Not included |
|----------|----------------|
| React Native + Kotlin Android app | `Xecute-web` Vite client |
| Shield / missions / paywall UI | `XecuteAdmin` console |
| Client calls to `/api/...` paths | Fastify/API server source |
| RevenueCat public SDK key (test) | Supabase service role / SQL / RLS |
| Sideload APK | Stripe / Dodo / JWT / Gemini secrets |

Client UI still shows product concepts (stakes, XCredits, Shield). That is app UX, not admin or server business logic.

## Monetization

RevenueCat Android SDK (`purchases` + `purchases-ui`) powers Pro / Founder Pass. See `xecute-android/docs/REVENUECAT.md`.

## Publishing this folder as its own public repo

```bash
cd shipaton-opensource
git init
git add .
git commit -m "Open source Xecute Android for Shipaton"
# create public repo, then:
git remote add origin https://github.com/YOUR_ORG/xecute-android.git
git push -u origin main
```

Confirm the license badge appears in the GitHub About section.

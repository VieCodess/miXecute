# Xecute Android

Native Android product: missions, stakes, auth, and built-in OS Shield.  
Subscriptions via **RevenueCat**. **MIT licensed** for Shipaton open-source submission.

**No browser required. No Chrome XLock.**

## Setup

```bash
npm install
```

`android/local.properties`:

```
sdk.dir=/path/to/Android/Sdk
```

Optional:

```bash
export XECUTE_API_URL=http://10.0.2.2:3001   # emulator → host API
```

## Run / build

```bash
npm start
npm run android
```

Release APK:

```bash
cd android && ./gradlew assembleRelease
```

A prebuilt arm64 release APK is in [`dist/xecute-release-arm64.apk`](./dist/xecute-release-arm64.apk).

## Product tabs

| Tab | What |
|-----|------|
| Home | Missions dashboard, start/complete commitments |
| Shield | Permissions, app/site blocklists, uninstall protection |
| You | Profile, XCredits, Xecute Pro / Founder Pass, sign out |

## RevenueCat

Entitlement `xecute_pro` · **Pro Monthly** / **Pro Yearly (×12)** / **Founder Pass (lifetime)** · Paywalls + Customer Center.  
Economy is **XCredits** (same as web `/api/credits`). See `docs/REVENUECAT.md`.

## License

MIT — see [`LICENSE`](./LICENSE).

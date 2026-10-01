# Xecute — Shipaton open-source pack

Self-contained **Android** source for [RevenueCat Shipaton](https://revenuecat-shipaton-2026.devpost.com/) (Next Gen–ready: public repo + MIT license + build instructions).

| Path | What |
|------|------|
| [`xecute-android/`](./xecute-android/) | Full React Native + Kotlin app (missions, Shield, RevenueCat) |
| [`LICENSE`](./LICENSE) | MIT (also mirrored inside `xecute-android/`) |

Prebuilt APKs stay out of this pack (build from source) so public clones don’t get production API hosts or demo credentials.

## What Xecute is

Xecute is the accountability “boss” that wants you to win: commit to missions, stake focus, earn **XCredits**, and use **Shield** (OS-level block) on Android. Subscriptions (**Xecute Pro** / **Founder Pass**) run through the **RevenueCat** SDK.

## Quick start (build from source)

```bash
cd xecute-android
npm install

# Point Gradle at your Android SDK
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties

cd android
./gradlew assembleRelease
# APK → android/app/build/outputs/apk/release/app-release.apk
```

Requirements: Node 18+, JDK 17+, Android SDK (API 35 / build-tools matching the project).

Optional API for live backend:

```bash
export XECUTE_API_URL=https://your-api.example
```

This pack is **Android-only**. It does **not** include `Xecute-web`, `XecuteAdmin`, Fastify/API servers, Supabase SQL, or payment secret keys.

Default `apiBaseUrl` / `webAppUrl` point at the local emulator loopback. Demo tester login is `demo@getxecute.me` / `DemoXecute123!`, and forks can override it with `XECUTE_DEMO_EMAIL` / `XECUTE_DEMO_PASSWORD`.

## RevenueCat

- Entitlement: `xecute_pro`
- Packages: `monthly`, `yearly`, `lifetime` (Founder Pass)
- Native SDK + Paywalls UI + Customer Center (Kotlin bridge)
- Docs: [`xecute-android/docs/REVENUECAT.md`](./xecute-android/docs/REVENUECAT.md)

Public test SDK key is embedded for development; override release with:

```bash
./gradlew assembleRelease -PrevenueCatApiKey=goog_YOUR_KEY
```

## Shipaton checklist (Next Gen)

1. Publish **this folder** (or `xecute-android/` alone) as a **public** GitHub repo.
2. Ensure GitHub detects the **MIT** license (root `LICENSE` file).
3. Attach a ≤2 min YouTube/Vimeo demo of the app on device.
4. Fill Devpost: description, 1024×1024 icon, 1179×2556 screenshot(s), RevenueCat project ID.
5. Prefer a student/academic email on Devpost if entering Next Gen.

Standard (non–Next Gen) categories still need a live US store listing — this pack covers the open-source + APK path.

## License

MIT — see [`LICENSE`](./LICENSE).

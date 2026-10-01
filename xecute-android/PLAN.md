# Xecute Android — Ready Plan

**Baseline:** Native product shell (auth, missions, stakes, profile) talking to the Xecute API.  
**Native add-on:** Spec 2.0 built-in Shield (Accessibility + overlay + daemon).  
**Not required:** Browser / Chrome XLock. Web URL is optional extras only.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│ React Native native product                      │
│  Auth → Home / Missions / Shield / You           │
│  missionStore (local-first) + API sync           │
│                     │                            │
│              BlockerBridge.ts                    │
│                     │                            │
│         XecuteBlockerModule.kt                   │
│  Accessibility · Overlay · Daemon · UsageStats   │
│  Device Admin · Tamper tiers · XCredits overlay  │
└──────────────────────────────────────────────────┘
```

---

## Phases

### Phase A — Native product shell
- [x] Auth (login/register) against `/api/auth/*`
- [x] Home dashboard with active + recent missions
- [x] Start mission (duration, stakes, partner email)
- [x] Active mission timer + complete/miss + Shield arm
- [x] Local-first missions (works offline; syncs when API reachable)
- [x] You / profile + optional web extras link
- [x] No WebView required for core experience

### Phase 1 — Bulletproof blocking engine
- [x] Accessibility foreground detect + overlay
- [x] Browser URL intercept
- [x] Smart session grouping (5s)
- [x] Daemon 3-layer schedule (day/time/WiFi)
- [x] Usage Stats secondary audit + permission-drop alerts
- [x] Device Admin uninstall protection
- [x] Tamper tiers (silent → warning → 10m lock)
- [x] Overlay Exit Home + burn XCredits for break (balance-aware)
- [x] Spec §8 anti-tamper: ADB detect, break disable, Room tamper_events, XScore, `/api/tamper/report`, reconcile clock audit
- [ ] Device QA on hardware (&lt;50ms, reboot, 72h) — needs physical device

### Phase B — Credits, resume, trends
- [x] Server-authoritative XCredits (`creditsStore` → `/api/credits/*`, local Shield cache offline)
- [x] Session resume UI (detect interrupt / expired timer → re-arm Shield + reconcile)
- [x] Premium weekly trends (You → Trends, Pro-gated, `/api/weekly-stats`)

### Spec Phase 2 — Offline Room + sync
- [x] Room entities: blocked apps/domains, lock sessions, app switch events, XCredits wallet, sync queue
- [x] Room DAOs + `XecuteDatabase` (v2) with SharedPreferences hot path for Shield
- [x] `OfflineSyncManager` enqueue + HTTP drain; daemon tick + App boot flush
- [x] RN `offlineSync` configures auth/API for native queue; JS fallback drain
- [x] Shield config UI (permissions / apps / domains / toggle) via RN Shield stack (spec Compose equivalent)
- [x] Backend ingest: reconcile (Android-tolerant + anti-cheat clock/duration), `/api/session/events`, `/api/tamper/report`, `/api/blocklist/update` → admin event-log + stores

### Monetization — RevenueCat
- [x] Gradle `purchases` + `purchases-ui` 10.23.3
- [x] Configure with test API key; entitlement `xecute_pro`
- [x] Packages: monthly=Pro, yearly=Pro×12, lifetime=Founder Pass
- [x] Paywall + Customer Center host activities
- [x] RN bridge + You → Paywall; logIn on auth
- [x] `POST /api/billing/revenuecat/sync` (Pro vs Founder)
- [x] XCredits via `/api/credits/*` (no Xfuel in product UI)
- [ ] Dashboard: create offering paywall + Play products (manual)
- [ ] Device QA with Play license testers

### Settings + OneSignal push
- [x] You → Settings: account prefs, notification toggles, app controls, privacy
- [x] Prefs sync `GET/PUT /api/user/preferences` (+ local AsyncStorage)
- [x] OneSignal `react-native-onesignal@5.2.9`; login on auth; opt-in/out from toggles
- [x] `GET /api/config/onesignal-push` + `POST /api/user/push-subscription`
- [ ] OneSignal dashboard: enable Android push + FCM; set App ID (admin API keys or `ONESIGNAL_APP_ID`)
- [ ] Device QA: permission prompt + test push

---

## Run

```bash
cd Xlock/xecuteApp/XecuteApp-main
npm install
# optional API override for emulator
export XECUTE_API_URL=http://10.0.2.2:3001
npm start
npm run android
```

See `docs/REVENUECAT.md` for billing details.
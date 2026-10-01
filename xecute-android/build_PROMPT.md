BUILD XECUTE ANDROID - REACT NATIVE + KOTLIN BRIDGE
=====================================================

## WHAT YOU'RE BUILDING
React Native (TypeScript) frontend + Kotlin native module for OS-level app/website blocking.
XCredits economy: users earn by focusing, burn to unlock distractions.
Never paywall basic blocking or stats.

Tech Stack:
- React Native + TypeScript, Kotlin native module
- Room database (offline-first), SharedPreferences for immediate sync
- Android 10-15 (API 29-35)

## PART 1: KOTLIN NATIVE SERVICES (Blocks at OS level)

### 1. XecuteAccessibilityService.kt
- Detect foreground app <50ms
- Intercept Chrome URL bar (traverse accessibility nodes for major browsers)
- Smart session grouping: same app within 5s = 1 session (not 2)
  * Track: lastFocusedPackage + lastFocusTimestamp
  * If reopen within 5s → action "REOPEN", else "SWITCH"
  * Log raw events to Room for backend dedup
- Browser URL interception: detect youtube.com, instagram.com, etc → trigger overlay
- Anti-tamper: user opens Settings during block → redirect to home

### 2. XecuteDaemonService.kt
- Foreground service with persistent notification
- Every 30s: validate scheduling (3-layer check)
  * isDayEnabled (from allowedWeekDays bitflag)
  * isTimeWindow (within scheduledStartTime/End)
  * isLocationOk (WiFi trigger, if any)
- Only activate/deactivate once per state change
- Request battery optimization exemption (Samsung/Xiaomi/Pixel)

### 3. BlockOverlayActivity.kt
- Full-screen immersive Compose overlay
- Dark purple (#0D0B14), lock icon, app name
- Buttons: "Exit to Home" + "Burn XCredits for Break"
- No back button, can't swipe away

### 4. XecuteBlockerModule.kt (Kotlin Bridge)
Methods exposed to React:
- checkPermissions() → returns status object
- requestPermission(type) → deep-links to Settings
- updateBlocklist(appsJson, domainsJson) → saves to SharedPreferences immediately + queues for backend
- toggleShield(isActive) → start/stop XecuteDaemonService
- getInstalledApps() → PackageManager query, returns app list with icons
- requestBreak(minutes) → pause blocking for N minutes

## PART 2: REACT NATIVE FRONTEND (TypeScript)

### 1. BlockerBridge.ts
Strongly-typed wrapper for native module. All methods return Promises.

### 2. Components
- PermissionDiagnostic: Green/red checklist (Accessibility, Overlay, UsageStats, Battery)
  * Each failing permission has button → Settings deep-link (1 tap)
  * Poll every 5s to detect if user revoked permissions
- BlocklistScreen: Searchable list of installed apps with toggle switches
- DashboardScreen: Master Shield toggle + permission card + break test button

### 3. Data Flow
- User toggles app in BlocklistScreen
- updateBlocklist() → writes to SharedPreferences (instant, offline)
- XecuteAccessibilityService reads from SharedPreferences (<1ms latency)
- App opens → overlay appears immediately
- Queue sync event to backend (fire-and-forget)

## PART 3: ROOM DATABASE (Kotlin)

Entities:
- BlockedAppEntity (packageName, appName, icon, isBlocked)
- BlockedDomainEntity (domain, isBlocked)
- LockSessionEntity (session tracking + scheduling fields)
- AppSwitchEventEntity (raw events: packageName, action, timestamp, duration)
- SyncQueueEntity (offline sync queue for backend events)

DAOs: Basic CRUD + custom queries

## VERIFICATION

Phase 1: Blocking only (no backend)
- [ ] Accessibility Service blocks apps within 50ms
- [ ] Chrome URL interception works (youtube.com, instagram.com trigger overlay)
- [ ] "Exit to Home" button works
- [ ] Shield toggle on/off instant
- [ ] Permission checklist shows correct status
- [ ] Tapping missing permission opens Settings directly
- [ ] Offline: blocklist saves to SharedPreferences immediately
- [ ] No crashes during 72h continuous operation

Phase 2: Offline + Sync
- [ ] WiFi off: blocking works 100%
- [ ] Session grouping: 5s reopen = 1 session (not 2)
- [ ] Scheduling: 3-layer validation works (day/time/location)
- [ ] Tamper detection: Settings nav redirects home
- [ ] Break modal: counts down, re-blocks after timer
- [ ] WiFi on: sync queue processes automatically

## APPBLOCK FIXES INTEGRATED

1. ✓ Session grouping (5s window, no inflate)
2. ✓ 3-layer scheduling (day + time + location)
3. ✓ Never paywall basic blocking (native bridge handles free logic)
4. ✓ Permission deep-links (1-tap Settings fixes)
5. ✓ Anti-tamper (Settings detection, logging)
6. ✓ Offline resilience (SharedPreferences + sync queue)
7. ✓ Session resumption (in daemon)
8. ✓ Server-side validation (backend handles, queued locally)

## START HERE

1. Create React Native project with TypeScript
2. Implement XecuteBlockerModule.kt (Kotlin) with PackageManager queries
3. Create BlockerBridge.ts wrapper + connect to module
4. Build PermissionDiagnostic component (live checklist + deep-links)
5. Build BlocklistScreen (toggle apps)
6. Build DashboardScreen (master toggle + break test)
7. Implement XecuteAccessibilityService with smart session grouping
8. Implement XecuteDaemonService with 3-layer scheduling
9. Implement BlockOverlayActivity
10. Test standalone (offline, no backend) until all checks pass

Don't move to Phase 2 until Phase 1 (blocking + UI) works solid.
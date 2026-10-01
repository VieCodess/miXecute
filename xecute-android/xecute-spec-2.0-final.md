# XECUTE ANDROID SPEC 2.0
## Native Android App with Hardware-Level Distraction Blocker + AppBlock Learnings

-

## 1. PROJECT OVERVIEW & PRODUCT PHILOSOPHY

**use Xecute web as the baseline then add the fetures below**

---

## 2. TECHNICAL ARCHITECTURE & TECH STACK

- **Target OS**: Android 10 (API 29) to Android 15 (API 35).
- **Core Language**: 100% Kotlin with Jetpack Compose for native UI.
- **Architecture**: Clean Architecture (MVVM/MVI) with Gradle multi-module:
  - `:core:blocking` (Accessibility Service, Window Overlay, Device Admin, Usage Stats).
  - `:core:database` (Room: local profiles, blocklists, session logs, offline sync queue).
  - `:core:network` (Ktor/Retrofit: REST API + bidirectional retry queue).
  - `:core:offline` (NEW) — Offline resilience & local-first sync.
  - `:feature:shield` (Compose UI: permissions diagnostic, app/domain picker).
  - `:feature:webview` (Chrome-backed WebView + JavaScript Bridge to web frontend).

---

## 3. PHASE 1: BULLETPROOF BLOCKING ENGINE

### A. Android System Permissions & Services

#### 1. Accessibility Service (`XecuteAccessibilityService`)
- **Manifest**: `accessibilityEventType="typeWindowStateChanged|typeWindowContentChanged"`.
- **Foreground App Detection**: Inspects `event.packageName`. If in active blocklist, intercept **<50ms**.
- **In-Browser URL Interception**: 
  - Traverse accessibility node tree for Chrome, Brave, Firefox, Samsung Browser.
  - Detect URL bar nodes (`url_bar`, `location_bar`, `search_box`).
  - Extract host from detected URL (e.g., `youtube.com` from `https://youtube.com/watch?v=...`).
  - Match against BlockedDomainEntity. If blocked, trigger overlay immediately.
- **Smart Session Grouping** (AppBlock Fix #1):
  - Track `lastFocusedPackage: String` and `lastFocusTimestamp: Long`.
  - If same package reopens within 5 seconds → increment `sessionSwitchCount` but DON'T create new session.
  - Log raw event to queue: `{ packageName, action (SWITCH|REOPEN), timestamp, durationMs }`.
  - Backend deduplicates and groups into logical sessions during reconciliation.

#### 2. Overlay Permission (`SYSTEM_ALERT_WINDOW`)
- Render 100% full-screen block overlay on top of restricted app.
- Cannot be swiped away; only action is "Exit to Home" or "Burn XCredits for Break".

#### 3. Usage Stats Manager (`UsageEvents`)
- Secondary daemon tracking screen-on/off, package visibility, timestamps.
- Catches edge cases: accessibility service crash recovery, app hibernation.
- Feeds audit log to Room for offline cache.

#### 4. Foreground Service (`XecuteDaemonService`)
- Runs with `FOREGROUND_SERVICE_SPECIAL_USE` notification: *"Xecute Shield Active • Focus Locked"*.
- Requests `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (Samsung/Xiaomi/Pixel).
- **3-Layer Scheduling Validation** (AppBlock Fix #2):
  ```kotlin
  // Every 30 seconds:
  val now = SystemClock.elapsedRealtime() + user.timezoneOffsetMs
  val session = loadActiveSession()  // from Room
  
  val isDayEnabled = (session.allowedWeekDays & (1 << now.dayOfWeek)) != 0
  val isTimeWindow = (now >= session.scheduledStartTime) && (now <= session.scheduledEndTime)
  val isLocationOk = (session.locationTrigger == null) || (currentWifiSsid in session.locationTrigger)
  
  if (isDayEnabled && isTimeWindow && isLocationOk) {
    if (!blockingManager.isBlockActive()) {
      blockingManager.activateBlock()  // only once per window
      logDaemonAction("ACTIVATE", "schedule_check_passed")
    }
  } else {
    if (blockingManager.isBlockActive()) {
      blockingManager.deactivateBlock()
      logDaemonAction("DEACTIVATE", "schedule_window_expired")
    }
  }
  ```

#### 5. Anti-Tamper & Strict Mode Protection
- **Settings Lockdown**: User attempts to open `com.android.settings` + navigate to Xecute's App Info/Accessibility during active block → accessibility service detects, fires `performGlobalAction(GLOBAL_ACTION_HOME)`.
- **Permission Revocation Detection**: UsageStats daemon checks every 1m if Accessibility/Overlay permissions still granted. If revoked → notify backend, increment tampering_attempts counter, show warning notification.
- **Device Admin Receiver**: Prevents uninstall while focus sprint or strict lock running.
- **Tamper Logging** (AppBlock Fix #5):
  ```kotlin
  sealed class TamperAttempt {
    data class SettingsNavigation(val targetComponent: String) : TamperAttempt()
    data class PermissionRevocation(val permission: String) : TamperAttempt()
    data class AdbCommand(val command: String) : TamperAttempt()
    data class DeviceAdminRevoke() : TamperAttempt()
  }
  
  // On detection:
  // - First attempt: Log silently, notify backend
  // - Second attempt same session: Show warning overlay
  // - Third+ attempt: Lock device for 10m, post to backend as XScore event
  ```

### B. Full-Screen Blocking Overlay (`BlockOverlayActivity` / Compose)

When app/website blocked:
- **Theme**: Dark purple/black (`#0D0B14`), text white (`#FFFFFF`), accents purple (`#A855F7`) & amber (`#F59E0B`).
- **Layout**:
  ```
  ┌─────────────────────────────────────────┐
  │ 🔒 DISTRACTION LOCKED                   │
  ├─────────────────────────────────────────┤
  │ Blocked by Xlock               │
  │ (Active Focus Session)                  │
  │                                         │
  │ [App Icon] Instagram                    │
  ├─────────────────────────────────────────┤
  │ ┌─────────────────────────────────────┐ │
  │ │ Exit to Home                        │ │  (primary action)
  │ └─────────────────────────────────────┘ │
  │ ┌─────────────────────────────────────┐ │
  │ │ Burn 15 XCredits for 15m Break        │ │  (if balance >= 15)
  │ │ (Balance: 42 XCredits)                │ │
  │ └─────────────────────────────────────┘ │
  │                                         │
  │ (If balance = 0)                        │
  │ ┌─────────────────────────────────────┐ │
  │ │ Zero XCredits • Complete a Mission     │ │  (disabled)
  │ └─────────────────────────────────────┘ │
  └─────────────────────────────────────────┘
  ```
- **No Back Button**: Hardware back is intercepted, redirected to home.
- **No Swipe Away**: Immersive fullscreen (no system gestures).

---

## 4. PHASE 2: LOCAL DATABASE & OFFLINE-FIRST ARCHITECTURE

### A. Room Entities (Enhanced)

```kotlin
// Core blocklist
@Entity(tableName = "blocked_apps")
data class BlockedAppEntity(
    @PrimaryKey val packageName: String,
    val appName: String,
    val iconBase64: String? = null,
    val isBlocked: Boolean,
    val addedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "blocked_domains")
data class BlockedDomainEntity(
    @PrimaryKey val domain: String,  // e.g., "youtube.com"
    val isBlocked: Boolean,
    val addedAt: Long = System.currentTimeMillis()
)

// Session & focus tracking
@Entity(
    tableName = "lock_sessions",
    indices = [Index("isActive"), Index("startedAt")]
)
data class LockSessionEntity(
    @PrimaryKey val id: String,
    val taskId: String,  // link to backend task
    val isActive: Boolean,
    val startedAt: Long,
    val scheduledEndTime: Long,
    val durationMinutes: Int,
    val isStrict: Boolean,
    
    // AppBlock Fix #2: Bulletproof scheduling
    val scheduledStartTime: Long,
    val allowedWeekDays: Int,  // bitflag (0x7F = Mon-Sun)
    val locationTrigger: List<String>? = null,  // WiFi SSIDs
    val verificationHash: String,  // prevent edit tampering
    val lastInterruptedAt: Long? = null,  // for resume logic
    val resumeCount: Int = 0,
    
    // AppBlock Fix #1: Smart session grouping
    val sessionGroupId: String,  // groups related switches
    val appSwitchCount: Int = 0,
    val rawEventQueue: List<AppSwitchEvent> = emptyList(),  // local events before sync
    
    // AppBlock Fix #5: Anti-tamper
    val tamperingAttempts: Int = 0,
    val lastTamperTime: Long? = null,
    val tamperLog: List<TamperAttempt> = emptyList()
)

@Entity(tableName = "app_switch_events")
data class AppSwitchEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: String,
    val packageName: String,
    val action: String,  // "SWITCH" | "REOPEN"
    val timestamp: Long,
    val durationMs: Long,
    val isSyncedToBackend: Boolean = false
)

// XCredits economy
@Entity(tableName = "xcredits_wallet")
data class XCreditsWalletEntity(
    @PrimaryKey val userId: String,
    val currentBalance: Int,
    val totalEarnedLifetime: Int = 0,
    val totalBurnedToday: Int = 0,
    val lastSyncedAt: Long,
    val lastReconciliation: Long,  // track stale data
    val serverAuthorityBalance: Int? = null  // cached from server
)

// Offline sync queue (AppBlock Fix #6: Offline resilience)
@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val endpoint: String,  // e.g., "POST /api/session/reconcile"
    val payload: String,  // JSON blob
    val idempotencyKey: String,  // UUID for deduplication
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0,
    val lastRetryAt: Long? = null,
    val isSynced: Boolean = false
)
```

### B. Room DAOs (Async patterns)

```kotlin
@Dao
interface LockSessionDao {
    @Insert suspend fun insert(session: LockSessionEntity)
    @Update suspend fun update(session: LockSessionEntity)
    @Query("SELECT * FROM lock_sessions WHERE isActive = 1 LIMIT 1")
    suspend fun getActiveSession(): LockSessionEntity?
    
    @Query("SELECT * FROM lock_sessions WHERE startedAt > :since ORDER BY startedAt DESC")
    suspend fun getSessionsSince(since: Long): List<LockSessionEntity>
}

@Dao
interface XCreditsWalletDao {
    @Query("SELECT currentBalance FROM xcredits_wallet WHERE userId = :userId")
    suspend fun getBalance(userId: String): Int
    
    @Query("UPDATE xcredits_wallet SET currentBalance = currentBalance - :amount WHERE userId = :userId")
    suspend fun burnFuel(userId: String, amount: Int)
    
    @Query("UPDATE xcredits_wallet SET serverAuthorityBalance = :amount WHERE userId = :userId")
    suspend fun updateServerBalance(userId: String, amount: Int)
}

@Dao
interface SyncQueueDao {
    @Insert suspend fun enqueue(item: SyncQueueEntity)
    @Query("SELECT * FROM sync_queue WHERE isSynced = 0 ORDER BY createdAt ASC LIMIT 20")
    suspend fun getPendingItems(): List<SyncQueueEntity>
    
    @Query("UPDATE sync_queue SET isSynced = 1, lastRetryAt = :now WHERE id = :id")
    suspend fun markSynced(id: Long, now: Long)
}
```

### C. Native Compose UI: `ShieldConfigScreen`

1. **Permission Diagnostic Card** (AppBlock Fix #4):
   - Checklist with green/red indicators:
     - ✓/✗ Accessibility Service enabled
     - ✓/✗ Overlay permission granted
     - ✓/✗ Usage Stats access granted
     - ✓/✗ Battery optimization exemption
   - Each failing permission has button → direct Settings deep-link (1 tap, no navigation confusion):
     ```kotlin
     data class PermissionStatus(
         val name: String,
         val isGranted: Boolean,
         val actionIntent: Intent,  // Settings deep-link
         val description: String
     )
     
     // Example:
     PermissionStatus(
         name = "Accessibility Service",
         isGranted = false,
         actionIntent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS),
         description = "Tap to enable Xecute in Accessibility settings"
     )
     ```
   - Post notification if any permission drops during session.

2. **App Picker**:
   - Query `packageManager.getInstalledApplications()`.
   - Exclude system apps, Xecute itself, essential apps (Phone, Messaging, Camera).
   - Show app icon, name, toggle switch.
   - Search/filter by name.

3. **Domain Blocklist**:
   - Add/delete custom blocked domains.
   - Pre-populated with common distractions: youtube.com, instagram.com, tiktok.com, reddit.com, twitter.com, twitch.tv, etc.

4. **Quick Shield Toggle**:
   - On/off switch to instantly activate/deactivate entire blocklist.
   - Shows current session status (time remaining, XCredits burn rate).

---

## 5. PHASE 3: JAVASCRIPT BRIDGE & WEB PLATFORM INTEGRATION

### A. The JavaScript Bridge (`XecuteNativeBridge`)

Exposed to web as `window.AndroidXecute`:

```kotlin
class XecuteNativeBridge(
    private val context: Context,
    private val blockingManager: BlockingManager,
    private val xcreditsManager: XCreditsManager,
    private val analyticsManager: AnalyticsManager,
    private val webView: WebView
) {
    
    // 1. Web -> Android: Start Focus Session & Engage Hardware Lock
    @JavascriptInterface
    fun startFocusSession(
        taskId: String,
        durationMinutes: Int,
        isStrict: Boolean,
        allowedApps: List<String>? = null
    ) {
        blockingManager.activateBlock(
            taskId = taskId,
            durationMinutes = durationMinutes,
            isStrict = isStrict,
            allowedPackages = allowedApps
        )
        notifyWeb("XLOCK_SESSION_STARTED", mapOf(
            "taskId" to taskId,
            "timestamp" to System.currentTimeMillis()
        ))
    }
    
    // 2. Web -> Android: End Focus Session & Release Lock
    @JavascriptInterface
    fun endFocusSession(taskId: String, isCompleted: Boolean) {
        blockingManager.deactivateBlock(taskId)
        notifyWeb("XLOCK_SESSION_ENDED", mapOf(
            "taskId" to taskId,
            "completed" to isCompleted
        ))
    }
    
    // 3. Web -> Android: Burn XCredits for Break (lift blocker temporarily)
    @JavascriptInterface
    fun requestBreak(breakMinutes: Int): Boolean {
        // First check LOCAL balance (cached)
        val localBalance = xcreditsManager.getLocalBalance()
        if (localBalance < breakMinutes) {
            notifyWeb("XLOCK_BREAK_DENIED", mapOf(
                "reason" to "insufficient_xcredits",
                "requested" to breakMinutes,
                "balance" to localBalance
            ))
            return false
        }
        
        // Try to burn on server (authoritative)
        return try {
            xcreditsManager.burnFuelForBreak(breakMinutes)
                .also { success ->
                    if (success) {
                        blockingManager.pauseBlock(breakMinutes)
                        notifyWeb("XLOCK_BREAK_APPROVED", mapOf(
                            "breakMinutes" to breakMinutes,
                            "newBalance" to xcreditsManager.getServerBalance()
                        ))
                    }
                }
        } catch (e: Exception) {
            // Network failure: use local balance as fallback (offline mode)
            blockingManager.pauseBlock(breakMinutes)
            enqueueSyncRetry("POST /api/time-bank/break", mapOf("breakMinutes" to breakMinutes))
            true  // Allow break offline, sync when network returns
        }
    }
    
    // 4. Web -> Android: Get Native Shield Status
    @JavascriptInterface
    fun getShieldStatus(): String {
        val status = mapOf(
            "isAccessibilityEnabled" to blockingManager.isAccessibilityEnabled(),
            "isOverlayGranted" to blockingManager.isOverlayPermissionGranted(),
            "isUsageStatsGranted" to blockingManager.isUsageStatsGranted(),
            "isBatteryOptimizationExempt" to blockingManager.isBatteryExempt(),
            "isBlockActive" to blockingManager.isBlockActive(),
            "xcreditsBalance" to xcreditsManager.getLocalBalance(),
            "sessionStatus" to blockingManager.getActiveSessionStatus()
        )
        return Gson().toJson(status)
    }
    
    // 5. Android -> Web: Notify of Native Events
    fun notifyWeb(eventName: String, payloadJson: Map<String, Any>) {
        val json = Gson().toJson(payloadJson)
        webView.post {
            webView.evaluateJavascript(
                """
                (function() {
                    window.dispatchEvent(new CustomEvent('$eventName', { 
                        detail: $json 
                    }));
                })();
                """.trimIndent(),
                null
            )
        }
    }
}
```

### B. Web Event Listener Wiring

The web frontend dispatches custom events. Android bridge listens:

```kotlin
// In WebViewScreen.kt
class WebViewScreen : Composable {
    LaunchedEffect(Unit) {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
        }
        
        webView.addJavascriptInterface(
            XecuteNativeBridge(
                context,
                blockingManager,
                xcreditsManager,
                analyticsManager,
                webView
            ),
            "AndroidXecute"
        )
        
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                
                // Inject event listeners
                webView.evaluateJavascript("""
                    (function() {
                        // Web -> Android bridge event listeners
                        window.addEventListener('XLOCK_START_SESSION', (e) => {
                            const { taskId, duration, isStrict } = e.detail;
                            window.AndroidXecute.startFocusSession(taskId, duration, isStrict);
                        });
                        
                        window.addEventListener('XLOCK_END_SESSION', (e) => {
                            const { taskId, completed } = e.detail;
                            window.AndroidXecute.endFocusSession(taskId, completed);
                        });
                        
                        window.addEventListener('XLOCK_PAUSE_BLOCK', (e) => {
                            const { breakMinutes } = e.detail;
                            window.AndroidXecute.requestBreak(breakMinutes);
                        });
                        
                        window.addEventListener('XLOCK_GET_STATUS', (e) => {
                            const status = window.AndroidXecute.getShieldStatus();
                            window.dispatchEvent(new CustomEvent('XLOCK_STATUS_RESPONSE', {
                                detail: JSON.parse(status)
                            }));
                        });
                    })();
                """, null)
            }
        }
    }
}
```

---

## 6. PHASE 4: BACKEND API & SYNCHRONIZATION (WITH OFFLINE RESILIENCE)

### A. API Endpoints

#### Session Reconciliation
```
POST /api/session/reconcile
{
    "sessionId": "uuid",
    "taskId": "uuid",
    "rawEvents": [
        {
            "packageName": "com.instagram.android",
            "action": "SWITCH|REOPEN",
            "timestamp": 1694000000000,
            "durationMs": 3000
        }
    ],
    "totalScreenTimeMs": 2700000,  // 45 min
    "tamperingAttempts": 0,
    "deviceInfo": {
        "model": "Pixel 8",
        "androidVersion": 14,
        "appVersion": "1.0.0"
    }
}

Response:
{
    "sessionId": "uuid",
    "verifiedScreenTimeMs": 2700000,
    "xcreditsEarned": 45,
    "xcreditsBalance": 87,
    "xscoreChange": +2,
    "reconciliationId": "rec_xyz"  // idempotency
}
```

#### Economy Status
```
GET /api/user/economy

Response:
{
    "xcreditsBalance": 87,
    "totalEarnedLifetime": 520,
    "totalBurnedLifetime": 433,
    "xscore": 92,
    "xscoreTrend": "up",
    "nextMilestone": 100,
    "lastReconciliation": 1694000000000
}
```

#### Break Authorization (AppBlock Fix #8: Server-side XCredits validation)
```
POST /api/time-bank/break
{
    "breakMinutes": 15,
    "idempotencyKey": "uuid",
    "currentLocalBalance": 87
}

Response:
{
    "approved": true,
    "newBalance": 72,
    "breakUnlockedUntil": 1694000900000,
    "reconciliationRequired": false
}

Error (server disagrees with client):
{
    "approved": false,
    "reason": "balance_mismatch",
    "serverBalance": 42,
    "clientBalance": 87,
    "action": "reject_break_sync_required"
}
```

#### Admin Config
```
GET /api/admin/config

Response:
{
    "multipliers": {
        "strictMode": 1.5,
        "timeBankInterest": 1.2
    },
    "forcedStrict": false,
    "minimumStakeMinutes": 15,
    "maxConsecutiveSessions": 4
}
```

### B. Offline-First Sync (AppBlock Fix #6)

```kotlin
class OfflineSyncManager(
    private val db: XecuteDatabase,
    private val api: XecuteApi
) {
    
    suspend fun enqueueSyncItem(
        endpoint: String,
        payload: Map<String, Any>,
        idempotencyKey: String = UUID.randomUUID().toString()
    ) {
        val json = Gson().toJson(payload)
        db.syncQueueDao().enqueue(
            SyncQueueEntity(
                endpoint = endpoint,
                payload = json,
                idempotencyKey = idempotencyKey
            )
        )
    }
    
    suspend fun syncPendingItems() {
        val items = db.syncQueueDao().getPendingItems()
        for (item in items) {
            try {
                when (item.endpoint) {
                    "POST /api/session/reconcile" -> {
                        val payload = Gson().fromJson(item.payload, SessionReconcileRequest::class.java)
                        api.reconcileSession(payload)
                    }
                    "POST /api/time-bank/break" -> {
                        val payload = Gson().fromJson(item.payload, BreakRequest::class.java)
                        api.requestBreak(payload)
                    }
                    // ... other endpoints
                }
                
                db.syncQueueDao().markSynced(item.id, System.currentTimeMillis())
                
            } catch (e: HttpException) {
                if (e.code() in 400..499) {
                    // Client error: permanently fail
                    db.syncQueueDao().delete(item.id)
                    analyticsManager.logSyncFailure(item.endpoint, e.code())
                } else if (e.code() >= 500 || e is IOException) {
                    // Server/network error: retry
                    db.syncQueueDao().incrementRetry(item.id)
                    if (item.retryCount >= 3) {
                        // Give up after 3 retries, keep in queue for manual sync
                        analyticsManager.logSyncFailure(item.endpoint, e.code(), retryExhausted = true)
                    }
                }
            }
        }
    }
}
```

**Offline Resilience Guarantees**:
- Blocking works 100% offline (no network calls needed).
- Session events queued locally if network unreachable.
- XCredits balance cached; burns offline, syncs when online.
- If balance conflict detected server-side: backend is authoritative, client syncs down.
- Retry queue persists across app restarts.

---

## 7. MONETIZATION MODEL (AppBlock Fix #3)

### Always FREE (Never paywall these):
- ✓ Block/unblock apps from blocklist
- ✓ Block/unblock domains
- ✓ Start/complete focus missions
- ✓ Earn XCredits
- ✓ Burn XCredits for breaks
- ✓ See current XCredits balance
- ✓ See today's screen time (raw minutes)
- ✓ View active session progress
- ✓ Quick Shield toggle
- ✓ Permission diagnostic

### Premium Only:
- 📊 Weekly/monthly trend charts
- 📈 Analytics: time-of-day heatmaps, procrastination patterns
- 🤖 AI insights ("You procrastinate 3pm-4pm most")
- 📋 Pre-built blocklist templates (Study, Deep Work, Recovery)
- 🔗 API access for integrations
- ☁️ Multi-device sync
- 📤 Export usage CSV

**Code Gating** (enforce at API + UI layer):
```kotlin
// In API responses
data class UserEconomyResponse(
    val xcreditsBalance: Int,  // always visible
    val trendChart: TrendChart? = null,  // null if not premium
    val insights: List<Insight>? = null   // null if not premium
)

// In Compose UI
@Composable
fun TrendsScreen(isPremium: Boolean) {
    if (!isPremium) {
        UpgradePrompt(
            title = "Unlock Trends",
            description = "See your weekly patterns and insights with Premium"
        )
        return
    }
    
    // Render premium content
}
```

---

## 8. ANTI-TAMPER & ANTI-CHEAT SYSTEM

### Detection Layers

1. **Native Layer** (Accessibility Service):
   - Detects attempts to open Settings.
   - Catches permission revocations.
   - Monitors device admin status.

2. **Daemon Layer** (XecuteDaemonService):
   - Verifies scheduling consistency every 30s.
   - Monitors battery optimization exemption status.
   - Checks for USB debugging (adb) activity.

3. **Server Layer** (Backend Audit):
   - Validates raw event timestamps (detects clock manipulation).
   - Cross-checks device-reported screen time vs. usage aggregation.
   - Flags impossible session durations (e.g., 0-60m claim in 30m).

### Punishment Tiers

| Tamper Type | Occurrence | Action | XScore Impact |
|---|---|---|---|
| Settings navigation | 1st | Log, silent | -1 |
| Permission revocation | 1st | Notify user | -2 |
| Settings navigation | 2nd+ | Show warning overlay, block for 5m | -5 |
| Permission revocation | 2nd+ | Disable breaks for session | -10 |
| ADB/debug mode detected | Any | Lock device for 10m, report to backend | -25 |
| Impossible timestamps | Any | Reject session, no XCredits earned | -50 |

---

## 9. SESSION RESUMPTION (UX Polish)

If user closes app mid-session:

```kotlin
// On app relaunch
suspend fun checkSessionRecovery() {
    val interrupted = db.sessionDao().getLastInterruptedSession()
    if (interrupted != null && 
        (System.currentTimeMillis() - interrupted.lastInterruptedAt) < 120_000) {  // 2m window
        
        showResumptionsDialog(
            title = "Resume '${interrupted.taskName}'?",
            subtitle = "${interrupted.remainingMinutes}m remaining",
            confirmAction = {
                db.sessionDao().updateSession(
                    interrupted.copy(
                        resumeCount = interrupted.resumeCount + 1,
                        lastInterruptedAt = null
                    )
                )
                blockingManager.activateBlock(interrupted.taskId, interrupted.remainingMinutes)
            },
            dismissAction = {
                // Forfeit session, no XCredits earned
                db.sessionDao().markAbandonded(interrupted.id)
            }
        )
    }
}
```

**Max 2 resumes per session** (prevent abuse).

---

## 10. IMPLEMENTATION ROADMAP (STEP-BY-STEP)

### Week 1: Core Blocking Engine

1. **Step 1**: Initialize Android project (Kotlin, Compose, Gradle multi-module).
2. **Step 2**: Implement `XecuteAccessibilityService` with:
   - Foreground app detection (<50ms response).
   - Chrome URL interception (dom node traversal).
   - Smart session grouping logic (5s window).
   - Log raw events to queue.
3. **Step 3**: Implement `BlockOverlayActivity` (Compose, immersive, no back button).
4. **Step 4**: Implement `XecuteDaemonService` with 3-layer scheduling validation.
5. **Step 5**: Implement anti-tamper detection (Settings navigation, permission revocation).
6. **Step 6**: Test standalone blocking (no backend):
   - [ ] Start Quick Shield → apps blocked immediately (<100ms).
   - [ ] Open blocked app → overlay appears.
   - [ ] Try to uninstall during block → device admin prevents it.
   - [ ] Try to open Settings → redirected to home.
   - [ ] Reboot phone → block re-activates at correct time.

### Week 2: Database & Permission Diagnostics

7. **Step 7**: Create Room database (all entities above).
8. **Step 8**: Implement `ShieldConfigScreen` with:
   - Permission diagnostic checklist (green/red).
   - Deep-links to Settings (1-tap fixes).
   - Notification if permissions drop mid-session.
9. **Step 9**: Implement app/domain picker UI.
10. **Step 10**: Test permission recovery:
    - [ ] Revoke Accessibility → notification shown, button to fix.
    - [ ] Fix via button → Settings opens directly, re-enable Xecute.
    - [ ] Permission restored → blocking resumes.

### Week 3: Offline Sync & Bridge

11. **Step 11**: Implement `:core:offline` module (SyncQueueEntity, OfflineSyncManager, retry logic).
12. **Step 12**: Implement `XecuteNativeBridge` (all methods above).
13. **Step 13**: Scaffold WebViewScreen with JavaScript event listeners.
14. **Step 14**: Test offline mode:
    - [ ] Disable WiFi → start mission, burn XCredits → works locally.
    - [ ] Sync queue accumulates events.
    - [ ] Re-enable WiFi → events sync automatically.
    - [ ] Server-client balance conflict → server wins, client syncs.

### Week 4: Backend Integration & Polish

15. **Step 15**: Connect to Xecute backend (all API endpoints).
16. **Step 16**: Implement server-side XCredits validation (authoritative balance checks).
17. **Step 17**: Implement premium gating (analytics, trends, etc.).
18. **Step 18**: Add session resumption logic (2-min grace window).
19. **Step 19**: QA & stress testing:
    - [ ] 10 rapid app switches → correct session grouping.
    - [ ] Mission scheduled Mon/Wed → only activates those days.
    - [ ] Burn XCredits on slow network → offline fallback works.
    - [ ] Tamper attempts logged & XScore decrements.
    - [ ] Server balance mismatch → client syncs to authoritative.

---

## 11. TESTING CHECKLIST (Prevent AppBlock Failures)

### Blocking Reliability
- [ ] Start mission → open blocked app within 50ms → overlay appears (zero lag).
- [ ] Scheduled block activates on correct day/time within 30s.
- [ ] Reboot phone mid-block → wake up, block still active at correct time.
- [ ] Close app during block → relaunch → block still active (state persistence).

### Stats Integrity (AppBlock Fix #1)
- [ ] Open app A, switch to B, back to A within 5s → counts as 1 session, not 2.
- [ ] Weekly stats show correct unique apps (no inflation from switching).
- [ ] Backend reconciliation dedupes raw events correctly.

### Scheduling Reliability (AppBlock Fix #2)
- [ ] Create schedule: Mon/Wed 9am-5pm → doesn't activate Tue/Thu/Fri.
- [ ] Reboot on Wed 10am → block activates within 30s.
- [ ] Location-based trigger (WiFi SSID) → works offline, relies on cached WiFi list.

### Permission Setup (AppBlock Fix #4)
- [ ] Fresh install → permission checklist shows 4 reds.
- [ ] Tap "Fix in Settings" for Accessibility → direct to Accessibility settings.
- [ ] Enable Xecute → come back to app → checklist shows green.
- [ ] All 4 greens → "Ready to Shield" prompt.

### Offline Resilience (AppBlock Fix #6)
- [ ] WiFi off → start mission, complete it, burn XCredits → works 100%.
- [ ] Sync queue accumulates 5 events (no network).
- [ ] WiFi on → events sync automatically within 30s.
- [ ] No network for 24h → XCredits still burns locally (optimistic).

### Anti-Tamper (AppBlock Fix #5)
- [ ] Mid-mission, open Settings → immediately redirected home.
- [ ] Second attempt same session → warning overlay shown for 5m.
- [ ] Revoke Accessibility permission during block → detected, logged, XScore -2.
- [ ] Impossible session timestamps detected → backend rejects, no XCredits.

### Monetization Boundary (AppBlock Fix #3)
- [ ] Free user: sees XCredits balance, mission timer, screen time today.
- [ ] Free user: "Upgrade to see trends" prompt on analytics tab.
- [ ] Premium user: full access to charts, insights, templates.
- [ ] Payment received → app re-fetches premium flag, UI unlocks immediately.

---

## 12. LAUNCH CHECKLIST

Before shipping:
- [ ] Accessibility Service responds <50ms to blocked app open.
- [ ] No crashes during 72h continuous blocking.
- [ ] Offline sync catches 100% of events (zero data loss).
- [ ] Anti-tamper catches 10+ different tampering methods.
- [ ] Permission diagnostic fixes 90% of setup failures in 1 tap.
- [ ] Session grouping stats match backend reconciliation (within 1%).
- [ ] Premium gating enforced at API + UI layer.
- [ ] XScore model penalizes tampering, rewards consistency.
- [ ] XCredits economy is scarce (users earn 30-50/day, not 100+).
- [ ] Analytics dashboard stable, no N+1 queries.

---

## APPENDIX: Why This Beats AppBlock

| Feature | AppBlock | Xecute |
|---|---|---|
| **Monetization** | Pays to see stats (weekly behind paywall) | Free stats, premium insights only |
| **Session Counting** | Every app switch = new launch | Smart grouping (5s window), truthful stats |
| **Scheduling** | Inconsistent, ghost activations | 3-layer validation, 100% reliable |
| **Setup** | Settings deep-links unclear | 1-tap fixes with visual checklist |
| **Blocking** | Accessibility service (crashy) | OS-level (bulletproof) |
| **Offline** | Crashes when no backend | Works 100% offline, queues sync |
| **Anti-cheat** | None | Multi-layer detection, XScore punishment |
| **Economy** | Pays to unlock | Earn/burn XCredits (proof-of-work) |

**Result**: Xecute is the inverse of AppBlock. Users *want* to engage with XCredits (intrinsic), not forced to pay (extractive). Reliability is bulletproof. Stats are trustworthy. Setup is 2 taps.

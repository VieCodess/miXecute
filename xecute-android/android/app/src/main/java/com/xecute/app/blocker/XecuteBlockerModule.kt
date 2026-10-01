package com.xecute.app.blocker

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.util.Base64
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.xecute.app.data.OfflineSyncManager
import com.xecute.app.data.XecuteDatabase
import com.xecute.app.data.entity.BlockedAppEntity
import com.xecute.app.data.entity.BlockedDomainEntity
import com.xecute.app.data.entity.LockSessionEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.TimeUnit

class XecuteBlockerModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    private val prefs = BlockPrefs.get(reactContext)
    private val db by lazy { XecuteDatabase.getInstance(reactContext) }
    private val sync by lazy { OfflineSyncManager.get(reactContext) }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName(): String = "XecuteBlocker"

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        try {
            val map = Arguments.createMap().apply {
                putBoolean("accessibilityGranted", isAccessibilityServiceEnabled())
                putBoolean("overlayGranted", Settings.canDrawOverlays(reactContext))
                putBoolean("usageStatsGranted", hasUsageStatsPermission())
                putBoolean("batteryOptimizationIgnored", isBatteryExempt())
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("PERMISSION_CHECK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun requestPermission(type: String, promise: Promise) {
        try {
            val intent = when (type) {
                "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                "overlay" -> Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactContext.packageName}"),
                )
                "usageStats" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                "battery" -> Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:${reactContext.packageName}"),
                )
                else -> {
                    promise.reject("UNKNOWN_PERMISSION", "Unknown permission type: $type")
                    return
                }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PERMISSION_REQUEST_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun updateBlocklist(appsJson: String, domainsJson: String, promise: Promise) {
        try {
            val apps = parseJsonStringArray(appsJson)
            val domains = parseJsonStringArray(domainsJson)

            // Instant offline write — accessibility reads this
            prefs.saveBlockedApps(apps.toSet())
            prefs.saveBlockedDomains(domains.toSet())

            scope.launch {
                val blocklistDao = db.blocklistDao()
                blocklistDao.clearApps()
                blocklistDao.clearDomains()
                blocklistDao.insertApps(
                    apps.map { pkg ->
                        BlockedAppEntity(
                            packageName = pkg,
                            appName = pkg,
                            isBlocked = true,
                        )
                    },
                )
                blocklistDao.insertDomains(
                    domains.map { domain ->
                        BlockedDomainEntity(domain = domain, isBlocked = true)
                    },
                )

                val payload = JSONObject()
                    .put("apps", JSONArray(apps))
                    .put("domains", JSONArray(domains))
                    .put("userId", prefs.getSyncUserId() ?: JSONObject.NULL)
                    .put("source", "xecute_android")
                    .toString()

                sync.enqueue("POST /api/blocklist/update", payload)
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UPDATE_BLOCKLIST_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun toggleShield(isActive: Boolean, promise: Promise) {
        try {
            prefs.setShieldActive(isActive)
            val intent = Intent(reactContext, XecuteDaemonService::class.java)
            if (isActive) {
                // Phase 1 defaults: seed common distraction domains if none set
                if (prefs.getBlockedDomains().isEmpty()) {
                    prefs.saveBlockedDomains(
                        setOf(
                            "youtube.com",
                            "instagram.com",
                            "tiktok.com",
                            "twitter.com",
                            "x.com",
                            "reddit.com",
                        ),
                    )
                }
                // Default always-on session for Phase 1 (no schedule constraints)
                val sessionId = prefs.getActiveSessionId() ?: UUID.randomUUID().toString()
                prefs.setActiveSessionId(sessionId)
                prefs.setBlockActive(true)
                scope.launch {
                    val now = System.currentTimeMillis()
                    db.lockSessionDao().upsert(
                        LockSessionEntity(
                            id = sessionId,
                            taskId = prefs.getActiveTaskId().orEmpty(),
                            isActive = true,
                            startedAt = now,
                            scheduledStartTime = 0L,
                            scheduledEndTime = Long.MAX_VALUE,
                            durationMinutes = 0,
                            isStrict = false,
                            allowedWeekDays = 0b1111111,
                            locationTriggerJson = null,
                            verificationHash = OfflineSyncManager.sessionHash(
                                sessionId,
                                now,
                                Long.MAX_VALUE,
                                0,
                            ),
                            sessionGroupId = sessionId,
                        ),
                    )
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    reactContext.startForegroundService(intent)
                } else {
                    reactContext.startService(intent)
                }
            } else {
                prefs.setBlockActive(false)
                reactContext.stopService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("TOGGLE_SHIELD_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun isShieldActive(promise: Promise) {
        promise.resolve(prefs.isShieldActive())
    }

    @ReactMethod
    fun getBlockedPackages(promise: Promise) {
        try {
            val arr = Arguments.createArray()
            prefs.getBlockedApps().forEach { arr.pushString(it) }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("GET_BLOCKED_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getBlockedDomains(promise: Promise) {
        try {
            val arr = Arguments.createArray()
            prefs.getBlockedDomains().forEach { arr.pushString(it) }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("GET_DOMAINS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getShieldStatus(promise: Promise) {
        try {
            val map = Arguments.createMap().apply {
                putBoolean("isAccessibilityEnabled", isAccessibilityServiceEnabled())
                putBoolean("isOverlayGranted", Settings.canDrawOverlays(reactContext))
                putBoolean("isUsageStatsGranted", hasUsageStatsPermission())
                putBoolean("isBatteryOptimizationExempt", isBatteryExempt())
                putBoolean("isBlockActive", prefs.isBlockActive())
                putBoolean("isShieldActive", prefs.isShieldActive())
                putBoolean("isOnBreak", prefs.isOnBreak())
                putString("activeTaskId", prefs.getActiveTaskId())
                putInt("xCreditsBalance", prefs.getXCreditsBalance())
                putBoolean("permissionsHealthy", prefs.arePermissionsHealthy())
                putBoolean("deviceAdminEnabled", prefs.isDeviceAdminEnabled())
                putInt("xscore", prefs.getLocalXScore())
                putBoolean("breaksDisabled", prefs.areBreaksDisabled())
                putBoolean("punishmentActive", prefs.isPunishmentActive())
                putInt("sessionTamperCount", prefs.getSessionTamperCount())
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SHIELD_STATUS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun startFocusSession(
        taskId: String,
        durationMinutes: Int,
        isStrict: Boolean,
        domainsJson: String,
        promise: Promise,
    ) {
        try {
            val domains = parseJsonStringArray(domainsJson)
            if (domains.isNotEmpty()) {
                prefs.saveBlockedDomains(domains.toSet())
            } else if (prefs.getBlockedDomains().isEmpty()) {
                prefs.saveBlockedDomains(
                    setOf(
                        "youtube.com",
                        "instagram.com",
                        "tiktok.com",
                        "twitter.com",
                        "x.com",
                        "reddit.com",
                        "twitch.tv",
                    ),
                )
            }

            prefs.setActiveTaskId(taskId)
            prefs.setShieldActive(true)
            prefs.setBlockActive(true)
            prefs.setBreakUntil(null)
            prefs.clearSessionTamperState()

            val sessionId = UUID.randomUUID().toString()
            prefs.setActiveSessionId(sessionId)

            val now = System.currentTimeMillis()
            val mins = durationMinutes.coerceAtLeast(1)
            val end = now + TimeUnit.MINUTES.toMillis(mins.toLong())
            scope.launch {
                db.lockSessionDao().upsert(
                    LockSessionEntity(
                        id = sessionId,
                        taskId = taskId,
                        isActive = true,
                        startedAt = now,
                        scheduledStartTime = now,
                        scheduledEndTime = end,
                        durationMinutes = mins,
                        isStrict = isStrict,
                        allowedWeekDays = 0b1111111,
                        locationTriggerJson = null,
                        verificationHash = OfflineSyncManager.sessionHash(
                            taskId,
                            now,
                            end,
                            mins,
                        ),
                        sessionGroupId = sessionId,
                    ),
                )
                val startedIso = OfflineSyncManager.isoUtc(now)
                sync.enqueue(
                    "POST /api/session/reconcile",
                    JSONObject()
                        .put("taskId", taskId)
                        .put("userId", prefs.getSyncUserId() ?: JSONObject.NULL)
                        .put("durationMinutes", mins)
                        .put("isStrict", isStrict)
                        .put("startedAt", startedIso)
                        .put("source", "xecute_android")
                        .put(
                            "sessionOverride",
                            JSONObject()
                                .put("taskId", taskId)
                                .put("scopedDurationSeconds", mins * 60)
                                .put("activeDurationSeconds", 0)
                                .put("startedAt", startedIso)
                                .put("endedAt", JSONObject.NULL)
                                .put("source", "xecute_android"),
                        )
                        .toString(),
                )
            }

            val intent = Intent(reactContext, XecuteDaemonService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("START_FOCUS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun endFocusSession(taskId: String, completed: Boolean, promise: Promise) {
        try {
            prefs.setActiveTaskId(null)
            prefs.setBlockActive(false)
            // Keep shield preference unless user turned it off; stop active lock window.
            val sessionId = prefs.getActiveSessionId()
            val tamperCount = prefs.getSessionTamperCount()
            if (sessionId != null) {
                scope.launch {
                    val existing = db.lockSessionDao().getActiveSession()
                    if (existing != null) {
                        db.lockSessionDao().upsert(existing.copy(isActive = false))
                    }
                    val endedAtMs = System.currentTimeMillis()
                    val endedIso = OfflineSyncManager.isoUtc(endedAtMs)
                    val existingSession = db.lockSessionDao().getById(sessionId)
                    val scopedSecs =
                        if (existingSession != null && existingSession.durationMinutes > 0) {
                            existingSession.durationMinutes * 60
                        } else {
                            1800
                        }
                    val startedAtMs = existingSession?.startedAt ?: endedAtMs
                    val wallSecs = ((endedAtMs - startedAtMs) / 1000L).coerceAtLeast(0)
                    val activeSecs = if (completed) scopedSecs else 0
                    sync.enqueue(
                        "POST /api/session/reconcile",
                        JSONObject()
                            .put("taskId", taskId)
                            .put("userId", prefs.getSyncUserId() ?: JSONObject.NULL)
                            .put("completed", completed)
                            .put("endedAt", endedIso)
                            .put("tamperAttempts", existingSession?.tamperingAttempts ?: tamperCount)
                            .put("xscoreDelta", existingSession?.xscoreDelta ?: 0)
                            .put("source", "xecute_android")
                            .put(
                                "sessionOverride",
                                JSONObject()
                                    .put("taskId", taskId)
                                    .put("scopedDurationSeconds", scopedSecs)
                                    .put("activeDurationSeconds", activeSecs)
                                    .put("wallClockSeconds", wallSecs)
                                    .put(
                                        "startedAt",
                                        OfflineSyncManager.isoUtc(startedAtMs),
                                    )
                                    .put("endedAt", endedIso)
                                    .put("source", "xecute_android"),
                            )
                            .toString(),
                    )
                }
            }
            prefs.clearSessionTamperState()
            prefs.setActiveSessionId(null)
            if (!prefs.isShieldActive()) {
                reactContext.stopService(Intent(reactContext, XecuteDaemonService::class.java))
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("END_FOCUS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        scope.launch {
            try {
                val pm = reactContext.packageManager
                val selfPkg = reactContext.packageName
                val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                    .asSequence()
                    .filter { info ->
                        info.packageName != selfPkg &&
                            !info.packageName.startsWith("android.") &&
                            (info.flags and ApplicationInfo.FLAG_SYSTEM) == 0
                    }
                    .map { info ->
                        val map = Arguments.createMap()
                        map.putString("appName", pm.getApplicationLabel(info).toString())
                        map.putString("packageName", info.packageName)
                        try {
                            val icon = pm.getApplicationIcon(info.packageName)
                            map.putString("icon", bitmapToBase64(drawableToBitmap(icon)))
                        } catch (_: Exception) {
                            map.putNull("icon")
                        }
                        map
                    }
                    .toList()

                val result: WritableArray = Arguments.createArray()
                apps.forEach { result.pushMap(it) }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("GET_APPS_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun requestBreak(minutes: Int, promise: Promise) {
        try {
            if (prefs.isPunishmentActive()) {
                promise.reject("BREAK_DENIED", "Focus lock punishment active")
                return
            }
            if (prefs.areBreaksDisabled()) {
                promise.reject("BREAK_DENIED", "Breaks disabled after permission tampering")
                return
            }
            val until = System.currentTimeMillis() + TimeUnit.MINUTES.toMillis(minutes.toLong())
            prefs.setBreakUntil(until)
            val sessionId = prefs.getActiveSessionId()
            if (sessionId != null) {
                scope.launch {
                    db.lockSessionDao().setBreakUntil(sessionId, until)
                }
            }
            mainHandler.postDelayed({
                prefs.setBreakUntil(null)
                val sid = prefs.getActiveSessionId()
                if (sid != null) {
                    scope.launch { db.lockSessionDao().setBreakUntil(sid, null) }
                }
            }, TimeUnit.MINUTES.toMillis(minutes.toLong()))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("REQUEST_BREAK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getXCreditsBalance(promise: Promise) {
        promise.resolve(prefs.getXCreditsBalance())
    }

    @ReactMethod
    fun earnXCredits(amount: Int, promise: Promise) {
        try {
            val add = amount.coerceAtLeast(0)
            val next = prefs.getXCreditsBalance() + add
            prefs.setXCreditsBalance(next)
            scope.launch {
                sync.recordLocalEarn(add)
                sync.mirrorWallet(next)
            }
            promise.resolve(next)
        } catch (e: Exception) {
            promise.reject("EARN_XCREDITS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun burnXCredits(amount: Int, promise: Promise) {
        try {
            val burn = amount.coerceAtLeast(0)
            if (!prefs.burnXCredits(burn)) {
                promise.reject("INSUFFICIENT_XCREDITS", "Not enough XCredits")
                return
            }
            val next = prefs.getXCreditsBalance()
            scope.launch {
                sync.recordLocalBurn(burn)
                sync.mirrorWallet(next)
                sync.enqueue(
                    "POST /api/credits/burn",
                    JSONObject()
                        .put("userId", prefs.getSyncUserId() ?: JSONObject.NULL)
                        .put("amount", burn)
                        .put("reason", "Shield break")
                        .toString(),
                )
            }
            promise.resolve(next)
        } catch (e: Exception) {
            promise.reject("BURN_XCREDITS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun setXCreditsBalance(balance: Int, promise: Promise) {
        try {
            prefs.setXCreditsBalance(balance)
            scope.launch { sync.applyServerBalance(balance) }
            promise.resolve(prefs.getXCreditsBalance())
        } catch (e: Exception) {
            promise.reject("SET_XCREDITS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun configureOfflineSync(
        apiBaseUrl: String?,
        authToken: String?,
        userId: String?,
        promise: Promise,
    ) {
        try {
            prefs.configureOfflineSync(apiBaseUrl, authToken, userId)
            if (!userId.isNullOrBlank()) {
                scope.launch { sync.mirrorWallet(prefs.getXCreditsBalance()) }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("CONFIGURE_SYNC_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun flushOfflineSync(promise: Promise) {
        scope.launch {
            try {
                val n = sync.syncPendingItems()
                promise.resolve(n)
            } catch (e: Exception) {
                promise.reject("FLUSH_SYNC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getPendingSyncItems(promise: Promise) {
        scope.launch {
            try {
                val items = sync.pendingItems(50)
                val arr = Arguments.createArray()
                items.forEach { item ->
                    arr.pushMap(
                        Arguments.createMap().apply {
                            putDouble("id", item.id.toDouble())
                            putString("endpoint", item.endpoint)
                            putString("payload", item.payload)
                            putString("idempotencyKey", item.idempotencyKey)
                            putInt("retryCount", item.retryCount)
                        },
                    )
                }
                promise.resolve(arr)
            } catch (e: Exception) {
                promise.reject("GET_PENDING_SYNC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun markSyncItemDone(id: Double, promise: Promise) {
        scope.launch {
            try {
                sync.markSynced(id.toLong())
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("MARK_SYNC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun bumpSyncItemRetry(id: Double, promise: Promise) {
        scope.launch {
            try {
                sync.bumpRetry(id.toLong())
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("BUMP_SYNC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getPendingXCreditsBurn(promise: Promise) {
        promise.resolve(prefs.getPendingBurnAmount())
    }

    @ReactMethod
    fun clearPendingXCreditsBurn(amount: Int, promise: Promise) {
        try {
            prefs.clearPendingBurn(amount)
            promise.resolve(prefs.getPendingBurnAmount())
        } catch (e: Exception) {
            promise.reject("CLEAR_PENDING_BURN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun requestDeviceAdmin(promise: Promise) {
        try {
            val component = android.content.ComponentName(
                reactContext,
                XecuteDeviceAdminReceiver::class.java,
            )
            val intent = Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, component)
                putExtra(
                    android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Protects your focus mission from uninstall while Shield is active.",
                )
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DEVICE_ADMIN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }

    fun emitAppBlocked(packageName: String) {
        if (!reactContext.hasActiveReactInstance()) return
        val payload: WritableMap = Arguments.createMap().apply {
            putString("packageName", packageName)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onAppBlocked", payload)
    }

    private fun parseJsonStringArray(json: String): List<String> {
        val arr = JSONArray(json)
        return (0 until arr.length()).map { arr.getString(it) }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val am = reactContext.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        if (!am.isEnabled) return false
        val expected = "${reactContext.packageName}/${XecuteAccessibilityService::class.java.canonicalName}"
        val enabled = Settings.Secure.getString(
            reactContext.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    private fun hasUsageStatsPermission(): Boolean {
        val appOps = reactContext.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                reactContext.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                reactContext.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun isBatteryExempt(): Boolean {
        val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
    }

    private fun drawableToBitmap(drawable: Drawable): Bitmap {
        if (drawable is BitmapDrawable && drawable.bitmap != null) {
            return drawable.bitmap
        }
        val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
        val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }

    private fun bitmapToBase64(bitmap: Bitmap): String {
        val scaled = Bitmap.createScaledBitmap(bitmap, 96, 96, true)
        val stream = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.PNG, 80, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    companion object {
        @Volatile
        var instance: XecuteBlockerModule? = null
    }

    init {
        instance = this
    }
}

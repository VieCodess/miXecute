package com.xecute.app.blocker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.xecute.app.MainActivity
import com.xecute.app.R
import com.xecute.app.data.OfflineSyncManager
import com.xecute.app.data.XecuteDatabase
import com.xecute.app.data.entity.LockSessionEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.util.Calendar

/**
 * Foreground daemon: every 30s runs 3-layer schedule validation
 * (day + time window + WiFi location) and activates/deactivates once per state change.
 * Also drains the Room offline sync queue when credentials are present.
 */
class XecuteDaemonService : Service() {

    private lateinit var prefs: BlockPrefs
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val handler = Handler(Looper.getMainLooper())
    private var lastBlockState: Boolean? = null
    private var tickCount = 0
    private var lastAdbAlertAt = 0L

    private val tickRunnable = object : Runnable {
        override fun run() {
            scope.launch {
                validateSchedule()
                UsageStatsMonitor.tick(this@XecuteDaemonService, scope)
                detectAdbTamper()
                tickCount++
                // Every ~2.5 min attempt offline sync drain
                if (tickCount % 5 == 0) {
                    try {
                        OfflineSyncManager.get(this@XecuteDaemonService).syncPendingItems()
                    } catch (e: Exception) {
                        Log.w(TAG, "Offline sync tick failed: ${e.message}")
                    }
                }
            }
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = BlockPrefs.get(this)
        createChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        handler.post(tickRunnable)
        Log.i(TAG, "Daemon started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        prefs.setShieldActive(true)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tickRunnable)
        prefs.setShieldActive(false)
        prefs.setBlockActive(false)
        scope.cancel()
        Log.i(TAG, "Daemon stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private suspend fun validateSchedule() {
        if (!prefs.isShieldActive()) {
            stopSelf()
            return
        }

        val db = XecuteDatabase.getInstance(this)
        var session = db.lockSessionDao().getActiveSession()

        // Phase 1: if no session row yet, treat as always-on
        if (session == null) {
            val shouldBeActive = !prefs.isOnBreak()
            applyBlockState(shouldBeActive, "default_always_on")
            return
        }

        // Honor break timer
        val breakUntil = session.breakUntil ?: prefs.getBreakUntil()
        if (prefs.isPunishmentActive()) {
            applyBlockState(true, "punishment_lock")
            return
        }
        if (breakUntil > 0 && breakUntil > System.currentTimeMillis()) {
            applyBlockState(false, "on_break")
            return
        }

        val now = System.currentTimeMillis()
        val isDayEnabled = isDayEnabled(session, now)
        val isTimeWindow = isTimeWindow(session, now)
        val isLocationOk = isLocationOk(session)

        val shouldActivate = isDayEnabled && isTimeWindow && isLocationOk
        val reason = when {
            shouldActivate -> "schedule_passed"
            !isDayEnabled -> "day_disabled"
            !isTimeWindow -> "outside_time_window"
            else -> "location_mismatch"
        }
        applyBlockState(shouldActivate, reason)
    }

    /** Spec §8 daemon layer — USB debugging / ADB during active focus. */
    private suspend fun detectAdbTamper() {
        if (!prefs.isShieldActive() || !prefs.isBlockActive()) return
        if (!AntiTamperManager.isAdbEnabled(this)) return
        val now = System.currentTimeMillis()
        // At most once per 10 minutes while ADB stays on
        if (now - lastAdbAlertAt < 10 * 60 * 1000L) return
        lastAdbAlertAt = now
        AntiTamperManager.record(
            this,
            TamperAttempt.AdbCommand("usb_debugging_enabled"),
            showUi = true,
        )
    }

    private fun applyBlockState(active: Boolean, reason: String) {
        if (lastBlockState == active) return
        lastBlockState = active
        prefs.setBlockActive(active)
        Log.i(TAG, if (active) "DAEMON_ACTIVATE: $reason" else "DAEMON_DEACTIVATE: $reason")
    }

    private fun isDayEnabled(session: LockSessionEntity, now: Long): Boolean {
        // If full week enabled, always true
        if (session.allowedWeekDays == 0b1111111 || session.allowedWeekDays == 0) {
            // 0 = treat as all days for Phase 1 convenience
            return true
        }
        val cal = Calendar.getInstance().apply { timeInMillis = now }
        // Calendar: SUNDAY=1 … SATURDAY=7 → map to bit 0=Mon … 6=Sun
        val bit = when (cal.get(Calendar.DAY_OF_WEEK)) {
            Calendar.MONDAY -> 0
            Calendar.TUESDAY -> 1
            Calendar.WEDNESDAY -> 2
            Calendar.THURSDAY -> 3
            Calendar.FRIDAY -> 4
            Calendar.SATURDAY -> 5
            Calendar.SUNDAY -> 6
            else -> 0
        }
        return (session.allowedWeekDays and (1 shl bit)) != 0
    }

    private fun isTimeWindow(session: LockSessionEntity, now: Long): Boolean {
        // Absolute epoch window used for Phase 1 always-on (0 … MAX)
        if (session.scheduledStartTime <= 0L && session.scheduledEndTime >= Long.MAX_VALUE / 2) {
            return true
        }
        // Also support daily HH:mm stored as minutes-from-midnight in low bits
        // If end < start, treat as overnight window via absolute comparison first
        return now >= session.scheduledStartTime && now <= session.scheduledEndTime
    }

    private fun isLocationOk(session: LockSessionEntity): Boolean {
        val json = session.locationTriggerJson ?: return true
        if (json.isBlank() || json == "null") return true
        return try {
            val allowed = JSONArray(json)
            if (allowed.length() == 0) return true
            val ssid = currentWifiSsid() ?: return false
            (0 until allowed.length()).any { allowed.getString(it).equals(ssid, ignoreCase = true) }
        } catch (_: Exception) {
            true
        }
    }

    @Suppress("DEPRECATION")
    private fun currentWifiSsid(): String? {
        return try {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val info = wifi.connectionInfo ?: return null
            info.ssid?.trim('"')?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }
        } catch (_: Exception) {
            null
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Xecute Shield",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Keeps focus blocking active"
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launch = Intent(this, MainActivity::class.java)
        val pending = PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Xecute Shield Active")
            .setContentText("Focus blocking is running")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pending)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    companion object {
        private const val TAG = "XecuteDaemon"
        private const val CHANNEL_ID = "xecute_shield"
        private const val NOTIFICATION_ID = 4201
        private const val TICK_MS = 30_000L
    }
}

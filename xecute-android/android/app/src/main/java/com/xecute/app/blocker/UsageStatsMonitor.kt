package com.xecute.app.blocker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.xecute.app.MainActivity
import com.xecute.app.R
import com.xecute.app.data.XecuteDatabase
import com.xecute.app.data.entity.AppSwitchEventEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Secondary daemon layer: UsageEvents audit + permission revocation detection.
 */
object UsageStatsMonitor {
    private const val TAG = "UsageStatsMonitor"
    private const val CHANNEL_ID = "xecute_permission_alerts"
    private const val NOTIF_PERM = 42
    private var lastPermissionAlertAt = 0L
    private var lastAuditAt = 0L
    private var lastKnownHealthy = true

    fun tick(context: Context, scope: CoroutineScope) {
        val now = System.currentTimeMillis()
        if (now - lastAuditAt >= 60_000L) {
            lastAuditAt = now
            scope.launch { auditRecentEvents(context) }
            checkPermissionsStillGranted(context, scope)
        }
    }

    private suspend fun auditRecentEvents(context: Context, lookbackMs: Long = 60_000L) {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return
        val end = System.currentTimeMillis()
        val begin = end - lookbackMs
        val events = usm.queryEvents(begin, end)
        val event = UsageEvents.Event()
        val prefs = BlockPrefs.get(context)
        if (!prefs.isShieldActive() || !prefs.isBlockActive() || prefs.isOnBreak()) return

        val sessionId = prefs.getActiveSessionId() ?: return
        val db = XecuteDatabase.getInstance(context)

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType != UsageEvents.Event.MOVE_TO_FOREGROUND) continue
            val pkg = event.packageName ?: continue
            if (pkg == context.packageName) continue
            if (!prefs.isPackageBlocked(pkg)) continue
            try {
                db.appSwitchEventDao().insert(
                    AppSwitchEventEntity(
                        sessionId = sessionId,
                        packageName = pkg,
                        action = "USAGE_FOREGROUND",
                        timestamp = event.timeStamp,
                        durationMs = 0,
                    ),
                )
            } catch (e: Exception) {
                Log.w(TAG, "audit insert failed: ${e.message}")
            }
        }
    }

    fun checkPermissionsStillGranted(context: Context, scope: CoroutineScope): Boolean {
        val prefs = BlockPrefs.get(context)
        val accessibilityOk = isAccessibilityEnabled(context)
        val overlayOk = Settings.canDrawOverlays(context)
        val usageOk = hasUsageStats(context)

        val allOk = accessibilityOk && overlayOk && usageOk
        prefs.setPermissionsHealthy(allOk)

        if (!allOk && prefs.isShieldActive()) {
            maybeNotifyPermissionDrop(context, accessibilityOk, overlayOk, usageOk)
            val missing = buildList {
                if (!accessibilityOk) add("Accessibility")
                if (!overlayOk) add("Overlay")
                if (!usageOk) add("Usage access")
            }.joinToString(", ")
            // Only escalate when transitioning healthy → unhealthy (avoid spam every minute)
            if (lastKnownHealthy) {
                scope.launch {
                    AntiTamperManager.record(
                        context,
                        TamperAttempt.PermissionRevocation(missing),
                        showUi = true,
                    )
                }
            }
        }
        lastKnownHealthy = allOk
        return allOk
    }

    private fun maybeNotifyPermissionDrop(
        context: Context,
        accessibilityOk: Boolean,
        overlayOk: Boolean,
        usageOk: Boolean,
    ) {
        val now = System.currentTimeMillis()
        if (now - lastPermissionAlertAt < 60_000L) return
        lastPermissionAlertAt = now

        val missing = buildList {
            if (!accessibilityOk) add("Accessibility")
            if (!overlayOk) add("Overlay")
            if (!usageOk) add("Usage access")
        }.joinToString(", ")

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Shield permission alerts",
                    NotificationManager.IMPORTANCE_HIGH,
                ),
            )
        }

        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notif = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Xecute Shield permissions dropped")
            .setContentText("Restore: $missing")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(NOTIF_PERM, notif)
    }

    private fun isAccessibilityEnabled(context: Context): Boolean {
        val expected =
            "${context.packageName}/${XecuteAccessibilityService::class.java.canonicalName}"
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ) ?: return false
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    private fun hasUsageStats(context: Context): Boolean {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return false
        val end = System.currentTimeMillis()
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, end - 60_000L, end)
        return stats != null && stats.isNotEmpty()
    }
}

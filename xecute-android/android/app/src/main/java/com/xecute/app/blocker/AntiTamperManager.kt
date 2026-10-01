package com.xecute.app.blocker

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Log
import com.xecute.app.data.OfflineSyncManager
import com.xecute.app.data.XecuteDatabase
import com.xecute.app.data.entity.TamperEventEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Spec §8 Anti-Tamper & Anti-Cheat — detection types, punishment tiers, XScore.
 */
sealed class TamperAttempt {
    abstract val type: String
    abstract val detail: String
    abstract val xscoreImpact: Int

    data class SettingsNavigation(val targetComponent: String) : TamperAttempt() {
        override val type = "settings_navigation"
        override val detail = targetComponent
        override val xscoreImpact: Int
            get() = -1
    }

    data class PermissionRevocation(val permission: String) : TamperAttempt() {
        override val type = "permission_revocation"
        override val detail = permission
        override val xscoreImpact: Int
            get() = -2
    }

    data class AdbCommand(val command: String = "usb_debugging") : TamperAttempt() {
        override val type = "adb_debug"
        override val detail = command
        override val xscoreImpact: Int
            get() = -25
    }

    data class DeviceAdminRevoke(val note: String = "device_admin_disabled") : TamperAttempt() {
        override val type = "device_admin_revoke"
        override val detail = note
        override val xscoreImpact: Int
            get() = -10
    }

    data class ClockManipulation(val note: String) : TamperAttempt() {
        override val type = "clock_manipulation"
        override val detail = note
        override val xscoreImpact: Int
            get() = -50
    }

    fun toJson(at: Long = System.currentTimeMillis()): JSONObject =
        JSONObject()
            .put("type", type)
            .put("detail", detail)
            .put("xscoreImpact", xscoreImpact)
            .put("at", at)
}

enum class TamperAction {
    SILENT_LOG,
    WARNING_OVERLAY,
    LOCK_10M,
    DISABLE_BREAKS,
}

data class TamperOutcome(
    val attemptNumber: Int,
    val action: TamperAction,
    val xscoreDelta: Int,
    val title: String?,
    val message: String?,
)

object AntiTamperManager {
    private const val TAG = "AntiTamper"
    private const val PUNISH_MS = 10 * 60 * 1000L
    private const val WARN_BLOCK_MS = 5 * 60 * 1000L

    fun resolveOutcome(attempt: TamperAttempt, priorAttempts: Int): TamperOutcome {
        val next = priorAttempts + 1
        return when (attempt) {
            is TamperAttempt.AdbCommand ->
                TamperOutcome(
                    next,
                    TamperAction.LOCK_10M,
                    attempt.xscoreImpact,
                    "Debug mode blocked",
                    "USB debugging detected during focus. Shield locked for 10 minutes.",
                )
            is TamperAttempt.ClockManipulation ->
                TamperOutcome(
                    next,
                    TamperAction.LOCK_10M,
                    attempt.xscoreImpact,
                    "Session rejected",
                    "Impossible timestamps detected. No XCredits for this session.",
                )
            is TamperAttempt.PermissionRevocation ->
                when {
                    next >= 2 ->
                        TamperOutcome(
                            next,
                            TamperAction.DISABLE_BREAKS,
                            -10,
                            "Permissions revoked",
                            "Breaks disabled for this session. Restore Accessibility/Overlay.",
                        )
                    else ->
                        TamperOutcome(
                            next,
                            TamperAction.WARNING_OVERLAY,
                            attempt.xscoreImpact,
                            "Shield permissions dropped",
                            "Restore ${attempt.permission} or focus integrity drops.",
                        )
                }
            is TamperAttempt.DeviceAdminRevoke ->
                TamperOutcome(
                    next,
                    TamperAction.WARNING_OVERLAY,
                    attempt.xscoreImpact,
                    "Uninstall protection off",
                    "Device admin disabled mid-mission. Re-enable from Shield.",
                )
            is TamperAttempt.SettingsNavigation ->
                when {
                    next >= 3 ->
                        TamperOutcome(
                            next,
                            TamperAction.LOCK_10M,
                            -5,
                            "Focus lock engaged",
                            "Repeated tampering. Shield stays locked for 10 minutes.",
                        )
                    next == 2 ->
                        TamperOutcome(
                            next,
                            TamperAction.WARNING_OVERLAY,
                            -5,
                            "Warning",
                            "Settings blocked during focus. Another attempt intensifies lock.",
                        )
                    else ->
                        TamperOutcome(
                            next,
                            TamperAction.SILENT_LOG,
                            attempt.xscoreImpact,
                            null,
                            null,
                        )
                }
        }
    }

    suspend fun record(
        context: Context,
        attempt: TamperAttempt,
        showUi: Boolean = true,
    ): TamperOutcome = withContext(Dispatchers.IO) {
        val prefs = BlockPrefs.get(context)
        val db = XecuteDatabase.getInstance(context)
        val sessionId = prefs.getActiveSessionId()
        val prior = if (sessionId != null) {
            db.lockSessionDao().getById(sessionId)?.tamperingAttempts ?: 0
        } else {
            prefs.getSessionTamperCount()
        }

        val outcome = resolveOutcome(attempt, prior)
        val now = System.currentTimeMillis()

        prefs.setSessionTamperCount(outcome.attemptNumber)
        prefs.addLocalXScore(outcome.xscoreDelta)

        if (sessionId != null) {
            db.lockSessionDao().recordTamper(sessionId, now)
            val session = db.lockSessionDao().getById(sessionId)
            if (session != null) {
                val log = try {
                    JSONArray(session.tamperLogJson.ifBlank { "[]" })
                } catch (_: Exception) {
                    JSONArray()
                }
                log.put(attempt.toJson(now))
                db.lockSessionDao().update(
                    session.copy(
                        tamperLogJson = log.toString(),
                        breaksDisabled = session.breaksDisabled ||
                            outcome.action == TamperAction.DISABLE_BREAKS,
                        xscoreDelta = session.xscoreDelta + outcome.xscoreDelta,
                    ),
                )
            }
            if (outcome.action == TamperAction.DISABLE_BREAKS) {
                prefs.setBreaksDisabled(true)
                prefs.setBreakUntil(null)
            }
        } else if (outcome.action == TamperAction.DISABLE_BREAKS) {
            prefs.setBreaksDisabled(true)
            prefs.setBreakUntil(null)
        }

        when (outcome.action) {
            TamperAction.LOCK_10M -> {
                prefs.setBreakUntil(null)
                prefs.setPunishmentUntil(now + PUNISH_MS)
                prefs.setBlockActive(true)
                // Spec: 2nd settings also blocks 5m — covered by overlay; 3rd = 10m
            }
            TamperAction.WARNING_OVERLAY -> {
                if (attempt is TamperAttempt.SettingsNavigation && outcome.attemptNumber == 2) {
                    prefs.setPunishmentUntil(now + WARN_BLOCK_MS)
                    prefs.setBlockActive(true)
                }
            }
            else -> Unit
        }

        val eventId = db.tamperEventDao().insert(
            TamperEventEntity(
                sessionId = sessionId,
                taskId = prefs.getActiveTaskId(),
                type = attempt.type,
                detail = attempt.detail,
                xscoreImpact = outcome.xscoreDelta,
                action = outcome.action.name,
                createdAt = now,
            ),
        )

        try {
            val payload = JSONObject()
                .put("userId", prefs.getSyncUserId())
                .put("taskId", prefs.getActiveTaskId())
                .put("sessionId", sessionId)
                .put("eventId", eventId)
                .put("type", attempt.type)
                .put("detail", attempt.detail)
                .put("xscoreImpact", outcome.xscoreDelta)
                .put("action", outcome.action.name)
                .put("attemptNumber", outcome.attemptNumber)
                .put("timestamp", now)
                .put("source", "xecute_android")
            OfflineSyncManager.get(context).enqueue(
                endpoint = "POST /api/tamper/report",
                payload = payload.toString(),
                idempotencyKey = "tamper_${attempt.type}_${sessionId ?: "none"}_${eventId}_$now",
            )
        } catch (e: Exception) {
            Log.w(TAG, "enqueue tamper failed: ${e.message}")
        }

        Log.w(
            TAG,
            "tamper type=${attempt.type} attempt=${outcome.attemptNumber} " +
                "action=${outcome.action} xscore=${outcome.xscoreDelta}",
        )

        if (showUi && outcome.title != null && outcome.message != null) {
            showTamperOverlay(context, outcome.title, outcome.message)
        }

        // Settings: always bounce home
        if (attempt is TamperAttempt.SettingsNavigation) {
            // Accessibility already fires GLOBAL_ACTION_HOME; no-op here
        }

        outcome
    }

    fun showTamperOverlay(context: Context, title: String, message: String) {
        val intent = Intent(context, BlockOverlayActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(BlockOverlayActivity.EXTRA_PACKAGE, context.packageName)
            putExtra(BlockOverlayActivity.EXTRA_MODE, BlockOverlayActivity.MODE_TAMPER)
            putExtra(BlockOverlayActivity.EXTRA_TITLE, title)
            putExtra(BlockOverlayActivity.EXTRA_MESSAGE, message)
        }
        context.startActivity(intent)
    }

    /** Spec daemon layer: USB debugging / ADB. */
    fun isAdbEnabled(context: Context): Boolean {
        return try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
        } catch (_: Exception) {
            false
        }
    }
}

package com.xecute.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "blocked_apps")
data class BlockedAppEntity(
    @PrimaryKey val packageName: String,
    val appName: String,
    val iconBase64: String? = null,
    val isBlocked: Boolean,
    val addedAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "blocked_domains")
data class BlockedDomainEntity(
    @PrimaryKey val domain: String,
    val isBlocked: Boolean,
    val addedAt: Long = System.currentTimeMillis(),
)

@Entity(
    tableName = "lock_sessions",
    indices = [Index("isActive"), Index("startedAt")],
)
data class LockSessionEntity(
    @PrimaryKey val id: String,
    val taskId: String = "",
    val isActive: Boolean,
    val startedAt: Long,
    val scheduledStartTime: Long,
    val scheduledEndTime: Long,
    val durationMinutes: Int = 0,
    val isStrict: Boolean = false,
    /** Bitflag Mon=1<<0 … Sun=1<<6; default all days = 0b1111111 */
    val allowedWeekDays: Int = 0b1111111,
    val locationTriggerJson: String? = null,
    val verificationHash: String = "",
    val lastInterruptedAt: Long? = null,
    val resumeCount: Int = 0,
    val sessionGroupId: String = "",
    val appSwitchCount: Int = 0,
    val tamperingAttempts: Int = 0,
    val lastTamperTime: Long? = null,
    /** JSON array of TamperAttempt logs (spec AppBlock Fix #5). */
    val tamperLogJson: String = "[]",
    /** Spec: repeat permission revoke disables breaks for the session. */
    val breaksDisabled: Boolean = false,
    /** Cumulative XScore delta applied during this session (negative = penalties). */
    val xscoreDelta: Int = 0,
    val breakUntil: Long? = null,
)

@Entity(
    tableName = "tamper_events",
    indices = [Index("sessionId"), Index("isSyncedToBackend")],
)
data class TamperEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: String? = null,
    val taskId: String? = null,
    val type: String,
    val detail: String = "",
    val xscoreImpact: Int = 0,
    val action: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val isSyncedToBackend: Boolean = false,
)

@Entity(tableName = "app_switch_events")
data class AppSwitchEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: String,
    val packageName: String,
    val action: String,
    val timestamp: Long,
    val durationMs: Long = 0,
    val isSyncedToBackend: Boolean = false,
)

@Entity(tableName = "xcredits_wallet")
data class XCreditsWalletEntity(
    @PrimaryKey val userId: String,
    val currentBalance: Int,
    val totalEarnedLifetime: Int = 0,
    val totalBurnedToday: Int = 0,
    val lastSyncedAt: Long = System.currentTimeMillis(),
    val lastReconciliation: Long = System.currentTimeMillis(),
    val serverAuthorityBalance: Int? = null,
)

@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val endpoint: String,
    val payload: String,
    val idempotencyKey: String,
    val isSynced: Boolean = false,
    val retryCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val lastRetryAt: Long? = null,
)

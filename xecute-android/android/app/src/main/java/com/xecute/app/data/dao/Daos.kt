package com.xecute.app.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.xecute.app.data.entity.AppSwitchEventEntity
import com.xecute.app.data.entity.BlockedAppEntity
import com.xecute.app.data.entity.BlockedDomainEntity
import com.xecute.app.data.entity.LockSessionEntity
import com.xecute.app.data.entity.SyncQueueEntity
import com.xecute.app.data.entity.TamperEventEntity
import com.xecute.app.data.entity.XCreditsWalletEntity

@Dao
interface BlocklistDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertApps(apps: List<BlockedAppEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDomains(domains: List<BlockedDomainEntity>)

    @Query("SELECT * FROM blocked_apps WHERE isBlocked = 1")
    suspend fun getBlockedApps(): List<BlockedAppEntity>

    @Query("SELECT packageName FROM blocked_apps WHERE isBlocked = 1")
    suspend fun getBlockedPackageNames(): List<String>

    @Query("SELECT * FROM blocked_domains WHERE isBlocked = 1")
    suspend fun getBlockedDomains(): List<BlockedDomainEntity>

    @Query("DELETE FROM blocked_apps")
    suspend fun clearApps()

    @Query("DELETE FROM blocked_domains")
    suspend fun clearDomains()
}

@Dao
interface LockSessionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(session: LockSessionEntity)

    @Query("SELECT * FROM lock_sessions WHERE isActive = 1 LIMIT 1")
    suspend fun getActiveSession(): LockSessionEntity?

    @Query("SELECT * FROM lock_sessions WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): LockSessionEntity?

    @Query("SELECT * FROM lock_sessions WHERE startedAt > :since ORDER BY startedAt DESC")
    suspend fun getSessionsSince(since: Long): List<LockSessionEntity>

    @Update
    suspend fun update(session: LockSessionEntity)

    @Query("UPDATE lock_sessions SET breakUntil = :until WHERE id = :id")
    suspend fun setBreakUntil(id: String, until: Long?)

    @Query(
        "UPDATE lock_sessions SET tamperingAttempts = tamperingAttempts + 1, lastTamperTime = :time WHERE id = :id",
    )
    suspend fun recordTamper(id: String, time: Long)

    @Query(
        "UPDATE lock_sessions SET lastInterruptedAt = :at, resumeCount = resumeCount + 1 WHERE id = :id",
    )
    suspend fun recordInterrupt(id: String, at: Long)

    @Query(
        "UPDATE lock_sessions SET appSwitchCount = appSwitchCount + 1 WHERE id = :id",
    )
    suspend fun incrementAppSwitch(id: String)
}

@Dao
interface AppSwitchEventDao {
    @Insert
    suspend fun insert(event: AppSwitchEventEntity): Long

    @Query("SELECT * FROM app_switch_events WHERE isSyncedToBackend = 0 ORDER BY timestamp ASC LIMIT :limit")
    suspend fun getUnsynced(limit: Int = 100): List<AppSwitchEventEntity>

    @Query("UPDATE app_switch_events SET isSyncedToBackend = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<Long>)
}

@Dao
interface XCreditsWalletDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(wallet: XCreditsWalletEntity)

    @Query("SELECT * FROM xcredits_wallet WHERE userId = :userId LIMIT 1")
    suspend fun getWallet(userId: String): XCreditsWalletEntity?

    @Query("SELECT currentBalance FROM xcredits_wallet WHERE userId = :userId")
    suspend fun getBalance(userId: String): Int?

    @Query(
        "UPDATE xcredits_wallet SET currentBalance = currentBalance - :amount, totalBurnedToday = totalBurnedToday + :amount WHERE userId = :userId",
    )
    suspend fun burnCredits(userId: String, amount: Int)

    @Query(
        "UPDATE xcredits_wallet SET currentBalance = currentBalance + :amount, totalEarnedLifetime = totalEarnedLifetime + :amount WHERE userId = :userId",
    )
    suspend fun earnCredits(userId: String, amount: Int)

    @Query(
        "UPDATE xcredits_wallet SET serverAuthorityBalance = :amount, currentBalance = :amount, lastSyncedAt = :now, lastReconciliation = :now WHERE userId = :userId",
    )
    suspend fun updateServerBalance(userId: String, amount: Int, now: Long)
}

@Dao
interface SyncQueueDao {
    @Insert
    suspend fun enqueue(item: SyncQueueEntity): Long

    @Query("SELECT * FROM sync_queue WHERE isSynced = 0 ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getPending(limit: Int = 50): List<SyncQueueEntity>

    @Query("UPDATE sync_queue SET isSynced = 1, lastRetryAt = :now WHERE id = :id")
    suspend fun markSynced(id: Long, now: Long)

    @Query("UPDATE sync_queue SET retryCount = retryCount + 1, lastRetryAt = :now WHERE id = :id")
    suspend fun incrementRetry(id: Long, now: Long)

    @Query("DELETE FROM sync_queue WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface TamperEventDao {
    @Insert
    suspend fun insert(event: TamperEventEntity): Long

    @Query(
        "SELECT * FROM tamper_events WHERE isSyncedToBackend = 0 ORDER BY createdAt ASC LIMIT :limit",
    )
    suspend fun getUnsynced(limit: Int = 50): List<TamperEventEntity>

    @Query("UPDATE tamper_events SET isSyncedToBackend = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<Long>)
}

package com.xecute.app.data

import android.content.Context
import android.util.Log
import com.xecute.app.blocker.BlockPrefs
import com.xecute.app.data.entity.SyncQueueEntity
import com.xecute.app.data.entity.XCreditsWalletEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID

/**
 * Spec Phase 2 — offline-first sync.
 * Queues mutations in Room while offline; drains when API + auth are available.
 */
class OfflineSyncManager(
    context: Context,
) {
    private val appContext = context.applicationContext
    private val db = XecuteDatabase.getInstance(appContext)
    private val prefs = BlockPrefs.get(appContext)

    suspend fun enqueue(
        endpoint: String,
        payload: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): Long = withContext(Dispatchers.IO) {
        db.syncQueueDao().enqueue(
            SyncQueueEntity(
                endpoint = endpoint,
                payload = payload,
                idempotencyKey = idempotencyKey,
            ),
        )
    }

    suspend fun pendingItems(limit: Int = 50): List<SyncQueueEntity> =
        withContext(Dispatchers.IO) {
            db.syncQueueDao().getPending(limit)
        }

    suspend fun markSynced(id: Long) = withContext(Dispatchers.IO) {
        db.syncQueueDao().markSynced(id, System.currentTimeMillis())
    }

    suspend fun bumpRetry(id: Long) = withContext(Dispatchers.IO) {
        db.syncQueueDao().incrementRetry(id, System.currentTimeMillis())
    }

    suspend fun drop(id: Long) = withContext(Dispatchers.IO) {
        db.syncQueueDao().delete(id)
    }

    /** Mirror SharedPreferences XCredits into Room wallet (server-authoritative when online). */
    suspend fun mirrorWallet(balance: Int, serverAuthoritative: Boolean = false) =
        withContext(Dispatchers.IO) {
            val userId = prefs.getSyncUserId() ?: LOCAL_WALLET_USER
            val now = System.currentTimeMillis()
            val existing = db.xCreditsWalletDao().getWallet(userId)
            db.xCreditsWalletDao().upsert(
                XCreditsWalletEntity(
                    userId = userId,
                    currentBalance = balance.coerceAtLeast(0),
                    totalEarnedLifetime = existing?.totalEarnedLifetime ?: 0,
                    totalBurnedToday = existing?.totalBurnedToday ?: 0,
                    lastSyncedAt = now,
                    lastReconciliation = now,
                    serverAuthorityBalance = if (serverAuthoritative) balance else existing?.serverAuthorityBalance,
                ),
            )
        }

    suspend fun recordLocalBurn(amount: Int) = withContext(Dispatchers.IO) {
        val userId = prefs.getSyncUserId() ?: LOCAL_WALLET_USER
        val wallet = db.xCreditsWalletDao().getWallet(userId)
        if (wallet == null) {
            mirrorWallet(prefs.getXCreditsBalance())
        }
        db.xCreditsWalletDao().burnCredits(userId, amount.coerceAtLeast(0))
    }

    suspend fun recordLocalEarn(amount: Int) = withContext(Dispatchers.IO) {
        val userId = prefs.getSyncUserId() ?: LOCAL_WALLET_USER
        val wallet = db.xCreditsWalletDao().getWallet(userId)
        if (wallet == null) {
            mirrorWallet(prefs.getXCreditsBalance())
        }
        db.xCreditsWalletDao().earnCredits(userId, amount.coerceAtLeast(0))
    }

    suspend fun applyServerBalance(balance: Int) = withContext(Dispatchers.IO) {
        val userId = prefs.getSyncUserId() ?: LOCAL_WALLET_USER
        val now = System.currentTimeMillis()
        val existing = db.xCreditsWalletDao().getWallet(userId)
        if (existing == null) {
            db.xCreditsWalletDao().upsert(
                XCreditsWalletEntity(
                    userId = userId,
                    currentBalance = balance,
                    serverAuthorityBalance = balance,
                    lastSyncedAt = now,
                    lastReconciliation = now,
                ),
            )
        } else {
            db.xCreditsWalletDao().updateServerBalance(userId, balance, now)
        }
        prefs.setXCreditsBalance(balance)
    }

    /**
     * Drain Room sync_queue + unsynced app_switch_events over HTTP when auth is configured.
     * Returns how many items were marked synced.
     */
    suspend fun syncPendingItems(): Int = withContext(Dispatchers.IO) {
        val base = prefs.getApiBaseUrl()?.trimEnd('/') ?: return@withContext 0
        val token = prefs.getAuthToken()
        var synced = 0

        // Bundle unsynced switch events into one queue payload if any
        val events = db.appSwitchEventDao().getUnsynced(100)
        if (events.isNotEmpty()) {
            val arr = JSONArray()
            events.forEach { e ->
                arr.put(
                    JSONObject()
                        .put("sessionId", e.sessionId)
                        .put("packageName", e.packageName)
                        .put("action", e.action)
                        .put("timestamp", e.timestamp)
                        .put("durationMs", e.durationMs),
                )
            }
            val batch = JSONObject()
                .put("events", arr)
                .put("userId", prefs.getSyncUserId() ?: JSONObject.NULL)
                .put("taskId", prefs.getActiveTaskId() ?: JSONObject.NULL)
                .put("source", "xecute_android")
            enqueue("POST /api/session/events", batch.toString())
        }

        // Re-queue orphaned tamper rows that never made it into sync_queue
        val orphanTampers = db.tamperEventDao().getUnsynced(50)
        if (orphanTampers.isNotEmpty()) {
            val pendingKeys = db.syncQueueDao().getPending(50)
                .filter { it.endpoint.contains("/tamper/report") }
                .map { it.payload }
            for (t in orphanTampers) {
                val alreadyQueued = pendingKeys.any { it.contains("\"eventId\":${t.id}") }
                if (alreadyQueued) continue
                val payload = JSONObject()
                    .put("userId", prefs.getSyncUserId())
                    .put("taskId", t.taskId ?: prefs.getActiveTaskId())
                    .put("sessionId", t.sessionId)
                    .put("eventId", t.id)
                    .put("type", t.type)
                    .put("detail", t.detail)
                    .put("xscoreImpact", t.xscoreImpact)
                    .put("action", t.action)
                    .put("timestamp", t.createdAt)
                    .put("source", "xecute_android")
                enqueue(
                    "POST /api/tamper/report",
                    payload.toString(),
                    "tamper_orphan_${t.id}_${t.createdAt}",
                )
            }
        }

        val items = db.syncQueueDao().getPending(50)
        for (item in items) {
            if (item.retryCount >= MAX_RETRIES) continue
            try {
                val payload = enrichPayload(item.endpoint, item.payload)
                val code = httpCall(base, token, item.endpoint, payload, item.idempotencyKey)
                when {
                    code in 200..299 -> {
                        db.syncQueueDao().markSynced(item.id, System.currentTimeMillis())
                        if (item.endpoint.contains("/session/events") && events.isNotEmpty()) {
                            db.appSwitchEventDao().markSynced(events.map { it.id })
                        }
                        if (item.endpoint.contains("/tamper/report")) {
                            markTamperSynced(payload)
                        }
                        synced++
                    }
                    code in 400..499 -> {
                        // Permanent client failure — drop
                        db.syncQueueDao().delete(item.id)
                    }
                    else -> {
                        db.syncQueueDao().incrementRetry(item.id, System.currentTimeMillis())
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Sync failed for ${item.endpoint}: ${e.message}")
                db.syncQueueDao().incrementRetry(item.id, System.currentTimeMillis())
            }
        }
        synced
    }

    private suspend fun markTamperSynced(payload: String) {
        try {
            val obj = JSONObject(payload)
            val eventId = obj.optLong("eventId", -1L)
            if (eventId > 0) {
                db.tamperEventDao().markSynced(listOf(eventId))
            }
        } catch (_: Exception) {
        }
    }

    /** Ensure userId / taskId / sessionOverride are present for older queued rows. */
    private fun enrichPayload(endpoint: String, payload: String): String {
        return try {
            val obj = JSONObject(payload)
            val userId = prefs.getSyncUserId()
            if (!obj.has("userId") || obj.isNull("userId")) {
                if (!userId.isNullOrBlank()) obj.put("userId", userId)
            }
            if (endpoint.contains("/session/events") || endpoint.contains("/session/reconcile")) {
                val taskId = prefs.getActiveTaskId()
                if ((!obj.has("taskId") || obj.isNull("taskId")) && !taskId.isNullOrBlank()) {
                    obj.put("taskId", taskId)
                }
            }
            if (endpoint.contains("/session/reconcile") && !obj.has("sessionOverride")) {
                val mins = obj.optInt("durationMinutes", 0)
                val startedAt = obj.optString("startedAt", isoUtc(System.currentTimeMillis()))
                val endedAt = if (obj.has("endedAt") && !obj.isNull("endedAt")) {
                    obj.get("endedAt")
                } else {
                    JSONObject.NULL
                }
                val completed = obj.optBoolean("completed", false)
                val scoped = if (mins > 0) mins * 60 else 1800
                obj.put(
                    "sessionOverride",
                    JSONObject()
                        .put("taskId", obj.optString("taskId", ""))
                        .put("scopedDurationSeconds", scoped)
                        .put("activeDurationSeconds", if (completed) scoped else 0)
                        .put("startedAt", startedAt)
                        .put("endedAt", endedAt)
                        .put("source", "xecute_android"),
                )
                if (!obj.has("source")) obj.put("source", "xecute_android")
            }
            obj.toString()
        } catch (_: Exception) {
            payload
        }
    }

    private fun httpCall(
        baseUrl: String,
        token: String?,
        endpoint: String,
        payload: String,
        idempotencyKey: String,
    ): Int {
        val parts = endpoint.trim().split(" ", limit = 2)
        val method = (parts.getOrNull(0) ?: "POST").uppercase()
        val path = parts.getOrNull(1) ?: return 400
        val url = URL("$baseUrl$path")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12_000
            readTimeout = 12_000
            doInput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("X-Idempotency-Key", idempotencyKey)
            if (!token.isNullOrBlank()) {
                setRequestProperty("Authorization", "Bearer $token")
            }
            if (method == "POST" || method == "PUT" || method == "PATCH") {
                doOutput = true
                OutputStreamWriter(outputStream).use { it.write(payload) }
            }
        }
        return try {
            val code = conn.responseCode
            // Drain body so connection can reuse
            try {
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                stream?.let { BufferedReader(InputStreamReader(it)).use { r -> r.readText() } }
            } catch (_: Exception) {
            }
            code
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        private const val TAG = "OfflineSync"
        private const val MAX_RETRIES = 8
        const val LOCAL_WALLET_USER = "local"

        fun isoUtc(ms: Long): String {
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
            return sdf.format(java.util.Date(ms))
        }

        fun sessionHash(
            taskId: String,
            startedAt: Long,
            endAt: Long,
            durationMinutes: Int,
        ): String {
            val raw = "$taskId|$startedAt|$endAt|$durationMinutes"
            val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
            return digest.joinToString("") { "%02x".format(it) }.take(32)
        }

        @Volatile
        private var instance: OfflineSyncManager? = null

        fun get(context: Context): OfflineSyncManager {
            return instance ?: synchronized(this) {
                instance ?: OfflineSyncManager(context).also { instance = it }
            }
        }
    }
}

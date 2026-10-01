package com.xecute.app.blocker

import android.content.Context
import android.content.SharedPreferences

/**
 * Immediate offline-first storage for blocklists and shield state.
 * Accessibility service reads from here for <1ms latency.
 */
class BlockPrefs(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveBlockedApps(packages: Set<String>) {
        prefs.edit().putStringSet(KEY_BLOCKED_APPS, packages).apply()
    }

    fun getBlockedApps(): Set<String> =
        prefs.getStringSet(KEY_BLOCKED_APPS, emptySet())?.toSet() ?: emptySet()

    fun saveBlockedDomains(domains: Set<String>) {
        prefs.edit().putStringSet(KEY_BLOCKED_DOMAINS, domains).apply()
    }

    fun getBlockedDomains(): Set<String> =
        prefs.getStringSet(KEY_BLOCKED_DOMAINS, emptySet())?.toSet() ?: emptySet()

    fun setShieldActive(active: Boolean) {
        prefs.edit().putBoolean(KEY_SHIELD_ACTIVE, active).apply()
    }

    fun isShieldActive(): Boolean = prefs.getBoolean(KEY_SHIELD_ACTIVE, false)

    fun setBreakUntil(untilMs: Long?) {
        prefs.edit().apply {
            if (untilMs == null) remove(KEY_BREAK_UNTIL) else putLong(KEY_BREAK_UNTIL, untilMs)
        }.apply()
    }

    fun getBreakUntil(): Long = prefs.getLong(KEY_BREAK_UNTIL, 0L)

    fun isOnBreak(): Boolean {
        if (isPunishmentActive()) return false
        if (areBreaksDisabled()) return false
        val until = getBreakUntil()
        return until > System.currentTimeMillis()
    }

    fun setPunishmentUntil(untilMs: Long?) {
        prefs.edit().apply {
            if (untilMs == null) remove(KEY_PUNISH_UNTIL) else putLong(KEY_PUNISH_UNTIL, untilMs)
        }.apply()
    }

    fun getPunishmentUntil(): Long = prefs.getLong(KEY_PUNISH_UNTIL, 0L)

    fun isPunishmentActive(): Boolean = getPunishmentUntil() > System.currentTimeMillis()

    fun setBreaksDisabled(disabled: Boolean) {
        prefs.edit().putBoolean(KEY_BREAKS_DISABLED, disabled).apply()
    }

    fun areBreaksDisabled(): Boolean = prefs.getBoolean(KEY_BREAKS_DISABLED, false)

    fun setSessionTamperCount(count: Int) {
        prefs.edit().putInt(KEY_SESSION_TAMPER, count.coerceAtLeast(0)).apply()
    }

    fun getSessionTamperCount(): Int = prefs.getInt(KEY_SESSION_TAMPER, 0)

    fun clearSessionTamperState() {
        prefs.edit()
            .putInt(KEY_SESSION_TAMPER, 0)
            .putBoolean(KEY_BREAKS_DISABLED, false)
            .remove(KEY_PUNISH_UNTIL)
            .apply()
    }

    /** Running local XScore delta for soft-launch (server syncs via /api/tamper/report). */
    fun addLocalXScore(delta: Int) {
        val next = (getLocalXScore() + delta).coerceIn(0, 100)
        prefs.edit().putInt(KEY_XSCORE, next).apply()
    }

    fun getLocalXScore(): Int = prefs.getInt(KEY_XSCORE, 70)

    fun setBlockActive(active: Boolean) {
        prefs.edit().putBoolean(KEY_BLOCK_ACTIVE, active).apply()
    }

    fun isBlockActive(): Boolean = prefs.getBoolean(KEY_BLOCK_ACTIVE, false)

    fun setActiveSessionId(id: String?) {
        prefs.edit().apply {
            if (id == null) remove(KEY_SESSION_ID) else putString(KEY_SESSION_ID, id)
        }.apply()
    }

    fun getActiveSessionId(): String? = prefs.getString(KEY_SESSION_ID, null)

    fun setActiveTaskId(taskId: String?) {
        prefs.edit().apply {
            if (taskId.isNullOrBlank()) remove(KEY_TASK_ID) else putString(KEY_TASK_ID, taskId)
        }.apply()
    }

    fun getActiveTaskId(): String? = prefs.getString(KEY_TASK_ID, null)

    /** Local XCredits cache (mirrors /api/credits; admin sees server wallet). */
    fun setXCreditsBalance(balance: Int) {
        prefs.edit()
            .putInt(KEY_XCREDITS, balance.coerceAtLeast(0))
            .remove(KEY_LEGACY_XFUEL)
            .apply()
    }

    fun getXCreditsBalance(): Int {
        if (prefs.contains(KEY_XCREDITS)) {
            return prefs.getInt(KEY_XCREDITS, DEFAULT_XCREDITS)
        }
        val legacy = prefs.getInt(KEY_LEGACY_XFUEL, DEFAULT_XCREDITS)
        setXCreditsBalance(legacy)
        return legacy
    }

    fun burnXCredits(amount: Int): Boolean {
        val current = getXCreditsBalance()
        if (current < amount) return false
        setXCreditsBalance(current - amount)
        val pending = prefs.getInt(KEY_PENDING_BURN, 0) + amount
        prefs.edit().putInt(KEY_PENDING_BURN, pending).apply()
        return true
    }

    fun getPendingBurnAmount(): Int = prefs.getInt(KEY_PENDING_BURN, 0)

    fun clearPendingBurn(amount: Int) {
        val next = (getPendingBurnAmount() - amount).coerceAtLeast(0)
        prefs.edit().putInt(KEY_PENDING_BURN, next).apply()
    }

    fun setPermissionsHealthy(healthy: Boolean) {
        prefs.edit().putBoolean(KEY_PERMS_OK, healthy).apply()
    }

    fun arePermissionsHealthy(): Boolean = prefs.getBoolean(KEY_PERMS_OK, true)

    fun setDeviceAdminEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_DEVICE_ADMIN, enabled).apply()
    }

    fun isDeviceAdminEnabled(): Boolean = prefs.getBoolean(KEY_DEVICE_ADMIN, false)

    fun isPackageBlocked(packageName: String): Boolean =
        isShieldActive() && !isOnBreak() && isBlockActive() && packageName in getBlockedApps()

    fun isDomainBlocked(host: String): Boolean {
        if (!isShieldActive() || isOnBreak() || !isBlockActive()) return false
        val domains = getBlockedDomains()
        if (domains.isEmpty()) return false
        val normalized = host.lowercase().removePrefix("www.")
        return domains.any { domain ->
            val d = domain.lowercase().removePrefix("www.")
            normalized == d || normalized.endsWith(".$d")
        }
    }

    /** Phase 2 offline sync credentials (set from RN after auth). */
    fun configureOfflineSync(apiBaseUrl: String?, authToken: String?, userId: String?) {
        prefs.edit().apply {
            if (apiBaseUrl.isNullOrBlank()) remove(KEY_API_BASE) else putString(KEY_API_BASE, apiBaseUrl)
            if (authToken.isNullOrBlank()) remove(KEY_AUTH_TOKEN) else putString(KEY_AUTH_TOKEN, authToken)
            if (userId.isNullOrBlank()) remove(KEY_SYNC_USER) else putString(KEY_SYNC_USER, userId)
        }.apply()
    }

    fun clearOfflineSync() {
        prefs.edit()
            .remove(KEY_API_BASE)
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_SYNC_USER)
            .apply()
    }

    fun getApiBaseUrl(): String? = prefs.getString(KEY_API_BASE, null)
    fun getAuthToken(): String? = prefs.getString(KEY_AUTH_TOKEN, null)
    fun getSyncUserId(): String? = prefs.getString(KEY_SYNC_USER, null)

    companion object {
        const val PREFS_NAME = "xecute_blocker"
        const val DEFAULT_XCREDITS = 45
        private const val KEY_BLOCKED_APPS = "blocked_apps"
        private const val KEY_BLOCKED_DOMAINS = "blocked_domains"
        private const val KEY_SHIELD_ACTIVE = "shield_active"
        private const val KEY_BREAK_UNTIL = "break_until"
        private const val KEY_PUNISH_UNTIL = "punish_until"
        private const val KEY_BREAKS_DISABLED = "breaks_disabled"
        private const val KEY_SESSION_TAMPER = "session_tamper_count"
        private const val KEY_XSCORE = "local_xscore"
        private const val KEY_BLOCK_ACTIVE = "block_active"
        private const val KEY_SESSION_ID = "session_id"
        private const val KEY_TASK_ID = "active_task_id"
        private const val KEY_XCREDITS = "xcredits_balance"
        /** Migrated once then removed — do not write new data here. */
        private const val KEY_LEGACY_XFUEL = "xfuel_balance"
        private const val KEY_PENDING_BURN = "xcredits_pending_burn"
        private const val KEY_PERMS_OK = "permissions_healthy"
        private const val KEY_DEVICE_ADMIN = "device_admin_enabled"
        private const val KEY_API_BASE = "offline_api_base"
        private const val KEY_AUTH_TOKEN = "offline_auth_token"
        private const val KEY_SYNC_USER = "offline_sync_user"

        @Volatile
        private var instance: BlockPrefs? = null

        fun get(context: Context): BlockPrefs {
            return instance ?: synchronized(this) {
                instance ?: BlockPrefs(context).also { instance = it }
            }
        }
    }
}

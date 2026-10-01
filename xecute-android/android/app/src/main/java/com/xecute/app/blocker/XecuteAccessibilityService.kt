package com.xecute.app.blocker

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.xecute.app.data.XecuteDatabase
import com.xecute.app.data.entity.AppSwitchEventEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * OS-level foreground detection + browser URL interception.
 * Target: detect blocked packages in <50ms via SharedPreferences.
 */
class XecuteAccessibilityService : AccessibilityService() {

    private lateinit var prefs: BlockPrefs
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var lastFocusedPackage: String? = null
    private var lastFocusTimestamp: Long = 0L
    private var lastOverlayShownAt: Long = 0L
    private var lastOverlayPackage: String? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        prefs = BlockPrefs.get(this)
        serviceInfo = serviceInfo?.apply {
            eventTypes =
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = flags or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 50
        }
        Log.i(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val packageName = event.packageName?.toString() ?: return

        // Never block ourselves
        if (packageName == applicationContext.packageName) return
        if (packageName == "com.xecute.app") return

        if (!prefs.isShieldActive() || prefs.isOnBreak() || !prefs.isBlockActive()) {
            return
        }

        // Anti-tamper: Android Settings during active block → home + tiered response
        if (packageName == "com.android.settings") {
            performGlobalAction(GLOBAL_ACTION_HOME)
            scope.launch {
                AntiTamperManager.record(
                    this@XecuteAccessibilityService,
                    TamperAttempt.SettingsNavigation(packageName),
                )
            }
            return
        }

        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            handleWindowChange(packageName)
        }

        // Browser URL interception on content changes
        if (packageName in BROWSER_PACKAGES &&
            (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
                event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        ) {
            val root = rootInActiveWindow ?: return
            val url = extractBrowserUrl(root)
            if (!url.isNullOrBlank()) {
                val host = extractHost(url)
                if (host != null && prefs.isDomainBlocked(host)) {
                    showBlockOverlay(packageName)
                }
            }
        }
    }

    private fun handleWindowChange(packageName: String) {
        val now = System.currentTimeMillis()
        val isReopen =
            packageName == lastFocusedPackage && now - lastFocusTimestamp < SESSION_GROUP_MS

        val action = if (isReopen) "REOPEN" else "SWITCH"
        if (!isReopen) {
            lastFocusedPackage = packageName
        }
        lastFocusTimestamp = now

        logRawEvent(packageName, action, now)
        if (!isReopen) {
            val sessionId = prefs.getActiveSessionId()
            if (sessionId != null) {
                scope.launch {
                    try {
                        XecuteDatabase.getInstance(this@XecuteAccessibilityService)
                            .lockSessionDao()
                            .incrementAppSwitch(sessionId)
                    } catch (_: Exception) {
                    }
                }
            }
        }

        if (prefs.isPackageBlocked(packageName)) {
            showBlockOverlay(packageName)
        }
    }

    private fun showBlockOverlay(packageName: String) {
        val now = SystemClock.elapsedRealtime()
        // Debounce overlay spam
        if (packageName == lastOverlayPackage && now - lastOverlayShownAt < OVERLAY_DEBOUNCE_MS) {
            return
        }
        lastOverlayPackage = packageName
        lastOverlayShownAt = now

        val intent = Intent(this, BlockOverlayActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(BlockOverlayActivity.EXTRA_PACKAGE, packageName)
        }
        startActivity(intent)
        XecuteBlockerModule.instance?.emitAppBlocked(packageName)
    }

    private fun logRawEvent(packageName: String, action: String, timestamp: Long) {
        val sessionId = prefs.getActiveSessionId() ?: UUID.randomUUID().toString()
        scope.launch {
            try {
                XecuteDatabase.getInstance(this@XecuteAccessibilityService)
                    .appSwitchEventDao()
                    .insert(
                        AppSwitchEventEntity(
                            sessionId = sessionId,
                            packageName = packageName,
                            action = action,
                            timestamp = timestamp,
                            durationMs = 0,
                        ),
                    )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to log event", e)
            }
        }
    }

    private fun extractBrowserUrl(root: AccessibilityNodeInfo): String? {
        // Common URL bar resource IDs across major browsers
        for (viewId in URL_BAR_IDS) {
            val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
            if (!nodes.isNullOrEmpty()) {
                val text = nodes[0].text?.toString()
                if (!text.isNullOrBlank()) return text
            }
        }
        // Fallback: look for EditText that looks like a URL
        return findUrlInTree(root, 0)
    }

    private fun findUrlInTree(node: AccessibilityNodeInfo?, depth: Int): String? {
        if (node == null || depth > 12) return null
        val text = node.text?.toString()
        if (!text.isNullOrBlank() && looksLikeUrl(text)) {
            return text
        }
        for (i in 0 until node.childCount) {
            val found = findUrlInTree(node.getChild(i), depth + 1)
            if (found != null) return found
        }
        return null
    }

    private fun looksLikeUrl(text: String): Boolean {
        val t = text.lowercase()
        return t.contains('.') &&
            (t.startsWith("http") || t.contains(".com") || t.contains(".org") ||
                t.contains(".net") || t.contains(".io") || t.contains("www."))
    }

    private fun extractHost(raw: String): String? {
        return try {
            var url = raw.trim()
            if (!url.contains("://")) url = "https://$url"
            val uri = android.net.Uri.parse(url)
            uri.host?.lowercase()?.removePrefix("www.")
        } catch (_: Exception) {
            null
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Accessibility service interrupted")
    }

    companion object {
        private const val TAG = "XecuteA11y"
        private const val SESSION_GROUP_MS = 5_000L
        private const val OVERLAY_DEBOUNCE_MS = 800L

        private val BROWSER_PACKAGES = setOf(
            "com.android.chrome",
            "com.chrome.beta",
            "com.chrome.dev",
            "com.brave.browser",
            "org.mozilla.firefox",
            "org.mozilla.firefox_beta",
            "com.sec.android.app.sbrowser",
            "com.opera.browser",
            "com.microsoft.emmx",
            "com.duckduckgo.mobile.android",
        )

        private val URL_BAR_IDS = listOf(
            "com.android.chrome:id/url_bar",
            "com.chrome.beta:id/url_bar",
            "com.brave.browser:id/url_bar",
            "org.mozilla.firefox:id/url_bar_title",
            "org.mozilla.firefox:id/mozac_browser_toolbar_url_view",
            "com.sec.android.app.sbrowser:id/location_bar_edit_text",
            "com.opera.browser:id/url_field",
            "com.microsoft.emmx:id/url_bar",
            "com.duckduckgo.mobile.android:id/omnibarTextInput",
        )
    }
}

package com.xecute.app.blocker

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Prevents casual uninstall while a strict focus lock is active.
 * User must deactivate Shield / end mission before removing Device Admin.
 */
class XecuteDeviceAdminReceiver : DeviceAdminReceiver() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin enabled")
        BlockPrefs.get(context).setDeviceAdminEnabled(true)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.w(TAG, "Device admin disabled")
        val prefs = BlockPrefs.get(context)
        prefs.setDeviceAdminEnabled(false)
        Toast.makeText(context, "Xecute uninstall protection disabled", Toast.LENGTH_SHORT).show()
        if (prefs.isShieldActive() && prefs.isBlockActive()) {
            scope.launch {
                AntiTamperManager.record(
                    context.applicationContext,
                    TamperAttempt.DeviceAdminRevoke(),
                    showUi = true,
                )
            }
        }
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        return "Disable Shield / end your mission before removing uninstall protection."
    }

    companion object {
        private const val TAG = "XecuteDeviceAdmin"
    }
}

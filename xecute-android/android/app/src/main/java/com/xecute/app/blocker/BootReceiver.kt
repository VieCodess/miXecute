package com.xecute.app.blocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.xecute.app.data.OfflineSyncManager
import com.xecute.app.data.XecuteDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Resume shield daemon after device reboot if it was active. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = BlockPrefs.get(context)
        if (!prefs.isShieldActive()) return

        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val sessionId = prefs.getActiveSessionId()
                if (sessionId != null) {
                    XecuteDatabase.getInstance(context)
                        .lockSessionDao()
                        .recordInterrupt(sessionId, System.currentTimeMillis())
                }
                OfflineSyncManager.get(context).syncPendingItems()
            } catch (_: Exception) {
            } finally {
                pending.finish()
                val service = Intent(context, XecuteDaemonService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(service)
                } else {
                    context.startService(service)
                }
            }
        }
    }
}

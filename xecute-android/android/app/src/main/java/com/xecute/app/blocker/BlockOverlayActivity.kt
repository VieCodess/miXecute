package com.xecute.app.blocker

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class BlockOverlayActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
        )

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).let { controller ->
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    // Immersive lock — back does nothing
                }
            },
        )

        val mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_BLOCK
        val blockedPackage = intent.getStringExtra(EXTRA_PACKAGE) ?: run {
            finish()
            return
        }

        val appName = if (mode == MODE_TAMPER) {
            intent.getStringExtra(EXTRA_TITLE) ?: "Focus lock"
        } else {
            try {
                val info = packageManager.getApplicationInfo(blockedPackage, 0)
                packageManager.getApplicationLabel(info).toString()
            } catch (_: PackageManager.NameNotFoundException) {
                blockedPackage
            }
        }

        val prefs = BlockPrefs.get(this)
        val breakCost = 15
        val breakMinutes = 15

        setContent {
            val balanceState = remember { mutableIntStateOf(prefs.getXCreditsBalance()) }
            BlockOverlayScreen(
                headline = if (mode == MODE_TAMPER) appName else "DISTRACTION LOCKED",
                appName = if (mode == MODE_TAMPER) "" else appName,
                subtitle = if (mode == MODE_TAMPER) {
                    intent.getStringExtra(EXTRA_MESSAGE) ?: "Tampering blocked"
                } else {
                    "Blocked by Xecute Shield"
                },
                xCreditsBalance = balanceState.intValue,
                breakCost = breakCost,
                breakMinutes = breakMinutes,
                allowBreak = mode != MODE_TAMPER && !prefs.areBreaksDisabled() && !prefs.isPunishmentActive(),
                onExitHome = {
                    val home = Intent(Intent.ACTION_MAIN).apply {
                        addCategory(Intent.CATEGORY_HOME)
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    startActivity(home)
                    finish()
                },
                onBreak = {
                    if (prefs.burnXCredits(breakCost)) {
                        balanceState.intValue = prefs.getXCreditsBalance()
                        prefs.setBreakUntil(
                            System.currentTimeMillis() + breakMinutes * 60 * 1000L,
                        )
                        finish()
                    }
                },
            )
        }
    }

    companion object {
        const val EXTRA_PACKAGE = "packageName"
        const val EXTRA_MODE = "mode"
        const val EXTRA_TITLE = "title"
        const val EXTRA_MESSAGE = "message"
        const val MODE_BLOCK = "block"
        const val MODE_TAMPER = "tamper"
    }
}

@Composable
fun BlockOverlayScreen(
    headline: String,
    appName: String,
    subtitle: String,
    xCreditsBalance: Int,
    breakCost: Int,
    breakMinutes: Int,
    allowBreak: Boolean,
    onExitHome: () -> Unit,
    onBreak: () -> Unit,
) {
    val bg = Color(0xFF0D0B14)
    val accent = Color(0xFFA855F7)
    val muted = Color(0xFFCCCCCC)
    val amber = Color(0xFFF59E0B)
    val canAfford = xCreditsBalance >= breakCost

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(bg)
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Default.Lock,
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(64.dp),
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = headline,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = subtitle,
            color = muted,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
        )

        if (appName.isNotBlank()) {
            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = appName,
                color = accent,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Balance: $xCreditsBalance XCredits",
            color = amber,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = onExitHome,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = accent),
        ) {
            Text("Exit to Home", color = Color.White)
        }

        if (allowBreak) {
            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = onBreak,
                enabled = canAfford,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF2A2140),
                    disabledContainerColor = Color(0xFF1A1A28),
                ),
            ) {
                Text(
                    text = if (canAfford) {
                        "Burn $breakCost XCredits for ${breakMinutes}m Break"
                    } else {
                        "Zero XCredits • Complete a Mission"
                    },
                    color = if (canAfford) Color.White else muted,
                )
            }
        }
    }
}

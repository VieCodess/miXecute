package com.xecute.app.billing

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.Modifier
import com.revenuecat.purchases.ui.revenuecatui.customercenter.CustomerCenter

/**
 * Full-screen RevenueCat Customer Center — manage / restore / cancel subscriptions.
 * Show for users who already have (or previously had) xecute_pro.
 */
class CustomerCenterHostActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val dark = isSystemInDarkTheme()
            MaterialTheme(
                colorScheme = if (dark) darkColorScheme() else lightColorScheme(),
            ) {
                CustomerCenter(
                    modifier = Modifier.fillMaxSize(),
                    onDismiss = { finish() },
                )
            }
        }
    }

    companion object {
        fun intent(context: Context): Intent =
            Intent(context, CustomerCenterHostActivity::class.java)
    }
}

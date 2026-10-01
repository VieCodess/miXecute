package com.xecute.app.billing

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.PurchasesError
import com.revenuecat.purchases.models.StoreTransaction
import com.revenuecat.purchases.ui.revenuecatui.Paywall
import com.revenuecat.purchases.ui.revenuecatui.PaywallListener
import com.revenuecat.purchases.ui.revenuecatui.PaywallOptions

/**
 * Full-screen RevenueCat Paywall (designed in the RevenueCat dashboard).
 * Offering should include packages: monthly, yearly, lifetime → entitlement xecute_pro.
 */
class PaywallHostActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val options = PaywallOptions.Builder({
            setResult(
                RESULT_CANCELED,
                Intent().putExtra(EXTRA_RESULT, RESULT_CANCELLED),
            )
            finish()
        })
            .setShouldDisplayDismissButton(true)
            .setListener(object : PaywallListener {
                override fun onPurchaseCompleted(
                    customerInfo: CustomerInfo,
                    storeTransaction: StoreTransaction,
                ) {
                    RevenueCatManager.updateCustomerInfo(customerInfo)
                    setResult(
                        RESULT_OK,
                        Intent().putExtra(EXTRA_RESULT, RESULT_PURCHASED),
                    )
                    finish()
                }

                override fun onRestoreCompleted(customerInfo: CustomerInfo) {
                    RevenueCatManager.updateCustomerInfo(customerInfo)
                    setResult(
                        RESULT_OK,
                        Intent().putExtra(EXTRA_RESULT, RESULT_RESTORED),
                    )
                    finish()
                }

                override fun onPurchaseError(error: PurchasesError) = Unit
                override fun onRestoreError(error: PurchasesError) = Unit
                override fun onPurchaseCancelled() = Unit
            })
            .build()

        setContent {
            val dark = isSystemInDarkTheme()
            MaterialTheme(
                colorScheme = if (dark) darkColorScheme() else lightColorScheme(),
            ) {
                Paywall(options = options)
            }
        }
    }

    companion object {
        const val EXTRA_RESULT = "paywall_result"
        const val RESULT_PURCHASED = "purchased"
        const val RESULT_RESTORED = "restored"
        const val RESULT_CANCELLED = "cancelled"

        fun intent(context: Context, requireEntitlement: Boolean = true): Intent {
            return Intent(context, PaywallHostActivity::class.java).apply {
                putExtra("require_entitlement", requireEntitlement)
            }
        }
    }
}

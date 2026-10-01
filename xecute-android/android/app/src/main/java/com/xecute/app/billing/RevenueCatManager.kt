package com.xecute.app.billing

import android.app.Application
import android.util.Log
import androidx.activity.ComponentActivity
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.DangerousSettings
import com.revenuecat.purchases.LogLevel
import com.revenuecat.purchases.Offering
import com.revenuecat.purchases.Offerings
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.PurchaseParams
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.PurchasesError
import com.revenuecat.purchases.getCustomerInfoWith
import com.revenuecat.purchases.getOfferingsWith
import com.revenuecat.purchases.interfaces.LogInCallback
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback
import com.revenuecat.purchases.interfaces.UpdatedCustomerInfoListener
import com.revenuecat.purchases.purchaseWith
import com.revenuecat.purchases.restorePurchasesWith
import com.xecute.app.BuildConfig
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Single entry point for RevenueCat configure / identify / offerings / purchase / entitlement.
 */
object RevenueCatManager {
    private const val TAG = "RevenueCatManager"

    @Volatile
    private var configured = false

    @Volatile
    var latestCustomerInfo: CustomerInfo? = null
        private set

    fun updateCustomerInfo(info: CustomerInfo) {
        latestCustomerInfo = info
    }

    fun configure(application: Application) {
        if (configured) return
        synchronized(this) {
            if (configured) return
            try {
                val apiKey = BuildConfig.REVENUECAT_API_KEY
                Purchases.logLevel = if (BuildConfig.DEBUG) LogLevel.DEBUG else LogLevel.INFO
                val builder = PurchasesConfiguration.Builder(application, apiKey)
                // Release/Appetize builds are not debuggable; Test Store keys crash unless allowed.
                if (apiKey.startsWith("test_")) {
                    val dangerous = DangerousSettings().apply {
                        forceAllowTestStoreInReleaseBuilds()
                    }
                    builder.dangerousSettings(dangerous)
                    Log.i(TAG, "Test Store key detected — forceAllowTestStoreInReleaseBuilds enabled")
                }
                Purchases.configure(builder.build())
                Purchases.sharedInstance.updatedCustomerInfoListener =
                    UpdatedCustomerInfoListener { info ->
                        latestCustomerInfo = info
                        Log.i(TAG, "CustomerInfo updated; pro=${hasPro(info)}")
                    }
                configured = true
                Log.i(TAG, "RevenueCat configured (entitlement=${RevenueCatConfig.ENTITLEMENT_ID})")
            } catch (e: Exception) {
                // Never crash the app for billing bootstrap failures (Appetize / sideload).
                configured = false
                Log.e(TAG, "RevenueCat configure failed: ${e.message}", e)
            }
        }
    }

    fun isConfigured(): Boolean = configured

    suspend fun logIn(appUserId: String): CustomerInfo {
        ensureConfigured()
        return suspendCancellableCoroutine { cont ->
            Purchases.sharedInstance.logIn(
                appUserId,
                object : LogInCallback {
                    override fun onReceived(customerInfo: CustomerInfo, created: Boolean) {
                        latestCustomerInfo = customerInfo
                        cont.resume(customerInfo)
                    }

                    override fun onError(error: PurchasesError) {
                        cont.resumeWithException(error.toException())
                    }
                },
            )
        }
    }

    suspend fun logOut(): CustomerInfo? {
        if (!configured) return null
        return suspendCancellableCoroutine { cont ->
            Purchases.sharedInstance.logOut(
                object : ReceiveCustomerInfoCallback {
                    override fun onReceived(customerInfo: CustomerInfo) {
                        latestCustomerInfo = customerInfo
                        cont.resume(customerInfo)
                    }

                    override fun onError(error: PurchasesError) {
                        cont.resumeWithException(error.toException())
                    }
                },
            )
        }
    }

    suspend fun getCustomerInfo(): CustomerInfo {
        ensureConfigured()
        return suspendCancellableCoroutine { cont ->
            Purchases.sharedInstance.getCustomerInfoWith(
                onError = { cont.resumeWithException(it.toException()) },
                onSuccess = {
                    latestCustomerInfo = it
                    cont.resume(it)
                },
            )
        }
    }

    suspend fun getOfferings(): Offerings {
        ensureConfigured()
        return suspendCancellableCoroutine { cont ->
            Purchases.sharedInstance.getOfferingsWith(
                onError = { cont.resumeWithException(it.toException()) },
                onSuccess = { cont.resume(it) },
            )
        }
    }

    fun findPackage(offering: Offering, packageId: String): Package? {
        val wanted = packageId.lowercase()
        return offering.availablePackages.firstOrNull {
            it.identifier.equals(wanted, ignoreCase = true) ||
                it.product.id.contains(wanted, ignoreCase = true)
        }
    }

    suspend fun purchase(activity: ComponentActivity, packageId: String): CustomerInfo {
        ensureConfigured()
        val offerings = getOfferings()
        val offering = offerings.current
            ?: throw IllegalStateException("No current RevenueCat offering. Create one in the dashboard.")
        val pkg = findPackage(offering, packageId)
            ?: throw IllegalStateException(
                "Package '$packageId' not found in current offering. Expected: ${RevenueCatConfig.KNOWN_PACKAGE_IDS}",
            )

        return suspendCancellableCoroutine { cont ->
            Purchases.sharedInstance.purchaseWith(
                PurchaseParams.Builder(activity, pkg).build(),
                onError = { error, userCancelled ->
                    if (userCancelled) {
                        cont.resumeWithException(PurchaseCancelledException())
                    } else {
                        cont.resumeWithException(error.toException())
                    }
                },
                onSuccess = { _, customerInfo ->
                    latestCustomerInfo = customerInfo
                    cont.resume(customerInfo)
                },
            )
        }
    }

    suspend fun restore(): CustomerInfo {
        ensureConfigured()
        return suspendCancellableCoroutine { cont ->
            Purchases.sharedInstance.restorePurchasesWith(
                onError = { cont.resumeWithException(it.toException()) },
                onSuccess = {
                    latestCustomerInfo = it
                    cont.resume(it)
                },
            )
        }
    }

    fun hasPro(info: CustomerInfo? = latestCustomerInfo): Boolean {
        val customer = info ?: return false
        return customer.entitlements[RevenueCatConfig.ENTITLEMENT_ID]?.isActive == true
    }

    fun customerInfoMap(info: CustomerInfo): Map<String, Any?> {
        val ent = info.entitlements[RevenueCatConfig.ENTITLEMENT_ID]
        val productId = ent?.productIdentifier
        val planKind = RevenueCatConfig.planKindForProduct(productId)
        return mapOf(
            "appUserId" to info.originalAppUserId,
            "isPro" to hasPro(info),
            "isFounder" to RevenueCatConfig.isFounderPlan(planKind),
            "planKind" to planKind,
            "entitlementId" to RevenueCatConfig.ENTITLEMENT_ID,
            "entitlementActive" to (ent?.isActive == true),
            "productIdentifier" to productId,
            "expirationDate" to ent?.expirationDate?.time,
            "willRenew" to ent?.willRenew,
            "activeSubscriptions" to info.activeSubscriptions.toList(),
            "allPurchasedProductIds" to info.allPurchasedProductIds.toList(),
        )
    }

    fun offeringPackagesSummary(offering: Offering): List<Map<String, Any?>> {
        return offering.availablePackages.map { pkg ->
            val planKind = RevenueCatConfig.planKindForPackage(pkg.identifier)
            mapOf(
                "identifier" to pkg.identifier,
                "packageType" to pkg.packageType.name,
                "productId" to pkg.product.id,
                "title" to pkg.product.title,
                "description" to pkg.product.description,
                "priceString" to pkg.product.price.formatted,
                "price" to pkg.product.price.amountMicros / 1_000_000.0,
                "currencyCode" to pkg.product.price.currencyCode,
                "planKind" to planKind,
                "displayLabel" to RevenueCatConfig.displayLabel(pkg.identifier, pkg.product.id),
            )
        }
    }

    private fun ensureConfigured() {
        check(configured) { "RevenueCatManager.configure() must be called in Application.onCreate" }
    }

    private fun PurchasesError.toException(): Exception =
        Exception("${code.name}: $message")
}

class PurchaseCancelledException : Exception("Purchase cancelled by user")

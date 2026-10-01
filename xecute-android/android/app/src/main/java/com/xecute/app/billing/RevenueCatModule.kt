package com.xecute.app.billing

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class RevenueCatModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var paywallPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "XecuteRevenueCat"

    @ReactMethod
    fun getCustomerInfo(promise: Promise) {
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { RevenueCatManager.getCustomerInfo() }
                promise.resolve(toWritableMap(RevenueCatManager.customerInfoMap(info)))
            } catch (e: Exception) {
                promise.reject("CUSTOMER_INFO_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun hasProEntitlement(promise: Promise) {
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { RevenueCatManager.getCustomerInfo() }
                promise.resolve(RevenueCatManager.hasPro(info))
            } catch (e: Exception) {
                promise.reject("ENTITLEMENT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun logIn(appUserId: String, promise: Promise) {
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { RevenueCatManager.logIn(appUserId) }
                promise.resolve(toWritableMap(RevenueCatManager.customerInfoMap(info)))
            } catch (e: Exception) {
                promise.reject("LOGIN_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun logOut(promise: Promise) {
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { RevenueCatManager.logOut() }
                if (info == null) promise.resolve(null)
                else promise.resolve(toWritableMap(RevenueCatManager.customerInfoMap(info)))
            } catch (e: Exception) {
                promise.reject("LOGOUT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getOfferings(promise: Promise) {
        scope.launch {
            try {
                val offerings = withContext(Dispatchers.IO) { RevenueCatManager.getOfferings() }
                val current = offerings.current
                val map = Arguments.createMap()
                map.putString("currentOfferingId", current?.identifier)
                val packages: WritableArray = Arguments.createArray()
                if (current != null) {
                    RevenueCatManager.offeringPackagesSummary(current).forEach { pkg ->
                        packages.pushMap(toWritableMap(pkg))
                    }
                }
                map.putArray("packages", packages)
                // Highlight expected product ids
                val expected = Arguments.createArray()
                RevenueCatConfig.KNOWN_PACKAGE_IDS.forEach { expected.pushString(it) }
                map.putArray("expectedPackageIds", expected)
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("OFFERINGS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun purchasePackage(packageId: String, promise: Promise) {
        val activity = currentActivity as? Activity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity for purchase")
            return
        }
        val component = activity as? androidx.activity.ComponentActivity
        if (component == null) {
            promise.reject("NO_ACTIVITY", "Activity is not a ComponentActivity")
            return
        }
        scope.launch {
            try {
                val customerInfo = RevenueCatManager.purchase(component, packageId)
                promise.resolve(toWritableMap(RevenueCatManager.customerInfoMap(customerInfo)))
            } catch (e: PurchaseCancelledException) {
                promise.reject("PURCHASE_CANCELLED", e.message, e)
            } catch (e: Exception) {
                promise.reject("PURCHASE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun restorePurchases(promise: Promise) {
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { RevenueCatManager.restore() }
                promise.resolve(toWritableMap(RevenueCatManager.customerInfoMap(info)))
            } catch (e: Exception) {
                promise.reject("RESTORE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun presentPaywall(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        paywallPromise = promise
        activity.startActivityForResult(
            PaywallHostActivity.intent(activity, requireEntitlement = false),
            REQ_PAYWALL,
        )
    }

    @ReactMethod
    fun presentPaywallIfNeeded(promise: Promise) {
        scope.launch {
            try {
                val info = withContext(Dispatchers.IO) { RevenueCatManager.getCustomerInfo() }
                if (RevenueCatManager.hasPro(info)) {
                    val map = Arguments.createMap()
                    map.putString("result", "not_presented")
                    map.putBoolean("isPro", true)
                    map.putMap("customerInfo", toWritableMap(RevenueCatManager.customerInfoMap(info)))
                    promise.resolve(map)
                    return@launch
                }
                val activity = currentActivity
                if (activity == null) {
                    promise.reject("NO_ACTIVITY", "No foreground activity")
                    return@launch
                }
                paywallPromise = promise
                activity.startActivityForResult(
                    PaywallHostActivity.intent(activity, requireEntitlement = true),
                    REQ_PAYWALL,
                )
            } catch (e: Exception) {
                promise.reject("PAYWALL_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun presentCustomerCenter(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        try {
            activity.startActivity(CustomerCenterHostActivity.intent(activity))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CUSTOMER_CENTER_ERROR", e.message, e)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQ_PAYWALL) return
        val promise = paywallPromise ?: return
        paywallPromise = null
        val result = data?.getStringExtra(PaywallHostActivity.EXTRA_RESULT)
            ?: if (resultCode == Activity.RESULT_OK) PaywallHostActivity.RESULT_PURCHASED
            else PaywallHostActivity.RESULT_CANCELLED
        scope.launch {
            val map = Arguments.createMap()
            map.putString("result", result)
            try {
                val info = withContext(Dispatchers.IO) { RevenueCatManager.getCustomerInfo() }
                map.putBoolean("isPro", RevenueCatManager.hasPro(info))
                map.putMap("customerInfo", toWritableMap(RevenueCatManager.customerInfoMap(info)))
            } catch (_: Exception) {
                map.putBoolean("isPro", RevenueCatManager.hasPro())
            }
            promise.resolve(map)
        }
    }

    override fun onNewIntent(intent: Intent) = Unit

    private fun toWritableMap(source: Map<String, Any?>): WritableMap {
        val map = Arguments.createMap()
        source.forEach { (key, value) ->
            when (value) {
                null -> map.putNull(key)
                is Boolean -> map.putBoolean(key, value)
                is Int -> map.putInt(key, value)
                is Long -> map.putDouble(key, value.toDouble())
                is Double -> map.putDouble(key, value)
                is Float -> map.putDouble(key, value.toDouble())
                is String -> map.putString(key, value)
                is List<*> -> {
                    val arr = Arguments.createArray()
                    value.forEach { item ->
                        when (item) {
                            is String -> arr.pushString(item)
                            is Boolean -> arr.pushBoolean(item)
                            is Double -> arr.pushDouble(item)
                            is Int -> arr.pushInt(item)
                            else -> arr.pushString(item?.toString())
                        }
                    }
                    map.putArray(key, arr)
                }
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    companion object {
        private const val REQ_PAYWALL = 71001
    }
}

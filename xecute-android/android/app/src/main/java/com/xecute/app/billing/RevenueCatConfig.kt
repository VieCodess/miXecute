package com.xecute.app.billing

/**
 * Dashboard product / entitlement IDs must match RevenueCat + Play Console.
 *
 * Entitlement (unlocks Pro features): xecute_pro
 *
 * Packages in the current offering:
 *   - monthly  → Xecute Pro (monthly subscription)
 *   - yearly   → Xecute Pro billed annually (Pro × 12)
 *   - lifetime → Founder Pass (one-time lifetime)
 */
object RevenueCatConfig {
    const val ENTITLEMENT_ID = "xecute_pro"

    const val PACKAGE_MONTHLY = "monthly"
    const val PACKAGE_YEARLY = "yearly"
    const val PACKAGE_LIFETIME = "lifetime"

    /** Product kind for server sync / UI. */
    const val PLAN_PRO_MONTHLY = "pro_monthly"
    const val PLAN_PRO_YEARLY = "pro_yearly"
    const val PLAN_FOUNDER = "founder"

    val KNOWN_PACKAGE_IDS = listOf(PACKAGE_MONTHLY, PACKAGE_YEARLY, PACKAGE_LIFETIME)

    fun planKindForPackage(packageId: String?): String {
        val id = packageId?.lowercase().orEmpty()
        return when {
            id.contains("life") || id.contains("founder") -> PLAN_FOUNDER
            id.contains("year") || id.contains("annual") -> PLAN_PRO_YEARLY
            id.contains("month") -> PLAN_PRO_MONTHLY
            else -> PLAN_PRO_MONTHLY
        }
    }

    fun planKindForProduct(productId: String?): String =
        planKindForPackage(productId)

    fun isFounderPlan(planKind: String?): Boolean =
        planKind == PLAN_FOUNDER

    fun displayLabel(packageId: String?, productId: String? = null): String {
        return when (planKindForPackage(packageId ?: productId)) {
            PLAN_FOUNDER -> "Founder Pass"
            PLAN_PRO_YEARLY -> "Pro Yearly"
            else -> "Pro Monthly"
        }
    }
}

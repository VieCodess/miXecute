# RevenueCat (Android / Kotlin)

Subscriptions for **Xecute Pro** and **Founder Pass** via RevenueCat SDK `10.23.3`.

## Dashboard setup

1. Create entitlement **`xecute_pro`** (unlocks Pro features for all paid packages).
2. Create Play products and attach them to packages in the **current** offering:
   - `monthly` → **Xecute Pro** (monthly)
   - `yearly` → **Xecute Pro** billed annually (**Pro × 12**)
   - `lifetime` → **Founder Pass** (one-time)
3. Design a **Paywall** on that offering.
4. Enable **Customer Center**.
5. Use the public SDK key (test): `test_leIMUkfdupvCDVkEhzDGtXKgkxw`  
   Override for release: `./gradlew -PrevenueCatApiKey=goog_...`

## Gradle

```groovy
implementation "com.revenuecat.purchases:purchases:10.23.3"
implementation "com.revenuecat.purchases:purchases-ui:10.23.3"
```

## Native flow

| Piece | Role |
|-------|------|
| `RevenueCatManager` | configure, logIn/logOut, offerings, purchase, restore, `xecute_pro` |
| `RevenueCatModule` | RN bridge |
| `PaywallHostActivity` | RevenueCat UI Paywall |
| `CustomerCenterHostActivity` | manage / restore / cancel |

## Plan mapping

| Package | Product | Server `planId` |
|---------|---------|-----------------|
| monthly | Pro Monthly | `plan-pro` |
| yearly | Pro Yearly (×12) | `plan-pro` |
| lifetime | Founder Pass | `plan-founder` |

`POST /api/billing/revenuecat/sync` mirrors access so admin sees the same tier.

## XCredits (not Xfuel)

Economy is **XCredits** — same `/api/credits/*` wallet as web. Mission earn + Shield break burns sync for admin visibility. App works offline with a local cache.

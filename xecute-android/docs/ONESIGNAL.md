# OneSignal push (Android)

Native app uses `react-native-onesignal@5.2.9` (compatible with RN 0.74).

## Configure

1. OneSignal dashboard → enable **Android (FCM)** for the Xecute app.
2. Set App ID in Admin → Settings → API Keys → OneSignal (**App ID** field)  
   or env `ONESIGNAL_APP_ID` on the API host.
3. Optional Gradle override for offline bootstrap:  
   `./gradlew -PoneSignalAppId=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx assembleRelease`
4. App also fetches App ID from `GET /api/config/onesignal-push` at runtime.

## App behavior

- Boot / sign-in: `PushNotifications.syncIdentity` → `OneSignal.login(userId)`, email + tags
- You → **Settings & notifications**: push master, mission reminders, Shield alerts, marketing
- Prefs sync to `PUT /api/user/preferences`; subscription id posted to `/api/user/push-subscription`
- Opt-out uses `OneSignal.User.pushSubscription.optOut()`

## Tags for targeting

| Tag | Values |
|-----|--------|
| `reminders` | `1` / `0` |
| `shield_alerts` | `1` / `0` |
| `marketing` | `1` / `0` |
| `plan` | `free` / `pro` / … |

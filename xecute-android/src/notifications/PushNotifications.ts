import {Platform} from 'react-native';
import {OneSignal, LogLevel} from 'react-native-onesignal';
import {APP_CONFIG} from '../config';
import {apiFetch, sessionStore} from '../api/sessionStore';
import {preferencesStore} from '../api/preferencesStore';
import {
  navigateToDeepLink,
  resolvePushOrUrlTarget,
} from '../navigation/navigationRef';

type InitState = {
  ready: boolean;
  appId: string | null;
  clickBound: boolean;
};

const state: InitState = {ready: false, appId: null, clickBound: false};

async function resolveAppId(): Promise<string | null> {
  if (APP_CONFIG.oneSignalAppId) return APP_CONFIG.oneSignalAppId;
  try {
    const res = await apiFetch('/api/config/onesignal-push', {auth: false});
    const payload = await res.json();
    if (res.ok && payload?.appId) return String(payload.appId);
  } catch {
    // ignore
  }
  return null;
}

function handleNotificationClick(event: any) {
  try {
    const data =
      event?.notification?.additionalData ||
      event?.result?.additionalData ||
      {};
    const launchUrl =
      event?.notification?.launchURL ||
      event?.result?.url ||
      data?.url ||
      null;
    const target = resolvePushOrUrlTarget({
      screen: data?.screen,
      type: data?.type,
      url: launchUrl,
    });
    if (!target) return;
    const tryNav = (attempt = 0) => {
      if (navigateToDeepLink(target)) return;
      if (attempt < 10) setTimeout(() => tryNav(attempt + 1), 250);
    };
    tryNav();
  } catch {
    // never block
  }
}

function bindClickListener() {
  if (state.clickBound) return;
  try {
    OneSignal.Notifications.addEventListener('click', handleNotificationClick);
    state.clickBound = true;
  } catch {
    // ignore
  }
}

export const PushNotifications = {
  async initialize(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    if (state.ready) {
      bindClickListener();
      return true;
    }
    try {
      const appId = await resolveAppId();
      if (!appId) {
        state.appId = null;
        state.ready = false;
        return false;
      }
      if (__DEV__) {
        OneSignal.Debug.setLogLevel(LogLevel.Warn);
      }
      OneSignal.initialize(appId);
      bindClickListener();
      state.appId = appId;
      state.ready = true;
      return true;
    } catch {
      state.ready = false;
      return false;
    }
  },

  isReady(): boolean {
    return state.ready;
  },

  getAppId(): string | null {
    return state.appId;
  },

  handleOpenUrl(url: string): boolean {
    const target = resolvePushOrUrlTarget({url});
    if (!target) return false;
    const tryNav = (attempt = 0) => {
      if (navigateToDeepLink(target)) return;
      if (attempt < 10) setTimeout(() => tryNav(attempt + 1), 250);
    };
    tryNav();
    return true;
  },

  async syncIdentity(signedIn: boolean): Promise<void> {
    if (Platform.OS !== 'android') return;
    const ok = await this.initialize();
    if (!ok) return;

    try {
      if (!signedIn) {
        OneSignal.logout();
        return;
      }

      const [user, prefs] = await Promise.all([
        sessionStore.getUser(),
        preferencesStore.getLocal(),
      ]);
      if (!user?.id) return;

      OneSignal.login(user.id);
      if (user.email) {
        OneSignal.User.addEmail(user.email);
      }
      OneSignal.User.addTag('plan', user.tier || 'free');
      OneSignal.User.addTag(
        'reminders',
        prefs.remindersEnabled ? '1' : '0',
      );
      OneSignal.User.addTag(
        'shield_alerts',
        prefs.shieldAlertsEnabled ? '1' : '0',
      );
      OneSignal.User.addTag(
        'marketing',
        prefs.marketingPushEnabled ? '1' : '0',
      );

      await this.applyPushPreference(prefs.pushEnabled);

      try {
        const subId = await OneSignal.User.pushSubscription.getIdAsync();
        const onesignalId = await OneSignal.User.getOnesignalId();
        await apiFetch('/api/user/push-subscription', {
          method: 'POST',
          body: JSON.stringify({
            subscriptionId: subId,
            onesignalId,
            platform: 'android',
            pushEnabled: prefs.pushEnabled,
          }),
        });
      } catch {
        // ignore
      }
    } catch {
      // Push must never block the product
    }
  },

  async applyPushPreference(enabled: boolean): Promise<void> {
    if (!state.ready) return;
    try {
      if (enabled) {
        OneSignal.User.pushSubscription.optIn();
        await OneSignal.Notifications.requestPermission(false);
      } else {
        OneSignal.User.pushSubscription.optOut();
      }
    } catch {
      // ignore
    }
  },

  async requestPermission(): Promise<boolean> {
    if (!state.ready) {
      const ok = await this.initialize();
      if (!ok) return false;
    }
    try {
      return await OneSignal.Notifications.requestPermission(true);
    } catch {
      return false;
    }
  },

  async getPermission(): Promise<boolean> {
    if (!state.ready) return false;
    try {
      return await OneSignal.Notifications.getPermissionAsync();
    } catch {
      return false;
    }
  },
};

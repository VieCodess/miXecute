import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiFetch, sessionStore} from './sessionStore';

export type UserPreferences = {
  remindersEnabled: boolean;
  pushEnabled: boolean;
  shieldAlertsEnabled: boolean;
  marketingPushEnabled: boolean;
  soundFxEnabled: boolean;
  hapticsEnabled: boolean;
  keepAwakeDuringMission: boolean;
  darkMode: boolean;
  shareStatsWithPartner: boolean;
};

const STORAGE_KEY = 'xecute_user_prefs_v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  remindersEnabled: true,
  pushEnabled: true,
  shieldAlertsEnabled: true,
  marketingPushEnabled: false,
  soundFxEnabled: true,
  hapticsEnabled: true,
  keepAwakeDuringMission: true,
  darkMode: true,
  shareStatsWithPartner: false,
};

function normalize(raw: Partial<UserPreferences> | null | undefined): UserPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...(raw || {}),
  };
}

type PrefsListener = (prefs: UserPreferences) => void;
const listeners = new Set<PrefsListener>();

function emit(prefs: UserPreferences) {
  listeners.forEach(fn => {
    try {
      fn(prefs);
    } catch {
      // ignore listener errors
    }
  });
}

export const preferencesStore = {
  subscribe(listener: PrefsListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async getLocal(): Promise<UserPreferences> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return {...DEFAULT_PREFERENCES};
      return normalize(JSON.parse(raw));
    } catch {
      return {...DEFAULT_PREFERENCES};
    }
  },

  async setLocal(prefs: UserPreferences): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    emit(prefs);
  },

  async syncFromServer(): Promise<UserPreferences> {
    const local = await this.getLocal();
    const user = await sessionStore.getUser();
    if (!user?.id) return local;
    try {
      const res = await apiFetch('/api/user/preferences');
      const payload = await res.json();
      if (!res.ok || !payload.success) return local;
      const next = normalize(payload.preferences);
      await this.setLocal(next);
      return next;
    } catch {
      return local;
    }
  },

  async update(partial: Partial<UserPreferences>): Promise<UserPreferences> {
    const current = await this.getLocal();
    const next = normalize({...current, ...partial});
    await this.setLocal(next);
    const user = await sessionStore.getUser();
    if (user?.id) {
      try {
        await apiFetch('/api/user/preferences', {
          method: 'PUT',
          body: JSON.stringify({preferences: next}),
        });
      } catch {
        // Offline OK — local wins until next sync
      }
    }
    return next;
  },
};

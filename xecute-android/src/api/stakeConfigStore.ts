import AsyncStorage from '@react-native-async-storage/async-storage';
import {APP_CONFIG} from '../config';

const CACHE_KEY = 'xecute_stake_config_v1';

export type AdminStakeType =
  | 'money'
  | 'custom'
  | 'friend_notify'
  | 'public_streak'
  | 'streak_only';

export type StakeConfigItem = {
  id: string;
  label: string;
  emoji: string;
  stakeType: AdminStakeType;
  isCashStake: boolean;
  isEnabled: boolean;
  sortOrder: number;
};

export type StakeSettings = {
  cashTiers: number[];
  allowCustomCashAmount: boolean;
  minCashAmount: number;
  maxCashAmount: number;
  currencySymbol: string;
};

export type StakeConfigSnapshot = {
  stakes: StakeConfigItem[];
  settings: StakeSettings;
};

const FALLBACK: StakeConfigSnapshot = {
  stakes: [
    {
      id: 'streak_only',
      label: 'Streak only',
      emoji: '🔥',
      stakeType: 'streak_only',
      isCashStake: false,
      isEnabled: true,
      sortOrder: 0,
    },
    {
      id: 'accountability',
      label: 'Alert my accountability partner',
      emoji: '👥',
      stakeType: 'friend_notify',
      isCashStake: false,
      isEnabled: true,
      sortOrder: 3,
    },
    {
      id: 'public_streak',
      label: 'Public streak',
      emoji: '📣',
      stakeType: 'public_streak',
      isCashStake: false,
      isEnabled: true,
      sortOrder: 4,
    },
    {
      id: 'charity',
      label: 'to charity',
      emoji: '🤍',
      stakeType: 'money',
      isCashStake: true,
      isEnabled: true,
      sortOrder: 1,
    },
  ],
  settings: {
    cashTiers: [5, 10, 25, 50, 100],
    allowCustomCashAmount: true,
    minCashAmount: 1,
    maxCashAmount: 1000,
    currencySymbol: '$',
  },
};

let memory: StakeConfigSnapshot | null = null;

function normalize(raw: any): StakeConfigSnapshot {
  const stakesIn = Array.isArray(raw?.stakes) ? raw.stakes : [];
  const settingsIn = raw?.settings || {};
  const stakes: StakeConfigItem[] = stakesIn
    .map((s: any, i: number) => ({
      id: String(s?.id || `stake_${i}`),
      label: String(s?.label || 'Stake'),
      emoji: String(s?.emoji || '⚡'),
      stakeType: (String(s?.stakeType || 'custom') as AdminStakeType) || 'custom',
      isCashStake: Boolean(s?.isCashStake || s?.stakeType === 'money'),
      isEnabled: s?.isEnabled !== false,
      sortOrder: Number(s?.sortOrder) || i + 1,
    }))
    .sort((a: StakeConfigItem, b: StakeConfigItem) => a.sortOrder - b.sortOrder);

  const cashTiers = Array.isArray(settingsIn.cashTiers)
    ? settingsIn.cashTiers.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    : FALLBACK.settings.cashTiers;

  return {
    stakes: stakes.length ? stakes : FALLBACK.stakes,
    settings: {
      cashTiers: cashTiers.length ? cashTiers : FALLBACK.settings.cashTiers,
      allowCustomCashAmount: settingsIn.allowCustomCashAmount !== false,
      minCashAmount: Number(settingsIn.minCashAmount) || 1,
      maxCashAmount: Number(settingsIn.maxCashAmount) || 1000,
      currencySymbol: String(settingsIn.currencySymbol || '$'),
    },
  };
}

/** Map admin stake row → mission stakeType used by API/local store. */
export function resolveMissionStakeType(item: StakeConfigItem): AdminStakeType {
  if (item.isCashStake || item.stakeType === 'money') return 'money';
  if (item.stakeType === 'friend_notify') return 'friend_notify';
  if (item.stakeType === 'public_streak') return 'public_streak';
  if (item.stakeType === 'streak_only') return 'streak_only';
  return 'custom';
}

export const stakeConfigStore = {
  async loadCached(): Promise<StakeConfigSnapshot> {
    if (memory) return memory;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        memory = normalize(JSON.parse(raw));
        return memory;
      }
    } catch {
      /* ignore */
    }
    memory = FALLBACK;
    return memory;
  },

  async refresh(): Promise<StakeConfigSnapshot> {
    try {
      const res = await fetch(
        `${APP_CONFIG.apiBaseUrl.replace(/\/$/, '')}/api/config/stake-config`,
      );
      const data = await res.json();
      const payload = data?.stakeConfig || data?.config || data;
      const next = normalize(payload);
      memory = next;
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
      return next;
    } catch {
      return this.loadCached();
    }
  },

  enabled(snapshot?: StakeConfigSnapshot): StakeConfigItem[] {
    const snap = snapshot || memory || FALLBACK;
    return snap.stakes.filter(s => s.isEnabled);
  },

  settings(snapshot?: StakeConfigSnapshot): StakeSettings {
    return (snapshot || memory || FALLBACK).settings;
  },
};

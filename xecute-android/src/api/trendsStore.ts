import {apiFetch, sessionStore} from './sessionStore';
import {RevenueCat} from '../billing/RevenueCat';

export type TrendSlot = {
  day: string;
  earned: number;
  wasted: number;
  productiveMinutes: number;
  missedMinutes: number;
};

export type WeeklyTrends = {
  slots: TrendSlot[];
  totalResolvedThisWeek: number;
  totalProductiveMinutes: number;
  totalMissedMinutes: number;
  isPro: boolean;
};

/**
 * Phase B — premium weekly trends from /api/weekly-stats.
 * Free users get a locked teaser; Pro/Founder get full slots.
 */
export const trendsStore = {
  async fetch(): Promise<WeeklyTrends> {
    let isPro = false;
    try {
      isPro = await RevenueCat.hasPro();
    } catch {
      isPro = false;
    }

    const user = await sessionStore.getUser();
    if (!user?.id) {
      return emptyTrends(isPro);
    }

    try {
      const res = await apiFetch(
        `/api/weekly-stats?userId=${encodeURIComponent(user.id)}`,
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) return emptyTrends(isPro);
      return {
        slots: Array.isArray(payload.slots) ? payload.slots : [],
        totalResolvedThisWeek: Number(payload.totalResolvedThisWeek || 0),
        totalProductiveMinutes: Number(payload.totalProductiveMinutes || 0),
        totalMissedMinutes: Number(payload.totalMissedMinutes || 0),
        isPro,
      };
    } catch {
      return emptyTrends(isPro);
    }
  },
};

function emptyTrends(isPro: boolean): WeeklyTrends {
  return {
    slots: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      earned: 0,
      wasted: 0,
      productiveMinutes: 0,
      missedMinutes: 0,
    })),
    totalResolvedThisWeek: 0,
    totalProductiveMinutes: 0,
    totalMissedMinutes: 0,
    isPro,
  };
}

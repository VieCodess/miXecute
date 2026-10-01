import {apiFetch} from './sessionStore';

export type ShieldSwitchEvent = {
  id: string;
  userId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  packageName?: string | null;
  action?: string;
  timestamp?: number;
  durationMs?: number;
  receivedAt?: string;
  source?: string;
};

export type ShieldStats = {
  summary: {
    totalBlocks: number;
    blocksToday: number;
    blocksThisWeek: number;
    uniqueAppsBlocked: number;
    appsOnBlocklist: number;
    domainsOnBlocklist: number;
    blocklistUpdatedAt?: string | null;
  };
  recentEvents: ShieldSwitchEvent[];
  blocklist: {apps: string[]; domains: string[]; updatedAt?: string | null};
};

export const shieldStatsStore = {
  async fetch(limit = 40): Promise<ShieldStats> {
    const res = await apiFetch(`/api/shield/stats?limit=${limit}`);
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error || 'Could not load Shield stats');
    }
    return {
      summary: payload.summary,
      recentEvents: Array.isArray(payload.recentEvents) ? payload.recentEvents : [],
      blocklist: payload.blocklist || {apps: [], domains: []},
    };
  },
};

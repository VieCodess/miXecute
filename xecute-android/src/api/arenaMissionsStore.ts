import AsyncStorage from '@react-native-async-storage/async-storage';
import {sessionStore} from './sessionStore';
import type {ExtractedTask} from './brainDumpExtract';

export type ArenaMissionStatus =
  | 'active'
  | 'pending'
  | 'completed'
  | 'missed';

export type ArenaMission = {
  id: string;
  rank: number;
  title: string;
  why: string;
  durationMinutes: number;
  status: ArenaMissionStatus;
  goalTitle: string;
  isLocked: boolean;
};

const KEY = 'xecute_arena_missions_v1';

async function readAll(): Promise<ArenaMission[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArenaMission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(missions: ArenaMission[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(missions));
}

async function isPro(): Promise<boolean> {
  const user = await sessionStore.getUser();
  const tier = (user?.tier || 'free').toLowerCase();
  return tier === 'pro' || tier === 'founder';
}

export const arenaMissionsStore = {
  async list(): Promise<ArenaMission[]> {
    const all = await readAll();
    return all.sort((a, b) => a.rank - b.rank);
  },

  async getActive(): Promise<ArenaMission | null> {
    const all = await readAll();
    return all.find(m => m.status === 'active') || null;
  },

  async hasActiveFocus(): Promise<boolean> {
    return Boolean(await this.getActive());
  },

  /** Import XBoss sequence — only rank 1 is active; free locks rank > 1. */
  async importFromBrainDump(
    topTasks: ExtractedTask[],
    primaryGoal: string,
  ): Promise<ArenaMission[]> {
    const pro = await isPro();
    const goal = primaryGoal || 'Primary Goal';
    const missions: ArenaMission[] = topTasks.slice(0, 4).map((t, idx) => ({
      id: `task-rank-${t.rank || idx + 1}`,
      rank: t.rank || idx + 1,
      title: t.title,
      why: t.why,
      durationMinutes: 30,
      status: idx === 0 ? 'active' : 'pending',
      goalTitle: t.goalName || goal,
      isLocked: pro ? false : idx > 0,
    }));
    await writeAll(missions);
    return missions;
  },

  async markCompleted(id: string): Promise<ArenaMission | null> {
    const all = await readAll();
    const idx = all.findIndex(m => m.id === id);
    if (idx < 0) return null;
    all[idx] = {...all[idx], status: 'completed'};
    await writeAll(all);
    return all[idx];
  },

  async markMissed(id: string): Promise<ArenaMission | null> {
    const all = await readAll();
    const idx = all.findIndex(m => m.id === id);
    if (idx < 0) return null;
    all[idx] = {...all[idx], status: 'missed'};
    await writeAll(all);
    return all[idx];
  },

  /** After a focus mission completes — mark active arena step done and advance (Pro). */
  async advanceAfterFocusComplete(arenaMissionId?: string): Promise<void> {
    const all = await readAll();
    if (all.length === 0) return;
    let targetId = arenaMissionId;
    if (!targetId) {
      targetId = all.find(m => m.status === 'active')?.id;
    }
    if (!targetId) return;

    const pro = await isPro();
    const updated = all.map(m =>
      m.id === targetId ? {...m, status: 'completed' as const} : m,
    );
    const nextPending = updated.find(
      m => m.status === 'pending' && !m.isLocked,
    );
    if (pro && nextPending) {
      const withNext = updated.map(m =>
        m.id === nextPending.id ? {...m, status: 'active' as const} : m,
      );
      await writeAll(withNext);
      return;
    }
    await writeAll(updated);
  },

  /** Activate a pending mission — blocked if another is already active. */
  async activate(id: string): Promise<{ok: true; mission: ArenaMission} | {ok: false; reason: string}> {
    const all = await readAll();
    const target = all.find(m => m.id === id);
    if (!target) return {ok: false, reason: 'Mission not found.'};
    if (target.isLocked) {
      return {ok: false, reason: 'Complete the prior mission or upgrade to unlock.'};
    }
    const otherActive = all.find(m => m.status === 'active' && m.id !== id);
    if (otherActive) {
      return {
        ok: false,
        reason: 'Finish your active mission before starting another.',
      };
    }
    if (target.status === 'completed' || target.status === 'missed') {
      return {ok: false, reason: 'This mission is already settled.'};
    }
    const next = all.map(m =>
      m.id === id ? {...m, status: 'active' as const} : m,
    );
    await writeAll(next);
    return {ok: true, mission: {...target, status: 'active'}};
  },
};

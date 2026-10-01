import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiFetch} from './sessionStore';
import {goalTankService} from './goalTankService';
import {arenaMissionsStore} from './arenaMissionsStore';

const MISSIONS_KEY = 'xecute_missions_v1';

export type StakeType =
  | 'streak_only'
  | 'friend_notify'
  | 'money'
  | 'public_streak'
  | 'custom';

export type MissionStatus = 'active' | 'completed' | 'missed' | 'pending';

export type Mission = {
  id: string;
  title: string;
  durationMinutes: number;
  stakeType: StakeType;
  stakeAmount?: number;
  stakeLabel?: string;
  stakeConfigId?: string;
  friendEmail?: string;
  friendName?: string;
  status: MissionStatus;
  startedAt: string | null;
  endsAt: string | null;
  createdAt: string;
  shieldArmed: boolean;
  arenaMissionId?: string;
};

export type StartMissionInput = {
  title: string;
  durationMinutes: number;
  stakeType: StakeType;
  stakeAmount?: number;
  stakeLabel?: string;
  stakeConfigId?: string;
  friendEmail?: string;
  friendName?: string;
  userId?: string;
  userName?: string;
  arenaMissionId?: string;
};

async function readAll(): Promise<Mission[]> {
  const raw = await AsyncStorage.getItem(MISSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Mission[];
  } catch {
    return [];
  }
}

async function writeAll(missions: Mission[]) {
  await AsyncStorage.setItem(MISSIONS_KEY, JSON.stringify(missions));
}

function uid() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const missionStore = {
  async list(): Promise<Mission[]> {
    const all = await readAll();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getActive(): Promise<Mission | null> {
    const all = await readAll();
    return all.find(m => m.status === 'active') || null;
  },

  async start(input: StartMissionInput): Promise<Mission> {
    const existingActive = await this.getActive();
    if (existingActive) {
      throw new Error(
        'ACTIVE_MISSION_EXISTS: Finish your current mission before starting another.',
      );
    }

    const now = new Date();
    const ends = new Date(now.getTime() + input.durationMinutes * 60_000);
    const mission: Mission = {
      id: uid(),
      title: input.title.trim() || 'Focus mission',
      durationMinutes: input.durationMinutes,
      stakeType: input.stakeType,
      stakeAmount: input.stakeAmount,
      stakeLabel: input.stakeLabel,
      stakeConfigId: input.stakeConfigId,
      friendEmail: input.friendEmail,
      friendName: input.friendName,
      status: 'active',
      startedAt: now.toISOString(),
      endsAt: ends.toISOString(),
      createdAt: now.toISOString(),
      shieldArmed: true,
      arenaMissionId: input.arenaMissionId,
    };

    const all = await readAll();
    const next = [mission, ...all];
    await writeAll(next);

    // Best-effort API sync — app works fully offline without this
    void this.syncCommitment(mission, input).catch(() => undefined);

    return mission;
  },

  async syncCommitment(mission: Mission, input: StartMissionInput) {
    const friend =
      input.friendName && input.friendEmail
        ? `${input.friendName} <${input.friendEmail}>`
        : input.friendEmail || null;

    await apiFetch('/api/commitment', {
      method: 'POST',
      body: JSON.stringify({
        userId: input.userId || null,
        userName: input.userName || null,
        taskId: mission.id,
        stakeType: mission.stakeType,
        stakeAmount: mission.stakeAmount || 0,
        friendEmail: mission.stakeType === 'friend_notify' ? friend : null,
        friendName: input.friendName || null,
        delayMs: 0,
      }),
    });

    await apiFetch('/api/task-status', {
      method: 'POST',
      body: JSON.stringify({
        userId: input.userId || null,
        taskId: mission.id,
        status: 'active',
      }),
    });

    await apiFetch('/api/session/reconcile', {
      method: 'POST',
      body: JSON.stringify({
        taskId: mission.id,
        userId: input.userId || null,
        sessionOverride: {
          taskId: mission.id,
          scopedDurationSeconds: mission.durationMinutes * 60,
          activeDurationSeconds: 0,
          startedAt: mission.startedAt,
          endedAt: null,
          source: 'xlock',
        },
      }),
    });
  },

  async complete(missionId: string, userId?: string): Promise<Mission | null> {
    const all = await readAll();
    const idx = all.findIndex(m => m.id === missionId);
    if (idx < 0) return null;
    const updated = {
      ...all[idx],
      status: 'completed' as const,
    };
    all[idx] = updated;
    await writeAll(all);

    void apiFetch('/api/task-status', {
      method: 'POST',
      body: JSON.stringify({
        userId: userId || null,
        taskId: missionId,
        status: 'completed',
      }),
    }).catch(() => undefined);

    void goalTankService
      .fillGoalTank(undefined, updated.title)
      .catch(() => undefined);

    void arenaMissionsStore
      .advanceAfterFocusComplete(updated.arenaMissionId)
      .catch(() => undefined);

    return updated;
  },

  async miss(missionId: string, input?: {
    userId?: string;
    userName?: string;
    friendEmail?: string;
    friendName?: string;
  }): Promise<Mission | null> {
    const all = await readAll();
    const idx = all.findIndex(m => m.id === missionId);
    if (idx < 0) return null;
    const mission = all[idx];
    const updated = {...mission, status: 'missed' as const};
    all[idx] = updated;
    await writeAll(all);

    void apiFetch('/api/task-status', {
      method: 'POST',
      body: JSON.stringify({
        userId: input?.userId || null,
        userName: input?.userName || null,
        taskId: missionId,
        status: 'missed',
        taskTitle: mission.title,
        friendEmail: mission.friendEmail || input?.friendEmail || null,
        friendName: mission.friendName || input?.friendName || null,
        delayMs: 0,
      }),
    }).catch(() => undefined);

    return updated;
  },
};

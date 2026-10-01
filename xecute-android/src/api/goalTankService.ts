import AsyncStorage from '@react-native-async-storage/async-storage';
import {sessionStore} from './sessionStore';

export type GoalMode = 'quick_sprint' | 'campaign';

export interface GoalTank {
  goalId: string;
  goalTitle: string;
  tasksCompleted: number;
  tasksTotal: number;
  status: 'On Track' | 'In Progress' | 'Stalled';
  latestTask: string;
  timeSinceLastProgress: string;
  icon?: string;
  isPhaseGoal?: boolean;
  goalMode?: GoalMode;
}

export const SPRINT_PIPELINE_UNITS = 8;
export const CAMPAIGN_PIPELINE_UNITS = 32;
export const SPRINT_MISSIONS_PER_CYCLE = 4;

export interface BrainDumpGate {
  goalMode: GoalMode;
  missionsCompletedThisCycle: number;
  manualUnlock: boolean;
}

export interface BrainDumpStatus {
  isLocked: boolean;
  goalMode: GoalMode;
  missionsCompleted: number;
  missionsRequired: number;
  tankPercent: number;
}

export interface RankedTaskInput {
  rank?: number;
  title: string;
  whyText?: string;
  why?: string;
  goalName?: string;
  suggested_duration_mins?: number;
}

const STORAGE_GOAL_TANKS_KEY = 'xecute_goal_tanks_v3';
const STORAGE_SYNC_SUMMARY_KEY = 'xecute_tank_sync_summary_v3';
const STORAGE_BRAIN_DUMP_GATE_KEY = 'xecute_brain_dump_gate_v1';

const DEFAULT_BRAIN_DUMP_GATE: BrainDumpGate = {
  goalMode: 'quick_sprint',
  missionsCompletedThisCycle: 0,
  manualUnlock: false,
};

type TankListener = () => void;
const listeners = new Set<TankListener>();

function notify() {
  listeners.forEach(l => l());
}

export function getIconForGoalTitle(title: string): string {
  const lower = title.toLowerCase();
  if (
    lower.includes('saas') ||
    lower.includes('client') ||
    lower.includes('revenue') ||
    lower.includes('money') ||
    lower.includes('business') ||
    lower.includes('offer')
  ) {
    return 'DollarSign';
  }
  if (
    lower.includes('run') ||
    lower.includes('fitness') ||
    lower.includes('health') ||
    lower.includes('marathon') ||
    lower.includes('workout')
  ) {
    return 'Heart';
  }
  if (
    lower.includes('code') ||
    lower.includes('app') ||
    lower.includes('build') ||
    lower.includes('system') ||
    lower.includes('dev')
  ) {
    return 'Code';
  }
  if (
    lower.includes('read') ||
    lower.includes('book') ||
    lower.includes('study') ||
    lower.includes('learn') ||
    lower.includes('write')
  ) {
    return 'BookOpen';
  }
  if (
    lower.includes('growth') ||
    lower.includes('audience') ||
    lower.includes('market') ||
    lower.includes('scale')
  ) {
    return 'TrendingUp';
  }
  if (
    lower.includes('meditat') ||
    lower.includes('mind') ||
    lower.includes('focus') ||
    lower.includes('habit') ||
    lower.includes('brain')
  ) {
    return 'Brain';
  }
  return 'Trophy';
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function isPaidUser(): Promise<boolean> {
  const user = await sessionStore.getUser();
  if (!user) return false;
  const tier = (user.tier || 'free').toLowerCase();
  return tier === 'pro' || tier === 'founder';
}

export const goalTankService = {
  subscribe(listener: TankListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async getTanks(): Promise<GoalTank[]> {
    const parsed = await readJson<GoalTank[]>(STORAGE_GOAL_TANKS_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  },

  async saveTanks(tanks: GoalTank[]) {
    await AsyncStorage.setItem(STORAGE_GOAL_TANKS_KEY, JSON.stringify(tanks));
    notify();
  },

  async getBrainDumpGate(): Promise<BrainDumpGate> {
    const gate = await readJson<BrainDumpGate>(
      STORAGE_BRAIN_DUMP_GATE_KEY,
      DEFAULT_BRAIN_DUMP_GATE,
    );
    return {...DEFAULT_BRAIN_DUMP_GATE, ...gate};
  },

  async saveBrainDumpGate(gate: BrainDumpGate) {
    await AsyncStorage.setItem(STORAGE_BRAIN_DUMP_GATE_KEY, JSON.stringify(gate));
    notify();
  },

  async getGoalMode(): Promise<GoalMode> {
    const gate = await this.getBrainDumpGate();
    return gate.goalMode;
  },

  async setGoalMode(mode: GoalMode) {
    const gate = await this.getBrainDumpGate();
    if (gate.goalMode === mode) return;
    await this.saveBrainDumpGate({
      goalMode: mode,
      missionsCompletedThisCycle: 0,
      manualUnlock: false,
    });
  },

  async getBrainDumpStatus(): Promise<BrainDumpStatus> {
    const gate = await this.getBrainDumpGate();
    const tanks = await this.getTanks();
    const totalUnits = tanks.reduce((sum, t) => sum + Math.max(1, t.tasksTotal), 0);
    const filledUnits = tanks.reduce(
      (sum, t) => sum + Math.min(t.tasksCompleted, t.tasksTotal),
      0,
    );
    const tankPercent =
      totalUnits > 0 ? Math.round((filledUnits / totalUnits) * 100) : 0;

    const base: Omit<BrainDumpStatus, 'isLocked'> = {
      goalMode: gate.goalMode,
      missionsCompleted: gate.missionsCompletedThisCycle,
      missionsRequired: SPRINT_MISSIONS_PER_CYCLE,
      tankPercent,
    };

    if (tanks.length === 0 || gate.manualUnlock) {
      return {...base, isLocked: false};
    }

    if (gate.goalMode === 'campaign') {
      return {...base, isLocked: tankPercent < 100};
    }

    return {
      ...base,
      isLocked: gate.missionsCompletedThisCycle < SPRINT_MISSIONS_PER_CYCLE,
    };
  },

  async isBrainDumpLocked(): Promise<boolean> {
    const s = await this.getBrainDumpStatus();
    return s.isLocked;
  },

  async unlockBrainDump() {
    const gate = await this.getBrainDumpGate();
    if (gate.manualUnlock) return;
    await this.saveBrainDumpGate({...gate, manualUnlock: true});
  },

  async syncTanksFromXboss(
    topTasks: RankedTaskInput[] = [],
    extractedGoal?: string,
    hasMultipleGoalsFlag?: boolean,
    goalMode: GoalMode = 'quick_sprint',
  ) {
    const isCampaign = goalMode === 'campaign';
    const paid = await isPaidUser();

    const rawGoalNames: string[] = [];
    topTasks.forEach(t => {
      if (t.goalName && !t.goalName.toLowerCase().startsWith('phase ')) {
        if (!rawGoalNames.includes(t.goalName)) rawGoalNames.push(t.goalName);
      }
    });

    const isMultipleGoals = Boolean(hasMultipleGoalsFlag || rawGoalNames.length > 1);
    const primaryGoalTitle =
      extractedGoal || topTasks[0]?.goalName || 'Primary Goal';

    let newTanks: GoalTank[] = [];
    let lockedExtraCount = 0;

    if (isMultipleGoals) {
      const distinctGoals =
        rawGoalNames.length > 0
          ? rawGoalNames
          : [primaryGoalTitle, 'Secondary Mission', 'Growth & Operations'];

      if (paid) {
        newTanks = distinctGoals.map((gTitle, idx) => {
          const tasksForGoal = topTasks.filter(t => t.goalName === gTitle);
          const goalSlug = gTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return {
            goalId: `tank-${goalSlug}-${idx}`,
            goalTitle: gTitle,
            tasksCompleted: 1,
            tasksTotal: isCampaign
              ? CAMPAIGN_PIPELINE_UNITS
              : Math.max(4, tasksForGoal.length * 2),
            status: 'In Progress' as const,
            latestTask: tasksForGoal[0]?.title || `Primary domino for ${gTitle}`,
            timeSinceLastProgress: 'Just now',
            icon: getIconForGoalTitle(gTitle),
            isPhaseGoal: false,
            goalMode,
          };
        });
      } else {
        lockedExtraCount = Math.max(1, distinctGoals.length - 1);
        const mainGoalTitle = distinctGoals[0] || primaryGoalTitle;
        const cleanTitle =
          mainGoalTitle.replace(/^Phase\s*\d+:\s*/i, '').trim() || 'Primary Goal';
        newTanks = [
          {
            goalId: 'tank-primary-free',
            goalTitle: cleanTitle.length > 30 ? 'Primary Goal' : cleanTitle,
            tasksCompleted: 1,
            tasksTotal: isCampaign
              ? CAMPAIGN_PIPELINE_UNITS
              : Math.max(4, topTasks.length),
            status: 'In Progress',
            latestTask: topTasks[0]?.title || 'Started Phase 1 sequence',
            timeSinceLastProgress: 'Just now',
            icon: getIconForGoalTitle(cleanTitle),
            isPhaseGoal: true,
            goalMode,
          },
        ];
      }
    } else {
      const cleanGoalTitle =
        primaryGoalTitle.replace(/^Phase\s*\d+:\s*/i, '').trim() || 'Primary Goal';
      newTanks = [
        {
          goalId: 'tank-primary-free',
          goalTitle: cleanGoalTitle.length > 35 ? 'Primary Goal' : cleanGoalTitle,
          tasksCompleted: 1,
          tasksTotal: isCampaign
            ? CAMPAIGN_PIPELINE_UNITS
            : Math.max(
                4,
                topTasks.length > 0 ? topTasks.length * 2 : SPRINT_PIPELINE_UNITS,
              ),
          status: 'In Progress',
          latestTask: topTasks[0]?.title || 'XBoss Phase 1 sequence unlocked',
          timeSinceLastProgress: 'Just now',
          icon: getIconForGoalTitle(cleanGoalTitle),
          isPhaseGoal: true,
          goalMode,
        },
      ];
    }

    await this.saveTanks(newTanks);
    if (topTasks.length > 0) {
      await this.saveBrainDumpGate({
        goalMode,
        missionsCompletedThisCycle: 0,
        manualUnlock: false,
      });
    }
    await AsyncStorage.setItem(
      STORAGE_SYNC_SUMMARY_KEY,
      JSON.stringify({
        hasMultipleGoals: isMultipleGoals,
        distinctGoalsCount: isMultipleGoals ? rawGoalNames.length || 3 : 1,
        isPaidUser: paid,
        activeTanksCount: newTanks.length,
        lockedExtraGoalsCount: lockedExtraCount,
      }),
    );
    notify();
  },

  async fillGoalTank(
    goalTitleOrId?: string,
    taskTitleCustom?: string,
  ): Promise<{tank: GoalTank; prevCompleted: number; newCompleted: number} | null> {
    const tanks = await this.getTanks();
    if (tanks.length === 0) return null;

    let targetIdx = -1;
    if (goalTitleOrId) {
      targetIdx = tanks.findIndex(
        t =>
          t.goalId === goalTitleOrId ||
          t.goalTitle.toLowerCase().includes(goalTitleOrId.toLowerCase()),
      );
    }
    if (targetIdx === -1) targetIdx = 0;

    const target = tanks[targetIdx];
    const prevCompleted = target.tasksCompleted;
    const newCompleted = Math.min(target.tasksTotal, target.tasksCompleted + 1);
    const pct = (newCompleted / target.tasksTotal) * 100;
    const newStatus: GoalTank['status'] =
      pct >= 50 ? 'On Track' : 'In Progress';

    const updatedTank: GoalTank = {
      ...target,
      tasksCompleted: newCompleted,
      status: newStatus,
      latestTask: taskTitleCustom || `Completed step #${newCompleted}`,
      timeSinceLastProgress: 'Just now',
    };

    tanks[targetIdx] = updatedTank;
    await this.saveTanks(tanks);

    const gate = await this.getBrainDumpGate();
    await this.saveBrainDumpGate({
      ...gate,
      missionsCompletedThisCycle: gate.missionsCompletedThisCycle + 1,
    });

    return {tank: updatedTank, prevCompleted, newCompleted};
  },
};

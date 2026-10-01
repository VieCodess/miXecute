import {apiFetch, sessionStore} from './sessionStore';
import {missionStore, Mission} from './missionStore';
import {BlockerBridge} from '../native/BlockerBridge';

export type ResumeState = {
  mission: Mission;
  remainingMs: number;
  shieldActive: boolean;
  needsRearm: boolean;
};

/**
 * Phase B — session resume.
 * Detect interrupted active missions after app reboot / process death
 * and re-arm Shield + reconcile with the API.
 */
export const sessionResume = {
  async detect(): Promise<ResumeState | null> {
    const mission = await missionStore.getActive();
    if (!mission?.endsAt) return null;
    const ends = new Date(mission.endsAt).getTime();
    const remainingMs = ends - Date.now();
    if (remainingMs <= 0) {
      // Time expired while away — leave ActiveMission to settle complete/miss
      return {
        mission,
        remainingMs: 0,
        shieldActive: false,
        needsRearm: false,
      };
    }
    let shieldActive = false;
    try {
      shieldActive = await BlockerBridge.isShieldActive();
    } catch {
      shieldActive = false;
    }
    return {
      mission,
      remainingMs,
      shieldActive,
      needsRearm: mission.shieldArmed && !shieldActive,
    };
  },

  async resume(mission: Mission): Promise<void> {
    if (mission.shieldArmed) {
      const remainingMin = Math.max(
        1,
        Math.ceil(
          (new Date(mission.endsAt || Date.now()).getTime() - Date.now()) /
            60000,
        ),
      );
      try {
        await BlockerBridge.startFocusSession({
          taskId: mission.id,
          durationMinutes: remainingMin,
          isStrict: true,
        });
        await BlockerBridge.toggleShield(true);
      } catch {
        // Shield permissions may be missing — UI still opens ActiveMission
      }
    }
    const user = await sessionStore.getUser();
    if (user?.id) {
      try {
        const remainingMs = Math.max(
          0,
          new Date(mission.endsAt || Date.now()).getTime() - Date.now(),
        );
        const resumedAt = new Date().toISOString();
        await apiFetch('/api/session/reconcile', {
          method: 'POST',
          body: JSON.stringify({
            taskId: mission.id,
            userId: user.id,
            resumedAt,
            remainingMs,
            shieldArmed: mission.shieldArmed,
            source: 'xecute_android',
            sessionOverride: {
              taskId: mission.id,
              scopedDurationSeconds: Math.max(60, Math.ceil(remainingMs / 1000)),
              activeDurationSeconds: 0,
              startedAt: mission.startedAt || resumedAt,
              endedAt: null,
              source: 'xecute_android',
            },
          }),
        });
      } catch {
        // Offline OK
      }
    }
  },
};

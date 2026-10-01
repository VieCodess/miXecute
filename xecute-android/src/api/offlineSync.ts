import {Platform} from 'react-native';
import {APP_CONFIG} from '../config';
import {apiFetch, sessionStore} from './sessionStore';
import {BlockerBridge} from '../native/BlockerBridge';

/**
 * Spec Phase 2 — drain Room sync_queue via authenticated API.
 * Prefer native OfflineSyncManager when credentials are configured;
 * also walk pending items from JS as a fallback for auth edge cases.
 */
export const offlineSync = {
  async configureFromSession(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      const [token, user] = await Promise.all([
        sessionStore.getToken(),
        sessionStore.getUser(),
      ]);
      await BlockerBridge.configureOfflineSync(
        APP_CONFIG.apiBaseUrl,
        token,
        user?.id ?? null,
      );
    } catch {
      // Offline OK
    }
  },

  async clear(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await BlockerBridge.configureOfflineSync(null, null, null);
    } catch {
      // ignore
    }
  },

  async flush(): Promise<number> {
    if (Platform.OS !== 'android') return 0;
    await this.configureFromSession();
    let flushed = 0;
    try {
      flushed = await BlockerBridge.flushOfflineSync();
    } catch {
      flushed = 0;
    }

    // JS fallback for any remaining rows (auth headers always available here)
    try {
      const pending = await BlockerBridge.getPendingSyncItems();
      for (const item of pending) {
        if (item.retryCount >= 8) continue;
        const [method, path] = splitEndpoint(item.endpoint);
        if (!path) continue;
        try {
          const body = await enrichQueuedPayload(item.endpoint, item.payload);
          const res = await apiFetch(path, {
            method,
            body,
            headers: {'X-Idempotency-Key': item.idempotencyKey},
          });
          if (res.ok || (res.status >= 400 && res.status < 500)) {
            await BlockerBridge.markSyncItemDone(item.id);
            flushed++;
          } else {
            await BlockerBridge.bumpSyncItemRetry(item.id);
          }
        } catch {
          await BlockerBridge.bumpSyncItemRetry(item.id).catch(() => undefined);
        }
      }
    } catch {
      // ignore
    }
    return flushed;
  },
};

function splitEndpoint(endpoint: string): [string, string] {
  const parts = endpoint.trim().split(/\s+/, 2);
  if (parts.length === 2) return [parts[0].toUpperCase(), parts[1]];
  return ['POST', parts[0] || ''];
}

async function enrichQueuedPayload(
  endpoint: string,
  payload: string,
): Promise<string> {
  try {
    const obj = JSON.parse(payload || '{}') as Record<string, any>;
    const [user, token] = await Promise.all([
      sessionStore.getUser(),
      sessionStore.getToken(),
    ]);
    void token;
    if (!obj.userId && user?.id) obj.userId = user.id;
    if (
      (endpoint.includes('/session/reconcile') ||
        endpoint.includes('/session/events')) &&
      !obj.taskId
    ) {
      // leave as-is if unknown — backend accepts null taskId for events
    }
    if (endpoint.includes('/session/reconcile') && !obj.sessionOverride) {
      const mins = Number(obj.durationMinutes) || 0;
      const scoped = mins > 0 ? mins * 60 : 1800;
      const completed = obj.completed === true;
      obj.source = obj.source || 'xecute_android';
      obj.sessionOverride = {
        taskId: obj.taskId,
        scopedDurationSeconds: scoped,
        activeDurationSeconds: completed ? scoped : 0,
        startedAt: obj.startedAt || new Date().toISOString(),
        endedAt: obj.endedAt ?? (obj.completed != null ? new Date().toISOString() : null),
        source: 'xecute_android',
      };
    }
    return JSON.stringify(obj);
  } catch {
    return payload;
  }
}

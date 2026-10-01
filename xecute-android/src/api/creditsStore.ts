import {apiFetch, sessionStore} from './sessionStore';
import {BlockerBridge} from '../native/BlockerBridge';
import {APP_CONFIG} from '../config';

export type CreditsSnapshot = {
  balance: number;
  currency?: string;
  staked?: number;
  /** True when balance came from /api/credits (admin-visible ledger). */
  serverAuthoritative: boolean;
  lastSyncedAt?: string;
};

/**
 * Phase B — server-authoritative XCredits.
 * Online: server wallet wins. Offline: local Shield cache for breaks only.
 * Admin sees the same ledger via /api/credits/*.
 */
export const creditsStore = {
  async getLocalBalance(): Promise<number> {
    try {
      return await BlockerBridge.getXCreditsBalance();
    } catch {
      return APP_CONFIG.defaultXCreditsBalance;
    }
  },

  /** Flush pending burns, then pull authoritative balance from server. */
  async sync(): Promise<CreditsSnapshot | null> {
    await this.flushPendingBurns();
    return this.pullFromServer();
  },

  async flushPendingBurns(): Promise<void> {
    const user = await sessionStore.getUser();
    if (!user?.id) return;
    let pending = 0;
    try {
      pending = await BlockerBridge.getPendingXCreditsBurn();
    } catch {
      return;
    }
    if (pending <= 0) return;
    try {
      const res = await apiFetch('/api/credits/burn', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          amount: pending,
          reason: 'Shield break',
        }),
      });
      if (res.ok) {
        await BlockerBridge.clearPendingXCreditsBurn(pending);
      }
    } catch {
      // Retry next sync
    }
  },

  async pullFromServer(): Promise<CreditsSnapshot | null> {
    const user = await sessionStore.getUser();
    if (!user?.id) return null;
    try {
      const res = await apiFetch(
        `/api/credits/balance?userId=${encodeURIComponent(user.id)}`,
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) return null;
      const balance = Math.round(
        Number(payload.XCreditsBalance ?? payload.creditBalance ?? 0),
      );
      await BlockerBridge.setXCreditsBalance(balance);
      return {
        balance,
        currency: payload.currency || 'USD',
        staked: Number(
          payload.XCreditsStakedInEscrow ?? payload.creditStakedInEscrow ?? 0,
        ),
        serverAuthoritative: true,
        lastSyncedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  },

  /**
   * Mission reward — mint on server first when online (admin ledger),
   * then mirror local cache from server response. Offline: optimistic local.
   */
  async earn(amount: number, reason?: string, taskId?: string): Promise<number> {
    const user = await sessionStore.getUser();
    if (user?.id) {
      try {
        const res = await apiFetch('/api/credits/earn', {
          method: 'POST',
          body: JSON.stringify({
            userId: user.id,
            amount,
            reason: reason || 'Mission reward',
            taskId,
          }),
        });
        const payload = await res.json();
        if (res.ok && payload.success) {
          const balance = Math.round(
            Number(payload.XCreditsBalance ?? payload.creditBalance ?? amount),
          );
          await BlockerBridge.setXCreditsBalance(balance);
          return balance;
        }
      } catch {
        // fall through to local
      }
    }
    return BlockerBridge.earnXCredits(amount);
  },

  /**
   * Explicit burn — server first when online; local + pending queue offline.
   */
  async burn(amount: number, reason?: string): Promise<number> {
    const user = await sessionStore.getUser();
    if (user?.id) {
      try {
        const res = await apiFetch('/api/credits/burn', {
          method: 'POST',
          body: JSON.stringify({
            userId: user.id,
            amount,
            reason: reason || 'Shield break',
          }),
        });
        const payload = await res.json();
        if (res.ok && payload.success) {
          const balance = Math.round(
            Number(
              payload.newBalance ??
                payload.XCreditsBalance ??
                payload.creditBalance ??
                0,
            ),
          );
          await BlockerBridge.setXCreditsBalance(balance);
          await BlockerBridge.clearPendingXCreditsBurn(amount).catch(() => 0);
          return balance;
        }
      } catch {
        // fall through
      }
    }
    return BlockerBridge.burnXCredits(amount);
  },
};

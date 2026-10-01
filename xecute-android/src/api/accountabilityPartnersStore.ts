import AsyncStorage from '@react-native-async-storage/async-storage';
import {apiFetch} from './sessionStore';

const DEFAULT_PARTNER_KEY = 'xecute_default_partner_v1';

export type AccountabilityPartner = {
  id: string;
  userId: string;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  partnerAvatar?: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  direction?: 'incoming' | 'outgoing' | 'active';
  mutualGoals?: string[];
  sharedStreaks?: number;
  lastInteraction?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Email invite sent before they registered on Xecute */
  externalInvite?: boolean;
  inviteStatus?: 'pending' | 'joined' | 'cancelled';
};

function parseError(payload: any, fallback: string): string {
  if (typeof payload?.error === 'string') return payload.error;
  if (payload?.error?.message) return String(payload.error.message);
  return fallback;
}

export const accountabilityPartnersStore = {
  async list(): Promise<AccountabilityPartner[]> {
    const res = await apiFetch('/api/v1/social/partners');
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(parseError(payload, 'Could not load partners'));
    }
    return Array.isArray(payload.data) ? payload.data : [];
  },

  async request(partnerEmail: string): Promise<{
    externalInvite?: boolean;
    message?: string;
    emailSent?: boolean;
  }> {
    const res = await apiFetch('/api/v1/social/partners/request', {
      method: 'POST',
      body: JSON.stringify({partnerEmail: partnerEmail.trim().toLowerCase()}),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(parseError(payload, 'Could not send partner request'));
    }
    return {
      externalInvite: payload.externalInvite,
      message: payload.message,
      emailSent: payload.emailSent,
    };
  },

  async respond(partnershipId: string, accept: boolean): Promise<void> {
    const res = await apiFetch(
      `/api/v1/social/partners/${encodeURIComponent(partnershipId)}/respond`,
      {
        method: 'PUT',
        body: JSON.stringify({status: accept ? 'accepted' : 'declined'}),
      },
    );
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(parseError(payload, 'Could not respond to request'));
    }
  },

  async remove(partnershipId: string): Promise<void> {
    const res = await apiFetch(
      `/api/v1/social/partners/${encodeURIComponent(partnershipId)}`,
      {method: 'DELETE'},
    );
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(parseError(payload, 'Could not remove partner'));
    }
  },

  accepted(partners: AccountabilityPartner[]): AccountabilityPartner[] {
    return partners.filter(p => p.status === 'accepted');
  },

  /** Partners who receive missed-mission alerts (in-app or email invite). */
  alertTargets(partners: AccountabilityPartner[]): AccountabilityPartner[] {
    return partners.filter(
      p =>
        p.status === 'accepted' ||
        (p.externalInvite && p.direction === 'outgoing' && p.inviteStatus !== 'cancelled'),
    );
  },

  incomingPending(partners: AccountabilityPartner[]): AccountabilityPartner[] {
    return partners.filter(
      p => p.status === 'pending' && p.direction === 'incoming',
    );
  },

  outgoingPending(partners: AccountabilityPartner[]): AccountabilityPartner[] {
    return partners.filter(
      p => p.status === 'pending' && p.direction === 'outgoing',
    );
  },

  async getDefaultPartnerId(): Promise<string | null> {
    return AsyncStorage.getItem(DEFAULT_PARTNER_KEY);
  },

  async setDefaultPartnerId(partnershipId: string | null): Promise<void> {
    if (!partnershipId) {
      await AsyncStorage.removeItem(DEFAULT_PARTNER_KEY);
      return;
    }
    await AsyncStorage.setItem(DEFAULT_PARTNER_KEY, partnershipId);
  },

  async resolveDefaultPartner(
    partners: AccountabilityPartner[],
  ): Promise<AccountabilityPartner | null> {
    const targets = this.alertTargets(partners);
    if (!targets.length) return null;
    const savedId = await this.getDefaultPartnerId();
    if (savedId) {
      const hit = targets.find(p => p.id === savedId);
      if (hit) return hit;
    }
    return targets[0];
  },
};

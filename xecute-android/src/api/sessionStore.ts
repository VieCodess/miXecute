import AsyncStorage from '@react-native-async-storage/async-storage';
import {APP_CONFIG} from '../config';

const TOKEN_KEY = 'xecute_access_token';
const USER_KEY = 'xecute_user';
const LOCAL_ACCOUNTS_KEY = 'xecute_local_accounts_v1';

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
  tier?: string;
};

export type AuthResult = {
  success: boolean;
  user?: PublicUser;
  token?: string;
  error?: string;
  offline?: boolean;
};

type LocalAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  tier?: string;
};

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function getLocalAccounts(): Promise<LocalAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalAccounts(accounts: LocalAccount[]) {
  await AsyncStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** Fail fast when API is not deployed / unreachable so offline auth can take over. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  ms = 4000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit & {auth?: boolean} = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (options.auth !== false) {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const url = path.startsWith('http')
    ? path
    : `${APP_CONFIG.apiBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const {auth: _auth, ...rest} = options;
  return fetchWithTimeout(url, {...rest, headers});
}

function isDemoCredentials(email: string, password: string): boolean {
  const demo = APP_CONFIG.demoAccount;
  return (
    email.trim().toLowerCase() === demo.email.toLowerCase() &&
    password === demo.password
  );
}

export const sessionStore = {
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async getUser(): Promise<PublicUser | null> {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PublicUser;
    } catch {
      return null;
    }
  },

  async setSession(user: PublicUser, token?: string | null) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  },

  async clear() {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  },

  async openLocalSession(
    user: PublicUser,
    reason: 'demo' | 'local' = 'local',
  ): Promise<AuthResult> {
    const token = `${reason}-offline.${user.id}.${Date.now()}`;
    await this.setSession(user, token);
    return {success: true, user, token, offline: true};
  },

  /** Offline auth when API is not deployed yet. */
  async loginOffline(email: string, password: string): Promise<AuthResult> {
    const cleanEmail = email.trim().toLowerCase();
    if (isDemoCredentials(cleanEmail, password)) {
      const demo = APP_CONFIG.demoAccount;
      return this.openLocalSession(
        {
          id: 'demo-local-47902e45',
          name: demo.name,
          email: demo.email,
          role: 'user',
          tier: 'pro',
        },
        'demo',
      );
    }

    const accounts = await getLocalAccounts();
    const found = accounts.find(
      a => a.email === cleanEmail && a.password === password,
    );
    if (found) {
      return this.openLocalSession({
        id: found.id,
        name: found.name,
        email: found.email,
        role: 'user',
        tier: found.tier || 'free',
      });
    }

    return {
      success: false,
      error:
        'API not reachable yet. Use the demo account, tap Continue with demo account, or Sign Up (saved on this device until you deploy the API).',
    };
  },

  async registerOffline(
    name: string,
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || cleanEmail.split('@')[0] || 'Soldier';
    if (!cleanEmail.includes('@') || password.length < 6) {
      return {
        success: false,
        error: 'Valid email and password (6+ chars) required.',
      };
    }

    if (isDemoCredentials(cleanEmail, password)) {
      return this.loginOffline(cleanEmail, password);
    }

    const accounts = await getLocalAccounts();
    if (accounts.some(a => a.email === cleanEmail)) {
      return {
        success: false,
        error: 'An account with this email already exists on this device.',
      };
    }

    const account: LocalAccount = {
      id: `local-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      password,
      tier: 'free',
    };
    await saveLocalAccounts([...accounts, account]);
    return this.openLocalSession({
      id: account.id,
      name: account.name,
      email: account.email,
      role: 'user',
      tier: 'free',
    });
  },

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({email, password}),
      });
      const payload = await parseJson(res);
      if (!res.ok || !payload.success) {
        // Fall through to offline if demo / local account matches
        const offline = await this.loginOffline(email, password);
        if (offline.success) return offline;
        return {success: false, error: payload.error || 'Login failed'};
      }
      const user = payload.user as PublicUser;
      await this.setSession(user, payload.token || null);
      return {success: true, user, token: payload.token};
    } catch {
      return this.loginOffline(email, password);
    }
  },

  async register(
    name: string,
    email: string,
    password: string,
  ): Promise<AuthResult> {
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({name, email, password}),
      });
      const payload = await parseJson(res);
      if (!res.ok || !payload.success) {
        // Prefer offline create when API is up but rejected / misconfigured
        if (res.status >= 500 || res.status === 0) {
          return this.registerOffline(name, email, password);
        }
        return {success: false, error: payload.error || 'Sign up failed'};
      }
      const user = payload.user as PublicUser;
      await this.setSession(user, payload.token || null);
      return {success: true, user, token: payload.token};
    } catch {
      return this.registerOffline(name, email, password);
    }
  },

  async refreshMe(): Promise<PublicUser | null> {
    try {
      const res = await apiFetch('/api/auth/me');
      const payload = await parseJson(res);
      if (!res.ok || !payload.success || !payload.user) return null;
      await this.setSession(payload.user);
      return payload.user as PublicUser;
    } catch {
      return this.getUser();
    }
  },

  /** Accept JWT from OAuth / magic-link deep link (xecute://auth/callback?token=...). */
  async acceptToken(token: string): Promise<AuthResult> {
    const clean = String(token || '').trim();
    if (!clean) return {success: false, error: 'Missing auth token'};
    try {
      await AsyncStorage.setItem(TOKEN_KEY, clean);
      const user = await this.refreshMe();
      if (!user) {
        await this.clear();
        return {success: false, error: 'Could not verify session from link'};
      }
      return {success: true, user, token: clean};
    } catch {
      return {success: false, error: 'Could not complete sign-in from link'};
    }
  },

  async startGoogleOAuth(): Promise<{success: boolean; url?: string; error?: string}> {
    try {
      const res = await apiFetch('/api/auth/oauth/google', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({redirectTo: 'xecute://auth/callback'}),
      });
      const payload = await parseJson(res);
      if (!res.ok || !payload.success || !payload.url) {
        return {
          success: false,
          error:
            payload.error ||
            'Google sign-in needs the API. Use email/password or demo for now.',
        };
      }
      return {success: true, url: String(payload.url)};
    } catch {
      return {
        success: false,
        error: 'Google sign-in needs the API. Use email/password or demo for now.',
      };
    }
  },

  async sendMagicLink(email: string): Promise<{success: boolean; error?: string}> {
    try {
      const res = await apiFetch('/api/auth/magic-link', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          redirectTo: 'xecute://auth/callback',
        }),
      });
      const payload = await parseJson(res);
      if (!res.ok || !payload.success) {
        return {
          success: false,
          error:
            payload.error ||
            'Magic link needs the API. Use email/password or demo for now.',
        };
      }
      return {success: true};
    } catch {
      return {
        success: false,
        error: 'Magic link needs the API. Use email/password or demo for now.',
      };
    }
  },

  /**
   * Soft-launch demo: try live API; if unreachable, open local Pro session.
   */
  async loginDemo(): Promise<AuthResult> {
    const {email, password} = APP_CONFIG.demoAccount;
    return this.login(email, password);
  },
};

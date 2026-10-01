import {APP_CONFIG} from '../config';
import {PublicUser, sessionStore} from '../api/sessionStore';
import {NATIVE_BRIDGE_INJECT} from './injectNativeBridge';

/** Keys must match the hosted auth store. */
export const WEB_STORAGE_USER_KEY = 'xecute_current_user_v1';
export const WEB_STORAGE_TOKEN_KEY = 'xecute_access_token_v1';

function toBase64Utf8(value: string): string {
  const binary = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16)),
  );
  const btoaFn = (globalThis as {btoa?: (s: string) => string}).btoa;
  if (typeof btoaFn === 'function') {
    return btoaFn(binary);
  }
  throw new Error('Base64 encoding is unavailable in this runtime.');
}

export function encodeUserHandoff(
  user: PublicUser,
  token: string | null,
): string {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    tier: user.tier || 'free',
    token,
  };
  return encodeURIComponent(
    toBase64Utf8(JSON.stringify(payload)),
  );
}

export function buildWebSessionPreloadScript(
  user: PublicUser | null,
  token: string | null,
): string {
  if (!user && !token) {
    return '';
  }

  const storedUser = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        tier: user.tier || 'free',
        createdAt: new Date().toISOString(),
      }
    : null;

  const userLiteral = storedUser
    ? JSON.stringify(JSON.stringify(storedUser))
    : 'null';
  const tokenLiteral = token ? JSON.stringify(token) : 'null';

  return `
(function () {
  try {
    var rawUser = ${userLiteral};
    if (rawUser) {
      localStorage.setItem('${WEB_STORAGE_USER_KEY}', rawUser);
      try {
        var parsed = JSON.parse(rawUser);
        if (parsed && parsed.name) {
          localStorage.setItem('xboss_user_name', parsed.name);
        }
      } catch (e) {}
    }
    var tok = ${tokenLiteral};
    if (tok) {
      localStorage.setItem('${WEB_STORAGE_TOKEN_KEY}', tok);
    }
  } catch (e) {}
})();
`;
}

const NATIVE_TAB_HEIGHT_FIX = `
(function () {
  try {
    document.documentElement.style.setProperty('--xecute-native-tab-height', '52px');
  } catch (e) {}
})();
`;

export function buildCombinedWebInject(
  user: PublicUser | null,
  token: string | null,
): string {
  const session = buildWebSessionPreloadScript(user, token);
  return [session, NATIVE_TAB_HEIGHT_FIX, NATIVE_BRIDGE_INJECT]
    .filter(Boolean)
    .join('\n');
}

export type WebArenaEntry = {
  uri: string;
  inject: string;
};

/** Entry URL for the full arena (dashboard + earn/spend/stats/user surfaces). */
export async function buildWebArenaEntry(): Promise<WebArenaEntry> {
  const [user, token] = await Promise.all([
    sessionStore.getUser(),
    sessionStore.getToken(),
  ]);
  const base = APP_CONFIG.webAppUrl.replace(/\/$/, '');
  const inject = buildCombinedWebInject(user, token);

  if (user) {
    const handoff = encodeUserHandoff(user, token);
    return {
      uri: `${base}/?native=1&handoff=${handoff}`,
      inject,
    };
  }

  if (token) {
    return {
      uri: `${base}/auth?native=1&token=${encodeURIComponent(token)}`,
      inject,
    };
  }

  return {
    uri: `${base}/auth?native=1`,
    inject,
  };
}

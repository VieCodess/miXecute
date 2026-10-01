/**
 * Native app talks to the Xecute API. Users never need a browser.
 * Emulator → host: http://10.0.2.2:3001
 *
 * Open-source / Shipaton defaults are placeholders — set env vars for a real API.
 * Production web + admin backends are NOT in this repository.
 */
export const APP_CONFIG = {
  apiBaseUrl:
    (typeof process !== 'undefined' &&
      process.env &&
      (process.env.XECUTE_API_URL || process.env.REACT_NATIVE_XECUTE_API_URL)) ||
    'http://10.0.2.2:3001',

  /** Base URL for hosted policy and account surfaces. */
  webAppUrl:
    (typeof process !== 'undefined' &&
      process.env &&
      (process.env.XECUTE_WEB_URL || process.env.REACT_NATIVE_XECUTE_WEB_URL)) ||
    'http://10.0.2.2:3000',

  /** Demo account for judges/testers (override via env for forks). */
  demoAccount: {
    email:
      (typeof process !== 'undefined' &&
        process.env &&
        process.env.XECUTE_DEMO_EMAIL) ||
      'demo@getxecute.me',
    password:
      (typeof process !== 'undefined' &&
        process.env &&
        process.env.XECUTE_DEMO_PASSWORD) ||
      'DemoXecute123!',
    name: 'Demo Soldier',
  },

  defaultBlockedDomains: [
    'youtube.com',
    'instagram.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'reddit.com',
    'twitch.tv',
    'netflix.com',
  ] as string[],

  /** Shield overlay: burn this many XCredits for this many minutes */
  breakXCreditsCost: 15,
  breakMinutes: 15,

  /** Starting local XCredits so breaks work offline before first sync */
  defaultXCreditsBalance: 45,

  /**
   * OneSignal App ID (public). Prefer gradle / env override; otherwise
   * fetched from GET /api/config/onesignal-push at runtime.
   */
  oneSignalAppId:
    (typeof process !== 'undefined' &&
      process.env &&
      (process.env.ONESIGNAL_APP_ID || process.env.REACT_NATIVE_ONESIGNAL_APP_ID)) ||
    '',
};

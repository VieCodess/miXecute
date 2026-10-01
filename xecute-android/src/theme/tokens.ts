/** Brand tokens for native Arena surfaces. */

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  mode: ThemeMode;
  bg: string;
  surface: string;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  textSoft: string;
  border: string;
  borderStrong: string;
  heroFrom: string;
  heroVia: string;
  heroTo: string;
  heroGlow: string;
  heroCopy: string;
  success: string;
  successBg: string;
  successBorder: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  credits: string;
  tabBar: string;
  tabInactive: string;
  onPrimary: string;
  statusBar: 'light-content' | 'dark-content';
};

export const lightColors: ThemeColors = {
  mode: 'light',
  bg: '#F9F3FF',
  surface: '#FFFFFF',
  primary: '#9010FF',
  accent: '#9F36FF',
  text: '#430076',
  textMuted: 'rgba(67,0,118,0.6)',
  textSoft: 'rgba(67,0,118,0.7)',
  border: 'rgba(67,0,118,0.08)',
  borderStrong: 'rgba(144,16,255,0.3)',
  heroFrom: '#3b0764',
  heroVia: '#0f172a',
  heroTo: '#1e1b4b',
  heroGlow: 'rgba(168,85,247,0.18)',
  heroCopy: 'rgba(233,213,255,0.9)',
  success: '#10b981',
  successBg: 'rgba(16,185,129,0.12)',
  successBorder: 'rgba(16,185,129,0.35)',
  danger: '#e11d48',
  dangerBg: 'rgba(244,63,94,0.1)',
  dangerBorder: 'rgba(251,113,133,0.45)',
  warning: '#f59e0b',
  warningBg: 'rgba(245,158,11,0.12)',
  warningBorder: 'rgba(245,158,11,0.5)',
  credits: '#d97706',
  tabBar: '#430076',
  tabInactive: '#c4b5fd',
  onPrimary: '#FFFFFF',
  statusBar: 'dark-content',
};

export const darkColors: ThemeColors = {
  mode: 'dark',
  bg: '#0C1324',
  surface: '#151B2D',
  primary: '#770AC9',
  accent: '#B48FFF',
  text: '#F8FAFC',
  textMuted: 'rgba(248,250,252,0.55)',
  textSoft: 'rgba(248,250,252,0.7)',
  border: 'rgba(148,163,184,0.16)',
  borderStrong: 'rgba(119,10,201,0.45)',
  heroFrom: '#3b0764',
  heroVia: '#0f172a',
  heroTo: '#1e1b4b',
  heroGlow: 'rgba(168,85,247,0.14)',
  heroCopy: 'rgba(233,213,255,0.9)',
  success: '#34d399',
  successBg: 'rgba(16,185,129,0.14)',
  successBorder: 'rgba(16,185,129,0.35)',
  danger: '#fb7185',
  dangerBg: 'rgba(244,63,94,0.14)',
  dangerBorder: 'rgba(251,113,133,0.4)',
  warning: '#fbbf24',
  warningBg: 'rgba(245,158,11,0.14)',
  warningBorder: 'rgba(245,158,11,0.45)',
  credits: '#fbbf24',
  tabBar: '#430076',
  tabInactive: '#c4b5fd',
  onPrimary: '#FFFFFF',
  statusBar: 'light-content',
};

export function colorsFor(darkMode: boolean): ThemeColors {
  return darkMode ? darkColors : lightColors;
}

export const NATIVE_TAB_BAR_HEIGHT = 56;

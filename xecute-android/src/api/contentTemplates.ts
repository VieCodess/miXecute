import {APP_CONFIG} from '../config';

export type ContentTemplate = {
  key: string;
  label?: string;
  description?: string;
  variants: string[];
  selectionMode?: 'random' | 'sequential' | 'fixed_first';
  isActive?: boolean;
};

const FALLBACKS: Record<string, string[]> = {
  native_landing_headline: ['Execution over everything.'],
  native_landing_subhead: [
    'Missions, stakes, and your built-in Shield — finish what you start.',
  ],
  native_landing_cta: ['Report for duty'],
  native_onboarding_hook: [
    "I'm the XBoss. I don't manage your time. I manage your results.",
  ],
  native_dashboard_title: ['Xecution Arena'],
  native_dashboard_subhead: [
    'Overview of your active focus missions, XCredits actions, and recent task wins.',
  ],
};

let cache: ContentTemplate[] | null = null;

function pickVariant(template: ContentTemplate | undefined, key: string): string {
  const variants =
    template?.variants?.filter(Boolean) || FALLBACKS[key] || [''];
  if (!variants.length) return FALLBACKS[key]?.[0] || '';
  const mode = template?.selectionMode || 'fixed_first';
  if (mode === 'random') {
    return variants[Math.floor(Math.random() * variants.length)];
  }
  return variants[0];
}

export const contentTemplates = {
  async refresh(): Promise<void> {
    try {
      const res = await fetch(
        `${APP_CONFIG.apiBaseUrl.replace(/\/$/, '')}/api/config/content-templates`,
      );
      const data = await res.json();
      const templates =
        data?.contentTemplates?.templates ||
        data?.templates ||
        data?.contentTemplates ||
        [];
      if (Array.isArray(templates) && templates.length) {
        cache = templates as ContentTemplate[];
      }
    } catch {
      // keep fallbacks
    }
  },

  get(key: string): string {
    const template = cache?.find(t => t.key === key && t.isActive !== false);
    return pickVariant(template, key);
  },
};

/** Legacy type aliases kept for any remaining imports. Prefer AppNav routes. */

export type HomeStackParamList = {
  HomeMain: undefined;
  StartMission: undefined;
  ActiveMission: {missionId: string};
};

export type ShieldStackParamList = {
  ShieldHome: undefined;
  Blocklist: undefined;
  Domains: undefined;
  ShieldStats: undefined;
};

export type YouStackParamList = {
  ProfileHome: undefined;
  Paywall: undefined;
  Trends: undefined;
  Settings: undefined;
  AccountabilityPartners: undefined;
};

export type RootTabParamList = {
  Home: undefined;
  Shield: undefined;
  You: undefined;
};

/** @deprecated */
export type RootStackParamList = ShieldStackParamList & {
  Dashboard: undefined;
};

import {getAppNavBridge, type AppRouteName} from './AppNav';

export type DeepLinkTarget =
  | {tab: 'User'; screen: 'AccountabilityPartners'}
  | {tab: 'User'; screen: 'Settings'}
  | {tab: 'User'; screen: 'Paywall'}
  | {tab: 'Stats'}
  | {tab: 'Spend'; screen?: 'ShieldStats'}
  | {tab: 'Home'};

export function navigateToDeepLink(target: DeepLinkTarget) {
  const nav = getAppNavBridge();
  if (!nav) return false;
  if (target.tab === 'User' && 'screen' in target && target.screen) {
    nav.navigate(target.screen as AppRouteName);
    return true;
  }
  if (target.tab === 'Spend') {
    nav.navigate(target.screen === 'ShieldStats' ? 'ShieldStats' : 'ShieldHome');
    return true;
  }
  if (target.tab === 'Stats') {
    nav.setTab('Stats');
    return true;
  }
  nav.setTab('Home');
  nav.navigate('HomeMain');
  return true;
}

export function resolvePushOrUrlTarget(input: {
  screen?: string | null;
  type?: string | null;
  url?: string | null;
}): DeepLinkTarget | null {
  const screen = String(input.screen || '').trim();
  const type = String(input.type || '').trim().toLowerCase();
  const url = String(input.url || '').trim().toLowerCase();

  if (
    screen === 'AccountabilityPartners' ||
    type === 'partner_joined' ||
    type === 'partner_request' ||
    url.includes('partners')
  ) {
    return {tab: 'User', screen: 'AccountabilityPartners'};
  }
  if (screen === 'Settings' || url.includes('settings')) {
    return {tab: 'User', screen: 'Settings'};
  }
  if (screen === 'Trends' || url.includes('trends') || url.includes('stats')) {
    return {tab: 'Stats'};
  }
  if (screen === 'Paywall' || url.includes('paywall') || url.includes('pro')) {
    return {tab: 'User', screen: 'Paywall'};
  }
  if (screen === 'ShieldStats' || url.includes('shield') || url.includes('spend')) {
    return {tab: 'Spend', screen: 'ShieldStats'};
  }
  return {tab: 'Home'};
}

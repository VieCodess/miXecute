import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Tiny in-app router — no react-navigation / native-stack.
 * Tabs match web arena: Home / Missions / Spend / Stats / User.
 * Spend is native Shield (XPause / Unlock Apps).
 */

export type AppRoute =
  | {name: 'HomeMain'}
  | {name: 'GoalTanks'}
  | {name: 'MissionsMain'}
  | {name: 'StartMission'; params?: {title?: string; arenaMissionId?: string}}
  | {name: 'BrainDump'}
  | {name: 'ActiveMission'; params: {missionId: string}}
  | {name: 'ShieldHome'}
  | {name: 'Blocklist'}
  | {name: 'Domains'}
  | {name: 'ShieldStats'}
  | {name: 'ProfileHome'}
  | {name: 'Paywall'}
  | {name: 'Trends'}
  | {name: 'Settings'}
  | {name: 'AccountabilityPartners'};

export type AppTab = 'Home' | 'Missions' | 'Spend' | 'Stats' | 'User';

export type AppRouteName = AppRoute['name'];

type NavApi = {
  tab: AppTab;
  route: AppRoute;
  setTab: (tab: AppTab) => void;
  navigate: (name: AppRouteName, params?: Record<string, string>) => void;
  replace: (name: AppRouteName, params?: Record<string, string>) => void;
  goBack: () => void;
  popToTop: () => void;
  canGoBack: boolean;
};

const NavContext = createContext<NavApi | null>(null);

let navBridge: NavApi | null = null;

export function getAppNavBridge(): NavApi | null {
  return navBridge;
}

export function useAppNav(): NavApi {
  const ctx = useContext(NavContext);
  if (!ctx) {
    throw new Error('useAppNav requires AppNavProvider');
  }
  return ctx;
}

export function useAppNavOptional(): NavApi | null {
  return useContext(NavContext);
}

const TAB_ROOT: Record<AppTab, AppRoute> = {
  Home: {name: 'HomeMain'},
  Missions: {name: 'MissionsMain'},
  Spend: {name: 'ShieldHome'},
  Stats: {name: 'Trends'},
  User: {name: 'ProfileHome'},
};

function tabForRoute(name: AppRouteName): AppTab {
  if (
    name === 'MissionsMain' ||
    name === 'StartMission' ||
    name === 'ActiveMission' ||
    name === 'BrainDump'
  ) {
    return 'Missions';
  }
  if (
    name === 'Blocklist' ||
    name === 'Domains' ||
    name === 'ShieldStats' ||
    name === 'ShieldHome'
  ) {
    return 'Spend';
  }
  if (name === 'Trends') {
    return 'Stats';
  }
  if (
    name === 'AccountabilityPartners' ||
    name === 'Paywall' ||
    name === 'Settings' ||
    name === 'ProfileHome'
  ) {
    return 'User';
  }
  return 'Home';
}

function routeFor(
  name: AppRouteName,
  params?: Record<string, string>,
): AppRoute {
  if (name === 'ActiveMission') {
    return {name: 'ActiveMission', params: {missionId: params?.missionId || ''}};
  }
  if (name === 'StartMission') {
    return {
      name: 'StartMission',
      params: {
        title: params?.title,
        arenaMissionId: params?.arenaMissionId,
      },
    };
  }
  return {name} as AppRoute;
}

function stackForNavigate(
  name: AppRouteName,
  params: Record<string, string> | undefined,
  prevStack: AppRoute[],
): AppRoute[] {
  const root = TAB_ROOT[tabForRoute(name)];
  if (name === root.name) {
    return [root];
  }
  const next = routeFor(name, params);
  const top = prevStack[prevStack.length - 1];
  if (top?.name === next.name && name !== 'ActiveMission') {
    return [...prevStack.slice(0, -1), next];
  }
  return [root, next];
}

type ProviderProps = {
  children: React.ReactNode;
  initialTab?: AppTab;
};

export const AppNavProvider: React.FC<ProviderProps> = ({
  children,
  initialTab = 'Home',
}) => {
  const [tab, setTabState] = useState<AppTab>(initialTab);
  const [stacks, setStacks] = useState<Record<AppTab, AppRoute[]>>({
    Home: [{name: 'HomeMain'}],
    Missions: [{name: 'MissionsMain'}],
    Spend: [{name: 'ShieldHome'}],
    Stats: [{name: 'Trends'}],
    User: [{name: 'ProfileHome'}],
  });

  const route = stacks[tab][stacks[tab].length - 1] || TAB_ROOT[tab];

  const setTab = useCallback((next: AppTab) => {
    setTabState(next);
  }, []);

  const navigate = useCallback(
    (name: AppRouteName, params?: Record<string, string>) => {
      const nextTab = tabForRoute(name);
      setTabState(nextTab);
      setStacks(prev => ({
        ...prev,
        [nextTab]: stackForNavigate(name, params, prev[nextTab]),
      }));
    },
    [],
  );

  const replace = useCallback(
    (name: AppRouteName, params?: Record<string, string>) => {
      const nextTab = tabForRoute(name);
      setTabState(nextTab);
      setStacks(prev => {
        const stack = prev[nextTab];
        const nextRoute = routeFor(name, params);
        if (name === TAB_ROOT[nextTab].name) {
          return {...prev, [nextTab]: [TAB_ROOT[nextTab]]};
        }
        if (stack.length <= 1) {
          return {...prev, [nextTab]: [TAB_ROOT[nextTab], nextRoute]};
        }
        return {...prev, [nextTab]: [...stack.slice(0, -1), nextRoute]};
      });
    },
    [],
  );

  const goBack = useCallback(() => {
    setStacks(prev => {
      const stack = prev[tab];
      if (stack.length <= 1) return prev;
      return {...prev, [tab]: stack.slice(0, -1)};
    });
  }, [tab]);

  const popToTop = useCallback(() => {
    setStacks(prev => ({
      ...prev,
      [tab]: [TAB_ROOT[tab]],
    }));
  }, [tab]);

  const value = useMemo<NavApi>(
    () => ({
      tab,
      route,
      setTab,
      navigate,
      replace,
      goBack,
      popToTop,
      canGoBack: stacks[tab].length > 1,
    }),
    [tab, route, setTab, navigate, replace, goBack, popToTop, stacks],
  );

  useEffect(() => {
    navBridge = value;
    return () => {
      if (navBridge === value) navBridge = null;
    };
  }, [value]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
};

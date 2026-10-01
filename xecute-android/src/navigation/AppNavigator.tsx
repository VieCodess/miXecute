import React, {createContext, useContext} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {HomeScreen} from '../screens/HomeScreen';
import {GoalTanksScreen} from '../screens/GoalTanksScreen';
import {MissionsScreen} from '../screens/MissionsScreen';
import {StartMissionScreen} from '../screens/StartMissionScreen';
import {BrainDumpScreen} from '../screens/BrainDumpScreen';
import {ActiveMissionScreen} from '../screens/ActiveMissionScreen';
import {ShieldScreen} from '../screens/ShieldScreen';
import {BlocklistScreen} from '../screens/BlocklistScreen';
import {DomainBlocklistScreen} from '../screens/DomainBlocklistScreen';
import {ProfileScreen} from '../screens/ProfileScreen';
import {PaywallScreen} from '../screens/PaywallScreen';
import {TrendsScreen} from '../screens/TrendsScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {AccountabilityPartnersScreen} from '../screens/AccountabilityPartnersScreen';
import {ShieldStatsScreen} from '../screens/ShieldStatsScreen';
import {ArenaErrorBoundary} from '../components/ArenaErrorBoundary';
import {NATIVE_TAB_BAR_HEIGHT, useTheme, type ThemeColors} from '../theme';
import {
  AppNavProvider,
  useAppNav,
  type AppRoute,
  type AppTab,
} from './AppNav';

const SignOutContext = createContext<() => void>(() => undefined);

const HEADER_TITLES: Partial<Record<AppRoute['name'], string>> = {
  StartMission: 'New mission',
  BrainDump: 'Brain dump',
  Blocklist: 'Apps',
  Domains: 'Sites',
  Paywall: 'Xecute Pro',
  Settings: 'App settings',
};

function TabIcon({
  label,
  focused,
  colors,
}: {
  label: AppTab;
  focused: boolean;
  colors: ThemeColors;
}) {
  const glyph =
    label === 'Home'
      ? '◆'
      : label === 'Missions'
        ? '◎'
        : label === 'Spend'
          ? '▣'
          : label === 'Stats'
            ? '▴'
            : '●';
  return (
    <View style={tabStyles.tabIconWrap}>
      <View
        style={[
          tabStyles.tabGlyph,
          focused && {
            backgroundColor:
              colors.mode === 'dark'
                ? 'rgba(180,143,255,0.22)'
                : 'rgba(144,16,255,0.18)',
          },
        ]}>
        <Text
          style={[
            tabStyles.tabGlyphText,
            {color: colors.tabInactive},
            focused && {color: colors.onPrimary},
          ]}>
          {glyph}
        </Text>
      </View>
      <Text
        style={[
          tabStyles.tabLabel,
          {color: colors.tabInactive},
          focused && {color: colors.onPrimary, fontWeight: '900'},
        ]}>
        {label}
      </Text>
    </View>
  );
}

function StackHeader({title}: {title: string}) {
  const {goBack, canGoBack} = useAppNav();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  if (!canGoBack) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        paddingHorizontal: 8,
        paddingBottom: 10,
        paddingTop: Math.max(insets.top, 8),
      }}>
      <TouchableOpacity onPress={goBack} hitSlop={12} style={{width: 40, alignItems: 'center'}}>
        <Text style={{color: colors.primary, fontSize: 22, fontWeight: '700'}}>←</Text>
      </TouchableOpacity>
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontWeight: '800',
          fontSize: 17,
          textAlign: 'center',
        }}
        numberOfLines={1}>
        {title}
      </Text>
      <View style={{width: 40}} />
    </View>
  );
}

function renderRoute(route: AppRoute, onSignedOut: () => void) {
  switch (route.name) {
    case 'HomeMain':
      return <HomeScreen />;
    case 'GoalTanks':
      return <GoalTanksScreen />;
    case 'MissionsMain':
      return <MissionsScreen />;
    case 'StartMission':
      return (
        <StartMissionScreen
          prefillTitle={
            route.name === 'StartMission' ? route.params?.title : undefined
          }
          arenaMissionId={
            route.name === 'StartMission'
              ? route.params?.arenaMissionId
              : undefined
          }
        />
      );
    case 'BrainDump':
      return <BrainDumpScreen />;
    case 'ActiveMission':
      return <ActiveMissionScreen missionId={route.params.missionId} />;
    case 'ShieldHome':
      return <ShieldScreen onSignedOut={onSignedOut} />;
    case 'Blocklist':
      return <BlocklistScreen />;
    case 'Domains':
      return <DomainBlocklistScreen />;
    case 'ShieldStats':
      return <ShieldStatsScreen />;
    case 'ProfileHome':
      return <ProfileScreen onSignedOut={onSignedOut} />;
    case 'Paywall':
      return <PaywallScreen />;
    case 'Trends':
      return <TrendsScreen />;
    case 'Settings':
      return <SettingsScreen onSignedOut={onSignedOut} />;
    case 'AccountabilityPartners':
      return <AccountabilityPartnersScreen />;
    default:
      return <HomeScreen />;
  }
}

const ArenaShell: React.FC<{onSignedOut: () => void}> = ({onSignedOut}) => {
  const insets = useSafeAreaInsets();
  const {tab, route, setTab, canGoBack} = useAppNav();
  const {colors} = useTheme();
  const headerTitle = HEADER_TITLES[route.name];
  const showHeader = Boolean(headerTitle && canGoBack);
  const tabs: AppTab[] = ['Home', 'Missions', 'Spend', 'Stats', 'User'];

  return (
    <SignOutContext.Provider value={onSignedOut}>
      <View style={{flex: 1, backgroundColor: colors.bg}}>
        {showHeader && headerTitle ? <StackHeader title={headerTitle} /> : null}
        <View style={{flex: 1, backgroundColor: colors.bg}}>
          {renderRoute(route, onSignedOut)}
        </View>
        <View
          style={{
            marginHorizontal: 14,
            marginBottom: Math.max(insets.bottom, 8),
            height: NATIVE_TAB_BAR_HEIGHT + 8,
            paddingBottom: 6,
            paddingTop: 6,
            paddingHorizontal: 4,
            flexDirection: 'row',
            backgroundColor: colors.tabBar,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: colors.borderStrong,
            elevation: 8,
            shadowColor: '#430076',
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: {width: 0, height: 4},
          }}>
          {tabs.map(name => {
            const focused = tab === name;
            return (
              <TouchableOpacity
                key={name}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  backgroundColor: focused ? colors.primary : 'transparent',
                }}
                onPress={() => setTab(name)}
                accessibilityRole="button"
                accessibilityState={{selected: focused}}>
                <TabIcon label={name} focused={focused} colors={colors} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SignOutContext.Provider>
  );
};

type RootProps = {
  ready: boolean;
  onSignedOut: () => void;
};

export const AppNavigator: React.FC<RootProps> = ({ready, onSignedOut}) => {
  const {colors} = useTheme();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}>
        <Text
          style={{
            color: colors.primary,
            fontWeight: '800',
            fontSize: 12,
            letterSpacing: 2.4,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
          Xecute
        </Text>
        <Text style={{color: colors.text, fontWeight: '800', fontSize: 20}}>
          Opening the Arena…
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontWeight: '600',
            fontSize: 13,
            marginTop: 8,
          }}>
          Loading your missions
        </Text>
      </View>
    );
  }

  return (
    <ArenaErrorBoundary>
      <AppNavProvider initialTab="Home">
        <ArenaShell onSignedOut={onSignedOut} />
      </AppNavProvider>
    </ArenaErrorBoundary>
  );
};

export const MainTabs: React.FC<{onSignedOut: () => void}> = ({onSignedOut}) => (
  <AppNavProvider>
    <ArenaShell onSignedOut={onSignedOut} />
  </AppNavProvider>
);

export function useSignOut(): () => void {
  return useContext(SignOutContext);
}

const tabStyles = StyleSheet.create({
  tabIconWrap: {alignItems: 'center', justifyContent: 'center', minWidth: 48},
  tabGlyph: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabGlyphText: {fontSize: 12, fontWeight: '700'},
  tabLabel: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});

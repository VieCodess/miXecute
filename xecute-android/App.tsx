import React, {useCallback, useEffect, useState} from 'react';
import {Linking, Platform, StatusBar} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppNavigator} from './src/navigation/AppNavigator';
import {sessionStore} from './src/api/sessionStore';
import {creditsStore} from './src/api/creditsStore';
import {offlineSync} from './src/api/offlineSync';
import {contentTemplates} from './src/api/contentTemplates';
import {stakeConfigStore} from './src/api/stakeConfigStore';
import {preferencesStore} from './src/api/preferencesStore';
import {PushNotifications} from './src/notifications/PushNotifications';
import {RevenueCat} from './src/billing/RevenueCat';
import {SplashScreen} from './src/screens/SplashScreen';
import {OnboardingScreen} from './src/screens/OnboardingScreen';
import {AuthScreen} from './src/screens/AuthScreen';
import {ThemeProvider, useTheme} from './src/theme';

const ONBOARDING_KEY = 'xecute_onboarding_done_v1';

/**
 * Native onboarding flow:
 *  splash → saved session → Arena
 *        → no session → Auth
 *             → signed in + onboarded → Arena
 *             → signed in + new → Onboarding (Shield setup) → Arena
 * No marketing landing. Extension install skipped; Shield arms natively.
 */
type Gate = 'splash' | 'auth' | 'onboarding' | 'app';

async function syncRevenueCatIdentity(signedIn: boolean) {
  if (Platform.OS !== 'android') return;
  try {
    if (!signedIn) {
      await RevenueCat.logOut();
      return;
    }
    const user = await sessionStore.getUser();
    if (user?.id) {
      await RevenueCat.logIn(user.id);
    }
  } catch {
    // Billing must never block the product
  }
}

async function syncCredits(signedIn: boolean) {
  if (!signedIn || Platform.OS !== 'android') return;
  try {
    await creditsStore.sync();
  } catch {
    // Offline OK
  }
}

async function syncOfflineQueue(signedIn: boolean) {
  if (Platform.OS !== 'android') return;
  try {
    if (!signedIn) {
      await offlineSync.clear();
      return;
    }
    await offlineSync.flush();
  } catch {
    // Offline OK
  }
}

async function syncPushAndPrefs(signedIn: boolean) {
  if (Platform.OS !== 'android') return;
  try {
    if (signedIn) {
      await preferencesStore.syncFromServer();
    }
    await PushNotifications.syncIdentity(signedIn);
  } catch {
    // Push/prefs must never block boot
  }
}

function App(): React.JSX.Element {
  const [gate, setGate] = useState<Gate>('splash');
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    void (async () => {
      const [token, user] = await Promise.all([
        sessionStore.getToken(),
        sessionStore.getUser(),
        contentTemplates.refresh(),
        stakeConfigStore.refresh(),
      ]);
      const nextSignedIn = Boolean(token || user);
      setSignedIn(nextSignedIn);
      setReady(true);
      if (token) void sessionStore.refreshMe();
      void syncRevenueCatIdentity(nextSignedIn);
      void syncCredits(nextSignedIn);
      void syncOfflineQueue(nextSignedIn);
      void syncPushAndPrefs(nextSignedIn);
    })();
  }, []);

  const enterArena = useCallback(() => {
    setSignedIn(true);
    setReady(true);
    setGate('app');
  }, []);

  const routeAfterAuth = useCallback(async () => {
    setSignedIn(true);
    setReady(true);
    void syncRevenueCatIdentity(true);
    void syncCredits(true);
    void syncOfflineQueue(true);
    void syncPushAndPrefs(true);
    const [token, user, onboardingDone] = await Promise.all([
      sessionStore.getToken(),
      sessionStore.getUser(),
      AsyncStorage.getItem(ONBOARDING_KEY),
    ]);
    const hasSession = Boolean(token || user);
    if (hasSession || onboardingDone === '1') {
      if (hasSession) {
        await AsyncStorage.setItem(ONBOARDING_KEY, '1');
      }
      setGate('app');
      return;
    }
    setGate('onboarding');
  }, []);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      if (/xecute:\/\/auth\/callback/i.test(url)) {
        const match = url.match(/[?&#](?:token|access_token)=([^&#]+)/i);
        if (match?.[1]) {
          const res = await sessionStore.acceptToken(
            decodeURIComponent(match[1]),
          );
          if (res.success) {
            await routeAfterAuth();
          }
        }
        return;
      }
      PushNotifications.handleOpenUrl(url);
    };
    void Linking.getInitialURL().then(u => void handleUrl(u));
    const sub = Linking.addEventListener('url', ({url}) => {
      void handleUrl(url);
    });
    return () => sub.remove();
  }, [routeAfterAuth]);

  /** Loader done → Arena if saved session (returning), else Auth. */
  const finishSplash = useCallback(async () => {
    const [token, user] = await Promise.all([
      sessionStore.getToken(),
      sessionStore.getUser(),
    ]);
    const hasSession = Boolean(token || user);
    if (hasSession) {
      // Returning operators skip onboarding and land in the Arena.
      void AsyncStorage.setItem(ONBOARDING_KEY, '1');
      enterArena();
      void syncRevenueCatIdentity(true);
      void syncCredits(true);
      void syncOfflineQueue(true);
      void syncPushAndPrefs(true);
      return;
    }
    setAuthMode('login');
    setGate('auth');
  }, [enterArena]);

  /** First-run onboarding finishes into Arena (already signed in). */
  const onOnboardingComplete = useCallback((_profile: unknown) => {
    void AsyncStorage.setItem(ONBOARDING_KEY, '1');
    enterArena();
  }, [enterArena]);

  const onAuthenticated = useCallback(() => {
    void routeAfterAuth();
  }, [routeAfterAuth]);

  const onSignedOut = useCallback(() => {
    setSignedIn(false);
    void syncRevenueCatIdentity(false);
    void syncOfflineQueue(false);
    void syncPushAndPrefs(false);
    setAuthMode('login');
    setGate('auth');
  }, []);

  const lightStatus = gate === 'splash' || gate === 'auth' || gate === 'onboarding';

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <ThemeProvider applyArenaTheme={gate === 'app'}>
          <AppStatusBar lightMarketing={lightStatus} />
          {gate === 'splash' ? (
            <SplashScreen onDone={() => void finishSplash()} />
          ) : null}
          {gate === 'auth' ? (
            <AuthScreen
              onAuthenticated={onAuthenticated}
              initialMode={authMode}
              allowModeSwitch
            />
          ) : null}
          {gate === 'onboarding' && signedIn ? (
            <OnboardingScreen onComplete={onOnboardingComplete} />
          ) : null}
          {gate === 'app' && signedIn ? (
            <AppNavigator ready={ready} onSignedOut={onSignedOut} />
          ) : null}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppStatusBar({lightMarketing}: {lightMarketing: boolean}) {
  const {colors} = useTheme();
  if (lightMarketing) {
    return (
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F7F0FF"
        translucent={false}
      />
    );
  }
  return (
    <StatusBar
      barStyle={colors.statusBar}
      backgroundColor={colors.bg}
      translucent={false}
    />
  );
}

export default App;

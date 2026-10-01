import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
  Linking,
  Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {sessionStore} from '../api/sessionStore';
import {APP_CONFIG} from '../config';

type Props = {
  onAuthenticated: () => void;
  /** Embed auth inside onboarding after extract. */
  embedded?: boolean;
  initialMode?: 'login' | 'signup';
  /** Onboarding uses signup-only; standalone login screen allows switch. */
  allowModeSwitch?: boolean;
};

function tokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.replace(/^xecute:/, 'https:'));
    const token =
      parsed.searchParams.get('token') ||
      parsed.searchParams.get('access_token');
    return token ? decodeURIComponent(token) : null;
  } catch {
    const match = url.match(/[?&#](?:token|access_token)=([^&#]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

export const AuthScreen: React.FC<Props> = ({
  onAuthenticated,
  embedded = false,
  initialMode = 'login',
  allowModeSwitch = true,
}) => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(APP_CONFIG.demoAccount.email);
  const [password, setPassword] = useState(APP_CONFIG.demoAccount.password);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [offlineNote, setOfflineNote] = useState(false);

  const completeFromUrl = useCallback(
    async (url: string | null) => {
      const token = tokenFromUrl(url);
      if (!token) return false;
      setBusy(true);
      setError(null);
      try {
        const res = await sessionStore.acceptToken(token);
        if (!res.success) {
          setError(res.error || 'Could not finish sign-in');
          return false;
        }
        onAuthenticated();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [onAuthenticated],
  );

  useEffect(() => {
    void Linking.getInitialURL().then(url => {
      void completeFromUrl(url);
    });
    const sub = Linking.addEventListener('url', ({url}) => {
      void completeFromUrl(url);
    });
    return () => sub.remove();
  }, [completeFromUrl]);

  const finishAuth = (offline?: boolean) => {
    setOfflineNote(Boolean(offline));
    onAuthenticated();
  };

  const submit = async () => {
    setError(null);
    setMagicSent(false);
    if (!email.trim() || !password) {
      setError('Email and password are required');
      return;
    }
    setBusy(true);
    try {
      const res =
        mode === 'login'
          ? await sessionStore.login(email.trim(), password)
          : await sessionStore.register(
              name.trim() || email.split('@')[0],
              email.trim(),
              password,
            );
      if (!res.success) {
        setError(res.error || 'Auth failed');
        return;
      }
      finishAuth(res.offline);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setError(null);
    setMagicSent(false);
    setMode('login');
    setEmail(APP_CONFIG.demoAccount.email);
    setPassword(APP_CONFIG.demoAccount.password);
    setBusy(true);
    try {
      const res = await sessionStore.loginDemo();
      if (!res.success) {
        setError(res.error || 'Demo login failed');
        return;
      }
      finishAuth(res.offline);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setMagicSent(false);
    setBusy(true);
    try {
      const res = await sessionStore.startGoogleOAuth();
      if (!res.success || !res.url) {
        setError(res.error || 'Google sign-in unavailable');
        return;
      }
      await Linking.openURL(res.url);
    } finally {
      setBusy(false);
    }
  };

  const magic = async () => {
    setError(null);
    setMagicSent(false);
    if (!email.trim().includes('@')) {
      setError('Enter your email for a magic link');
      return;
    }
    setBusy(true);
    try {
      const res = await sessionStore.sendMagicLink(email.trim());
      if (!res.success) {
        setError(res.error || 'Could not send magic link');
        return;
      }
      setMagicSent(true);
      Alert.alert(
        'Check your email',
        'Open the magic link on this phone — it returns you to Xecute signed in.',
      );
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <>
      {!embedded ? (
        <>
          <View style={styles.brandBlock}>
            <Image
              source={require('../assets/xecute-mark.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brand}>XECUTE</Text>
          </View>
          <Text style={styles.heading}>
            {mode === 'login' ? 'Welcome back' : 'Join the mission'}
          </Text>
          <Text style={styles.copy}>
            Missions, stakes, and Shield, all built for your phone.
          </Text>
        </>
      ) : null}

      {allowModeSwitch ? (
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabOn]}
            onPress={() => {
              setMode('login');
              setError(null);
              setMagicSent(false);
            }}
            activeOpacity={0.85}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextOn]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'signup' && styles.tabOn]}
            onPress={() => {
              setMode('signup');
              setError(null);
              setMagicSent(false);
            }}
            activeOpacity={0.85}>
            <Text
              style={[styles.tabText, mode === 'signup' && styles.tabTextOn]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {mode === 'signup' ? (
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="rgba(26,11,46,0.35)"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="rgba(26,11,46,0.35)"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="rgba(26,11,46,0.35)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {magicSent ? (
        <Text style={styles.hint}>Magic link sent — open it on this device.</Text>
      ) : null}
      {offlineNote ? (
        <Text style={styles.hint}>
          Signed in on-device (API not deployed yet).
        </Text>
      ) : null}

      <TouchableOpacity
        style={styles.primary}
        onPress={submit}
        disabled={busy}
        activeOpacity={0.85}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>
            {mode === 'login' ? 'Log in' : 'Create account'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.demo}
        onPress={() => void demo()}
        disabled={busy}
        activeOpacity={0.85}>
        <Text style={styles.demoText}>Continue with demo account</Text>
        <Text style={styles.demoHint}>
          {APP_CONFIG.demoAccount.email} · works offline
        </Text>
      </TouchableOpacity>

      {!embedded ? (
        <>
          <TouchableOpacity
            style={styles.google}
            onPress={() => void google()}
            disabled={busy}
            activeOpacity={0.85}>
            <Text style={styles.googleText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => void magic()} disabled={busy}>
            <Text style={styles.magic}>Email me a magic link</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </>
  );

  if (embedded) {
    return <View style={styles.embedded}>{form}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, {paddingTop: insets.top + 20}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {form}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F7F0FF'},
  content: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'stretch',
  },
  embedded: {width: '100%', gap: 0},
  brandBlock: {
    alignItems: 'center',
    marginBottom: 18,
    gap: 8,
  },
  logo: {width: 64, height: 64},
  brand: {
    color: '#9010FF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
  },
  heading: {
    color: '#1A0B2E',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  copy: {
    color: 'rgba(26,11,46,0.65)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(144,16,255,0.08)',
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(26,11,46,0.08)',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: '#fff',
    shadowColor: '#9010FF',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  tabText: {
    color: 'rgba(26,11,46,0.45)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tabTextOn: {color: '#9010FF'},
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(144,16,255,0.18)',
    borderRadius: 14,
    color: '#1A0B2E',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {color: '#dc2626', marginBottom: 12, fontWeight: '600'},
  hint: {color: '#059669', marginBottom: 12, fontWeight: '600'},
  primary: {
    backgroundColor: '#9010FF',
    borderRadius: 40,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: {color: '#fff', fontWeight: '800', fontSize: 15},
  demo: {
    marginTop: 10,
    backgroundColor: '#1A0B2E',
    borderRadius: 40,
    paddingVertical: 14,
    alignItems: 'center',
  },
  demoText: {color: '#fff', fontWeight: '800', fontSize: 15},
  demoHint: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  google: {
    backgroundColor: '#fff',
    borderRadius: 40,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(144,16,255,0.25)',
  },
  googleText: {color: '#1A0B2E', fontWeight: '800', fontSize: 15},
  magic: {
    color: '#9010FF',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '700',
  },
});

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  preferencesStore,
  UserPreferences,
  DEFAULT_PREFERENCES,
} from '../api/preferencesStore';
import {sessionStore, PublicUser} from '../api/sessionStore';
import {PushNotifications} from '../notifications/PushNotifications';
import {APP_CONFIG} from '../config';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';

type Props = {
  onSignedOut?: () => void;
};

export const SettingsScreen: React.FC<Props> = ({onSignedOut}) => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNav();
  const {colors, setDarkMode} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(true);
  const [pushReady, setPushReady] = useState(false);
  const [osPermission, setOsPermission] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [u, p] = await Promise.all([
        sessionStore.getUser(),
        preferencesStore.syncFromServer(),
      ]);
      setUser(u);
      setPrefs(p);
      const ready = await PushNotifications.initialize();
      setPushReady(ready);
      if (ready) {
        setOsPermission(await PushNotifications.getPermission());
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setToggle = async (key: keyof UserPreferences, value: boolean) => {
    setPrefs(prev => ({...prev, [key]: value}));
    const next = await preferencesStore.update({[key]: value});
    setPrefs(next);

    if (key === 'pushEnabled' || key === 'remindersEnabled') {
      if (key === 'pushEnabled') {
        await PushNotifications.applyPushPreference(value);
        if (value) {
          const granted = await PushNotifications.requestPermission();
          setOsPermission(granted);
          if (!granted) {
            Alert.alert(
              'Notifications blocked',
              'Enable notifications in system settings to receive mission reminders.',
            );
          }
        }
      }
      void PushNotifications.syncIdentity(true);
    }

    if (
      key === 'shieldAlertsEnabled' ||
      key === 'marketingPushEnabled' ||
      key === 'remindersEnabled'
    ) {
      void PushNotifications.syncIdentity(true);
    }
  };

  const Row = ({
    label,
    hint,
    value,
    onChange,
  }: {
    label: string;
    hint: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{false: '#333344', true: 'rgba(168,85,247,0.55)'}}
        thumbColor={value ? '#a855f7' : '#9ca3af'}
      />
    </View>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {paddingTop: insets.top + 12}]}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.brand}>Xecute</Text>
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.copy}>
        Account preferences, notifications, and app controls — synced to your
        profile.
      </Text>

      {busy ? (
        <ActivityIndicator color="#a855f7" style={{marginTop: 20}} />
      ) : null}

      <Text style={styles.section}>Accountability</Text>
      <TouchableOpacity
        style={styles.secondary}
        onPress={() => navigation.navigate('AccountabilityPartners')}>
        <Text style={styles.secondaryText}>Manage accountability partners</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.metaLabel}>Name</Text>
        <Text style={styles.metaValue}>{user?.name || 'Operator'}</Text>
        <Text style={[styles.metaLabel, {marginTop: 12}]}>Email</Text>
        <Text style={styles.metaValue}>{user?.email || '—'}</Text>
      </View>

      <Text style={styles.section}>Push notifications</Text>
      <View style={styles.card}>
        <Text style={styles.statusLine}>
          OneSignal:{' '}
          {pushReady
            ? `ready${osPermission ? ' · permission granted' : ' · permission off'}`
            : 'not configured (set App ID in admin / env)'}
        </Text>
        <Row
          label="Push notifications"
          hint="Master switch for device push via OneSignal"
          value={prefs.pushEnabled}
          onChange={v => void setToggle('pushEnabled', v)}
        />
        <Row
          label="Mission reminders"
          hint="Deadlines and commitment nudges"
          value={prefs.remindersEnabled}
          onChange={v => void setToggle('remindersEnabled', v)}
        />
        <Row
          label="Shield alerts"
          hint="Permission drops, interrupts, and re-arm prompts"
          value={prefs.shieldAlertsEnabled}
          onChange={v => void setToggle('shieldAlertsEnabled', v)}
        />
        <Row
          label="Product updates"
          hint="Optional broadcasts and Founder / Pro news"
          value={prefs.marketingPushEnabled}
          onChange={v => void setToggle('marketingPushEnabled', v)}
        />
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={async () => {
            const granted = await PushNotifications.requestPermission();
            setOsPermission(granted);
            Alert.alert(
              granted ? 'Permission granted' : 'Permission denied',
              granted
                ? 'You will receive push when toggles are on.'
                : 'Open system settings if you previously denied notifications.',
            );
          }}>
          <Text style={styles.linkBtnText}>Request system permission</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>App controls</Text>
      <View style={styles.card}>
        <Row
          label="Sound FX"
          hint="Celebration sounds on mission complete"
          value={prefs.soundFxEnabled}
          onChange={v => void setToggle('soundFxEnabled', v)}
        />
        <Row
          label="Haptics"
          hint="Vibration feedback on key actions"
          value={prefs.hapticsEnabled}
          onChange={v => void setToggle('hapticsEnabled', v)}
        />
        <Row
          label="Keep awake on mission"
          hint="Prevent sleep during an active focus session"
          value={prefs.keepAwakeDuringMission}
          onChange={v => void setToggle('keepAwakeDuringMission', v)}
        />
        <Row
          label="Dark mode"
          hint="Choose purple light or midnight dark"
          value={prefs.darkMode}
          onChange={v => {
            void setToggle('darkMode', v);
            void setDarkMode(v);
          }}
        />
      </View>

      <Text style={styles.section}>Privacy</Text>
      <View style={styles.card}>
        <Row
          label="Share stats with partner"
          hint="Allow weekly summary in accountability emails"
          value={prefs.shareStatsWithPartner}
          onChange={v => void setToggle('shareStatsWithPartner', v)}
        />
      </View>

      <Text style={styles.section}>Links</Text>
      <TouchableOpacity
        style={styles.secondary}
        onPress={() =>
          Linking.openURL(`${APP_CONFIG.webAppUrl.replace(/\/$/, '')}/privacy`)
        }>
        <Text style={styles.secondaryText}>Privacy</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondary}
        onPress={() =>
          Linking.openURL(`${APP_CONFIG.webAppUrl.replace(/\/$/, '')}/terms`)
        }>
        <Text style={styles.secondaryText}>Terms</Text>
      </TouchableOpacity>

      {onSignedOut ? (
        <TouchableOpacity
          style={styles.danger}
          onPress={() => {
            Alert.alert('Sign out?', undefined, [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: async () => {
                  await sessionStore.clear();
                  await PushNotifications.syncIdentity(false);
                  onSignedOut();
                },
              },
            ]);
          }}>
          <Text style={styles.dangerText}>Sign out</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
  root: {flex: 1, backgroundColor: c.bg},
  content: {paddingHorizontal: 16, paddingBottom: 48},
  brand: {
    color: c.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  heading: {
    color: c.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: -0.4,
  },
  copy: {color: c.textSoft, marginTop: 8, marginBottom: 16, lineHeight: 20},
  section: {
    color: c.text,
    fontWeight: '800',
    fontSize: 14,
    marginTop: 18,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  metaLabel: {color: c.textMuted, fontSize: 11, fontWeight: '700'},
  metaValue: {color: c.text, fontWeight: '700', marginTop: 2},
  statusLine: {color: c.textMuted, fontSize: 11, marginBottom: 10},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  rowText: {flex: 1, paddingRight: 12},
  rowLabel: {color: c.text, fontWeight: '700', fontSize: 14},
  rowHint: {color: c.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15},
  linkBtn: {marginTop: 8, paddingVertical: 10},
  linkBtnText: {color: c.primary, fontWeight: '800', fontSize: 13},
  secondary: {
    marginTop: 8,
    backgroundColor: c.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {color: c.text, fontWeight: '700'},
  danger: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  dangerText: {color: c.danger, fontWeight: '800'},
  });
}

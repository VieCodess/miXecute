import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {missionStore, Mission} from '../api/missionStore';
import {sessionStore} from '../api/sessionStore';
import {creditsStore} from '../api/creditsStore';
import {BlockerBridge} from '../native/BlockerBridge';
import {useAppNav} from '../navigation/AppNav';

type Props = {
  missionId: string;
};

export const ActiveMissionScreen: React.FC<Props> = ({missionId}) => {
  const navigation = useAppNav();
  const insets = useSafeAreaInsets();
  const [mission, setMission] = useState<Mission | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const all = await missionStore.list();
    setMission(all.find(m => m.id === missionId) || null);
  }, [missionId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [load]);

  if (!mission) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#a855f7" />
      </View>
    );
  }

  const ends = mission.endsAt ? new Date(mission.endsAt).getTime() : now;
  const remaining = Math.max(0, ends - now);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const clock = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const finish = async (ok: boolean) => {
    setBusy(true);
    try {
      const user = await sessionStore.getUser();
      if (ok) {
        await missionStore.complete(mission.id, user?.id);
        await creditsStore
          .earn(mission.durationMinutes, 'Mission complete', mission.id)
          .catch(() => undefined);
      } else {
        await missionStore.miss(mission.id, {
          userId: user?.id,
          userName: user?.name,
          friendEmail: mission.friendEmail,
          friendName: mission.friendName,
        });
      }
      await BlockerBridge.endFocusSession(mission.id, ok).catch(() => undefined);
      navigation.popToTop();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, {paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16}]}>
      <Text style={styles.eyebrow}>ACTIVE</Text>
      <Text style={styles.title}>{mission.title}</Text>
      <Text style={styles.clock}>{clock}</Text>
      <Text style={styles.meta}>
        {mission.durationMinutes}m commitment ·{' '}
        {mission.stakeLabel ||
          (mission.stakeType === 'money' && mission.stakeAmount
            ? `$${mission.stakeAmount} money stake`
            : mission.stakeType.replace(/_/g, ' '))}
      </Text>
      {mission.friendEmail ? (
        <Text style={styles.meta}>Partner: {mission.friendEmail}</Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primary}
          disabled={busy}
          onPress={() => finish(true)}
          activeOpacity={0.85}>
          <Text style={styles.primaryText}>Mark complete</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          disabled={busy}
          onPress={() =>
            Alert.alert('Miss this mission?', 'Partner alerts may fire.', [
              {text: 'Cancel', style: 'cancel'},
              {text: 'I missed', style: 'destructive', onPress: () => finish(false)},
            ])
          }
          activeOpacity={0.85}>
          <Text style={styles.secondaryText}>I missed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghost}
          onPress={async () => {
            await BlockerBridge.requestBreak(5);
            Alert.alert('Break', '5-minute break unlocked.');
          }}>
          <Text style={styles.ghostText}>Take 5m break</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0d0b14', paddingHorizontal: 16},
  center: {alignItems: 'center', justifyContent: 'center'},
  eyebrow: {
    color: '#a855f7',
    fontWeight: '800',
    letterSpacing: 1.5,
    fontSize: 12,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
    letterSpacing: -0.4,
  },
  clock: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '800',
    marginTop: 28,
    fontVariant: ['tabular-nums'],
  },
  meta: {color: '#9ca3af', marginTop: 8},
  actions: {marginTop: 'auto', gap: 10},
  primary: {
    backgroundColor: '#a855f7',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: {color: '#fff', fontWeight: '800'},
  secondary: {
    backgroundColor: '#1f1830',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: {color: '#fff', fontWeight: '700'},
  ghost: {paddingVertical: 12, alignItems: 'center'},
  ghostText: {color: '#c4b5fd', fontWeight: '700'},
});

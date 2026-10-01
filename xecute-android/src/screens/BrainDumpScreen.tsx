import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {runBrainDumpExtract} from '../api/brainDumpExtract';
import {goalTankService, type GoalMode} from '../api/goalTankService';
import {arenaMissionsStore} from '../api/arenaMissionsStore';
import {sessionStore} from '../api/sessionStore';
import {SpeechBridge} from '../native/SpeechBridge';
import {XBossLoader} from '../components/XBossLoader';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';

const PROFILE_KEY = 'xecute_onboarding_profile_v1';

const EXTRACTION_MESSAGES = [
  'Sitting with what you just said...',
  'Finding the one thing that matters...',
  'Defining your primary mission...',
];

export const BrainDumpScreen: React.FC = () => {
  const navigation = useAppNav();
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [goalMode, setGoalMode] = useState<GoalMode>('quick_sprint');
  const [dump, setDump] = useState('');
  const [busy, setBusy] = useState(false);
  const [extractPhase, setExtractPhase] = useState(0);
  const [listening, setListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [struggle, setStruggle] = useState('');
  const [desire, setDesire] = useState('');

  useEffect(() => {
    void (async () => {
      const mode = await goalTankService.getGoalMode();
      setGoalMode(mode);
      try {
        const raw = await AsyncStorage.getItem(PROFILE_KEY);
        if (raw) {
          const p = JSON.parse(raw) as {struggle?: string; desire?: string};
          setStruggle(p.struggle || '');
          setDesire(p.desire || '');
        }
      } catch {
        // optional profile
      }
    })();
  }, []);

  useEffect(() => {
    if (!busy) return;
    const tick = setInterval(() => {
      setExtractPhase(p => (p + 1) % EXTRACTION_MESSAGES.length);
    }, 900);
    return () => clearInterval(tick);
  }, [busy]);

  const startVoice = async () => {
    if (!SpeechBridge.available()) {
      setMicNotice('Voice dump needs the Android speech recognizer.');
      return;
    }
    setMicNotice(null);
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone',
          message: 'XBoss listens so you can dump tasks by voice.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setMicNotice('Mic permission denied — type it out instead.');
        return;
      }
    }
    setListening(true);
    try {
      const text = await SpeechBridge.listen(
        'Tell XBoss everything you need to do',
      );
      setDump(prev => {
        const next = prev.trim() ? `${prev.trim()} ${text}` : text;
        return next;
      });
    } catch (e: unknown) {
      const msg = String((e as Error)?.message || e || '');
      if (!/cancel/i.test(msg)) {
        setMicNotice(msg || 'Could not capture speech — type it out.');
      }
    } finally {
      setListening(false);
    }
  };

  const submit = useCallback(async () => {
    if (!dump.trim() || busy) return;
    setBusy(true);
    try {
      const user = await sessionStore.getUser();
      const result = await runBrainDumpExtract({
        transcript: dump,
        struggle,
        desire,
        goalMode,
        userName: user?.name,
      });
      await goalTankService.setGoalMode(goalMode);
      await goalTankService.syncTanksFromXboss(
        result.topTasks.map(t => ({
          rank: t.rank,
          title: t.title,
          why: t.why,
          goalName: t.goalName,
        })),
        result.extractedGoal || result.missionTitle,
        result.hasMultipleGoals,
        goalMode,
      );
      const primaryGoal =
        result.extractedGoal || result.topTasks[0]?.goalName || result.missionTitle;
      await arenaMissionsStore.importFromBrainDump(result.topTasks, primaryGoal);
      navigation.replace('MissionsMain');
    } finally {
      setBusy(false);
    }
  }, [dump, busy, struggle, desire, goalMode, navigation]);

  if (busy) {
    return (
      <View style={[styles.root, styles.center, {paddingTop: insets.top}]}>
        <XBossLoader />
        <Text style={styles.extractMsg}>
          {EXTRACTION_MESSAGES[extractPhase]}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24},
      ]}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>BRAIN DUMP</Text>
      <Text style={styles.title}>Voice or text — XBoss turns it into missions</Text>
      <Text style={styles.copy}>
        One active mission at a time. Sprint dumps re-lock after 4 completed missions;
        campaign dumps re-lock until tanks hit 100%.
      </Text>

      <Text style={styles.label}>Goal mode</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.chip, goalMode === 'quick_sprint' && styles.chipOn]}
          onPress={() => setGoalMode('quick_sprint')}>
          <Text
            style={[
              styles.chipText,
              goalMode === 'quick_sprint' && styles.chipTextOn,
            ]}>
            Quick Sprint
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, goalMode === 'campaign' && styles.chipOn]}
          onPress={() => setGoalMode('campaign')}>
          <Text
            style={[
              styles.chipText,
              goalMode === 'campaign' && styles.chipTextOn,
            ]}>
            Campaign
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        multiline
        placeholder="Dump everything on your mind…"
        placeholderTextColor={colors.textMuted}
        value={dump}
        onChangeText={setDump}
      />

      <TouchableOpacity
        style={[styles.voiceBtn, listening && styles.voiceBtnOn]}
        onPress={() => void startVoice()}
        disabled={listening}>
        <Text style={styles.voiceBtnText}>
          {listening ? 'Listening…' : '🎤 Voice dump'}
        </Text>
      </TouchableOpacity>
      {micNotice ? <Text style={styles.notice}>{micNotice}</Text> : null}

      <TouchableOpacity
        style={[styles.primary, !dump.trim() && styles.primaryDisabled]}
        onPress={() => void submit()}
        disabled={!dump.trim()}>
        <Text style={styles.primaryText}>EXTRACT MISSIONS</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    center: {alignItems: 'center', justifyContent: 'center', padding: 24},
    content: {paddingHorizontal: 16},
    eyebrow: {
      color: c.primary,
      fontWeight: '800',
      fontSize: 10,
      letterSpacing: 1.2,
    },
    title: {color: c.text, fontWeight: '900', fontSize: 22, marginTop: 6},
    copy: {color: c.textSoft, marginTop: 8, lineHeight: 20, fontWeight: '600'},
    label: {
      color: c.textMuted,
      fontWeight: '800',
      fontSize: 11,
      marginTop: 18,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    row: {flexDirection: 'row', gap: 8},
    chip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center',
    },
    chipOn: {borderColor: c.primary, backgroundColor: c.surface},
    chipText: {color: c.textMuted, fontWeight: '800', fontSize: 12},
    chipTextOn: {color: c.primary},
    input: {
      marginTop: 12,
      minHeight: 140,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: c.borderStrong,
      padding: 14,
      color: c.text,
      fontWeight: '600',
      textAlignVertical: 'top',
    },
    voiceBtn: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center',
    },
    voiceBtnOn: {borderColor: c.primary},
    voiceBtnText: {color: c.text, fontWeight: '800'},
    notice: {color: c.danger, marginTop: 8, fontWeight: '600', fontSize: 12},
    primary: {
      marginTop: 20,
      backgroundColor: c.primary,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryDisabled: {opacity: 0.45},
    primaryText: {color: c.onPrimary, fontWeight: '900', letterSpacing: 0.6},
    extractMsg: {
      marginTop: 16,
      color: c.textSoft,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}

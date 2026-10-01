import React, {useCallback, useEffect, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {APP_CONFIG} from '../config';
import {
  stakeConfigStore,
  StakeConfigItem,
  StakeSettings,
  resolveMissionStakeType,
} from '../api/stakeConfigStore';
import {missionStore} from '../api/missionStore';
import {sessionStore} from '../api/sessionStore';
import {runBrainDumpExtract} from '../api/brainDumpExtract';
import {goalTankService} from '../api/goalTankService';
import {arenaMissionsStore} from '../api/arenaMissionsStore';
import {BlockerBridge} from '../native/BlockerBridge';
import {XBossLoader} from '../components/XBossLoader';
import {SpeechBridge} from '../native/SpeechBridge';

type Profile = {
  name: string;
  struggle: string;
  desire: string;
  goalMode?: 'quick_sprint' | 'campaign';
  dump?: string;
  missionTitle?: string;
  stakeId?: string;
  stakeAmount?: number;
  durationMinutes?: number;
  whenDay?: string;
  partnerName?: string;
  partnerEmail?: string;
};

type Props = {
  onComplete: (profile: Profile) => void;
};

type Step =
  | 'hook'
  | 'mediocre_ready'
  | 'mediocre_go'
  | 'name'
  | 'problem'
  | 'noise'
  | 'desire'
  | 'mode'
  | 'dump'
  | 'extracting'
  | 'reveal'
  | 'stakes'
  | 'activated';

const PROBLEM_OPTIONS = [
  'I have too many ideas',
  'I start but never finish',
  "I'm busy but not productive",
  "I'm scared to fail",
];

const NOISE_OPTIONS = ["I can't start", 'I keep quitting', 'I have no plan'];

const DESIRE_OPTIONS = [
  'Make more money',
  'Stop wasting time',
  'Time for family',
  'Get in shape',
  'Feel proud of myself',
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

const EXTRACTION_MESSAGES = [
  'Sitting with what you just said...',
  'Finding the one thing that matters...',
  'Defining your primary mission...',
];

const PROFILE_KEY = 'xecute_onboarding_profile_v1';

function XBossBubble({children}: {children: React.ReactNode}) {
  return (
    <View style={styles.bubbleWrap}>
      <Text style={styles.xbossLabel}>XBOSS</Text>
      <View style={styles.bubble}>
        {typeof children === 'string' ? (
          <Text style={styles.bubbleText}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

function Option({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, active && styles.optionOn]}
      onPress={onPress}
      activeOpacity={0.85}>
      <Text style={[styles.optionText, active && styles.optionTextOn]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export const OnboardingScreen: React.FC<Props> = ({onComplete}) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('hook');
  const [viaMediocre, setViaMediocre] = useState(false);
  const [name, setName] = useState('');
  const [struggle, setStruggle] = useState('');
  const [desire, setDesire] = useState('');
  const [goalMode, setGoalMode] = useState<'quick_sprint' | 'campaign' | null>(
    null,
  );
  const [dump, setDump] = useState('');
  const [extractPhase, setExtractPhase] = useState(0);
  const [missionTitle, setMissionTitle] = useState('');
  const [missionWhy, setMissionWhy] = useState('');
  const [topTasks, setTopTasks] = useState<
    Array<{rank: number; title: string; why: string}>
  >([]);
  const [stakes, setStakes] = useState<StakeConfigItem[]>([]);
  const [settings, setSettings] = useState<StakeSettings>(
    stakeConfigStore.settings(),
  );
  const [selectedStakeId, setSelectedStakeId] = useState<string | null>(null);
  const [cashAmount, setCashAmount] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [whenDay, setWhenDay] = useState<'Today' | 'Tomorrow'>('Today');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);

  const displayName = name.trim() || 'Soldier';

  const startVoiceDump = async () => {
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
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (!/cancel/i.test(msg)) {
        setMicNotice(msg || 'Could not capture speech — type it out.');
      }
    } finally {
      setListening(false);
    }
  };

  useEffect(() => {
    void stakeConfigStore.refresh().then(snap => {
      const enabled = stakeConfigStore.enabled(snap);
      setStakes(enabled);
      setSettings(snap.settings);
      setSelectedStakeId(enabled[0]?.id ?? null);
      setCashAmount(snap.settings.cashTiers[1] || snap.settings.cashTiers[0] || 10);
    });
  }, []);

  useEffect(() => {
    if (step !== 'extracting') return;
    const tick = setInterval(() => {
      setExtractPhase(p => (p + 1) % EXTRACTION_MESSAGES.length);
    }, 900);
    return () => clearInterval(tick);
  }, [step]);

  const finish = useCallback(async () => {
    const profile: Profile = {
      name: displayName,
      struggle,
      desire,
      goalMode: goalMode || 'quick_sprint',
      dump,
      missionTitle: missionTitle || 'Define your immediate next step',
      stakeId: selectedStakeId || undefined,
      stakeAmount: cashAmount,
      durationMinutes,
      whenDay,
      partnerName: partnerName.trim() || undefined,
      partnerEmail: partnerEmail.trim() || undefined,
    };
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    onComplete(profile);
  }, [
    displayName,
    struggle,
    desire,
    goalMode,
    dump,
    missionTitle,
    selectedStakeId,
    cashAmount,
    durationMinutes,
    whenDay,
    partnerName,
    partnerEmail,
    onComplete,
  ]);

  /** "Let's Xecute" → native Shield + activated. */
  const commitAndActivate = useCallback(async () => {
    if (!selectedStakeId || busy) return;
    setBusy(true);
    try {
      const stake =
        stakes.find(s => s.id === selectedStakeId) || stakes[0] || null;
      const stakeType = stake
        ? resolveMissionStakeType(stake)
        : 'streak_only';
      const user = await sessionStore.getUser();
      const arenaActive = (await arenaMissionsStore.list()).find(
        m => m.status === 'active',
      );
      const mission = await missionStore.start({
        title: missionTitle || 'Define your immediate next step',
        durationMinutes,
        stakeType: stakeType as any,
        stakeAmount: cashAmount,
        stakeLabel: stake?.label,
        stakeConfigId: stake?.id,
        friendEmail: partnerEmail.trim() || undefined,
        friendName: partnerName.trim() || undefined,
        userId: user?.id,
        userName: user?.name || displayName,
        arenaMissionId: arenaActive?.id,
      });
      await BlockerBridge.startFocusSession({
        taskId: mission.id,
        durationMinutes,
        isStrict: true,
        domains: APP_CONFIG.defaultBlockedDomains,
      }).catch(() => undefined);
      await BlockerBridge.toggleShield(true).catch(() => undefined);
      setStep('activated');
    } catch {
      // Still show activated so onboarding never bricks
      setStep('activated');
    } finally {
      setBusy(false);
    }
  }, [
    selectedStakeId,
    busy,
    stakes,
    missionTitle,
    durationMinutes,
    cashAmount,
    partnerEmail,
    partnerName,
    displayName,
  ]);

  const runExtract = async () => {
    setBusy(true);
    setStep('extracting');
    const mode = goalMode || 'quick_sprint';
    try {
      const result = await runBrainDumpExtract({
        transcript: dump.trim(),
        struggle,
        desire,
        goalMode: mode,
        userName: displayName,
      });
      setTopTasks(result.topTasks);
      setMissionTitle(result.missionTitle);
      setMissionWhy(result.missionWhy);
      await goalTankService.setGoalMode(mode);
      await goalTankService.syncTanksFromXboss(
        result.topTasks.map(t => ({
          rank: t.rank,
          title: t.title,
          why: t.why,
          goalName: t.goalName,
        })),
        result.extractedGoal || result.missionTitle,
        result.hasMultipleGoals,
        mode,
      );
      const primaryGoal =
        result.extractedGoal ||
        result.topTasks[0]?.goalName ||
        result.missionTitle;
      await arenaMissionsStore.importFromBrainDump(result.topTasks, primaryGoal);
    } catch {
      // runBrainDumpExtract already falls back offline
    }
    setBusy(false);
    setStep('reveal');
  };

  const selectedStake = stakes.find(s => s.id === selectedStakeId) || null;
  const needsCash =
    selectedStake &&
    (selectedStake.isCashStake || selectedStake.stakeType === 'money');
  const needsPartner =
    selectedStake &&
    (selectedStake.stakeType === 'friend_notify' ||
      selectedStake.id === 'accountability');

  const stakeLabel = selectedStake
    ? needsCash
      ? `${settings.currencySymbol}${cashAmount} ${selectedStake.label}`
      : selectedStake.label
    : '';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
          justifyContent: 'center',
        },
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>
      <Text style={styles.brand}>XECUTE</Text>

      {step === 'hook' ? (
        <>
          <XBossBubble>
            Most people have 100 ideas and 0 results. You're here because you're
            tired of being 'most people.' Correct?
          </XBossBubble>
          <View style={styles.rowBtns}>
            <TouchableOpacity
              style={styles.primaryFlex}
              onPress={() => setStep('name')}
              activeOpacity={0.88}>
              <Text style={styles.primaryText}>YES</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryFlex}
              onPress={() => {
                setViaMediocre(true);
                setStep('mediocre_ready');
              }}
              activeOpacity={0.88}>
              <Text style={styles.secondaryText}>I LIKE BEING MEDIOCRE</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      {step === 'mediocre_ready' ? (
        <>
          <XBossBubble>
            I don't believe that. You've just grown tired of the struggle. But I
            believe in you. The only way forward is a single button.
          </XBossBubble>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => setStep('mediocre_go')}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>I'M READY TO TRY, BOSS</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'mediocre_go' ? (
        <>
          <XBossBubble>
            I've seen your potential. Now I want to see your results. Ready?
          </XBossBubble>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => setStep('name')}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>LET'S GO</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'name' ? (
        <>
          <XBossBubble>
            <Text style={styles.bubbleText}>
              I'm the XBoss. I don't manage your time. I manage your results.
            </Text>
            <Text style={[styles.bubbleText, {marginTop: 10}]}>
              What should I call you?
            </Text>
          </XBossBubble>
          <TextInput
            style={styles.input}
            placeholder="Type your name..."
            placeholderTextColor="rgba(26,11,46,0.35)"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            maxLength={15}
          />
          <TouchableOpacity
            style={[styles.primary, !name.trim() && styles.disabled]}
            disabled={!name.trim()}
            onPress={() => setStep(viaMediocre ? 'noise' : 'problem')}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>CONTINUE</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'problem' ? (
        <>
          <XBossBubble>
            <Text style={styles.bubbleText}>
              <Text style={styles.nameAccent}>{displayName}</Text>, tell me the
              truth.
            </Text>
            <Text style={[styles.bubbleText, {marginTop: 8}]}>
              What's the biggest thing stopping you right now?
            </Text>
          </XBossBubble>
          <View style={styles.options}>
            {PROBLEM_OPTIONS.map(opt => (
              <Option
                key={opt}
                label={opt}
                onPress={() => {
                  setStruggle(opt);
                  setStep('desire');
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      {step === 'noise' ? (
        <>
          <XBossBubble>
            <Text style={styles.bubbleText}>
              Tell me the truth,{' '}
              <Text style={styles.nameAccent}>{displayName}</Text>. Why are you
              stuck today?
            </Text>
          </XBossBubble>
          <View style={styles.options}>
            {NOISE_OPTIONS.map(opt => (
              <Option
                key={opt}
                label={opt}
                onPress={() => {
                  setStruggle(opt);
                  setStep('desire');
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      {step === 'desire' ? (
        <>
          <XBossBubble>
            I can fix that. But first, tell me: what is the one thing you want
            most?
          </XBossBubble>
          <View style={styles.options}>
            {DESIRE_OPTIONS.map(opt => (
              <Option
                key={opt}
                label={opt}
                onPress={() => {
                  setDesire(opt);
                  setStep('mode');
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      {step === 'mode' ? (
        <>
          <XBossBubble>How do you want to work on your goals?</XBossBubble>
          <TouchableOpacity
            style={[
              styles.modeCard,
              goalMode === 'quick_sprint' && styles.modeCardOn,
            ]}
            onPress={() => setGoalMode('quick_sprint')}>
            <Text style={styles.modeTitle}>Quick Sprint</Text>
            <Text style={styles.modeDetail}>1-3 days. Rapid daily execution.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeCard,
              goalMode === 'campaign' && styles.modeCardOn,
            ]}
            onPress={() => setGoalMode('campaign')}>
            <Text style={styles.modeTitle}>Long Missions</Text>
            <Text style={styles.modeDetail}>
              30-90 days. Phased milestone roadmap.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primary, !goalMode && styles.disabled]}
            disabled={!goalMode}
            onPress={() => setStep('dump')}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>CONTINUE</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'dump' ? (
        <>
          <XBossBubble>
            Don't type. It takes too long. Just talk to me. Tell me everything
            you need to do — or type it out.
          </XBossBubble>
          {micNotice ? <Text style={styles.micNotice}>{micNotice}</Text> : null}
          <TouchableOpacity
            style={[styles.micBtn, listening && styles.micBtnOn]}
            onPress={() => void startVoiceDump()}
            disabled={listening || busy}
            activeOpacity={0.88}>
            <Text style={styles.micGlyph}>{listening ? '●' : '◎'}</Text>
            <Text style={styles.micText}>
              {listening ? 'LISTENING…' : 'TAP TO SPEAK'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.orType}>OR TYPE IT OUT</Text>
          <TextInput
            style={[styles.input, styles.area]}
            placeholder={
              listening
                ? 'Listening…'
                : 'Type the chaos — goals, blockers, deadlines…'
            }
            placeholderTextColor="rgba(26,11,46,0.35)"
            value={dump}
            onChangeText={setDump}
            multiline
            editable={!listening}
          />
          <TouchableOpacity
            style={[styles.primary, (!dump.trim() || busy) && styles.disabled]}
            disabled={!dump.trim() || busy}
            onPress={() => void runExtract()}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>LET'S WORK</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'extracting' ? (
        <View style={styles.genWrap}>
          <XBossLoader size={120} />
          <Text style={styles.waking}>XBoss is waking up…</Text>
          <Text style={styles.genMsg}>{EXTRACTION_MESSAGES[extractPhase]}</Text>
        </View>
      ) : null}

      {step === 'reveal' ? (
        <>
          <Text style={styles.revealTitle}>{displayName}, you're clear.</Text>
          <Text style={styles.revealSub}>
            Out of everything you dumped, these move the needle most.
          </Text>
          {(topTasks.length
            ? topTasks
            : [{rank: 1, title: missionTitle, why: missionWhy}]
          ).map(t => (
            <View key={t.rank} style={styles.taskCard}>
              <Text style={styles.taskRank}>#{t.rank}</Text>
              <Text style={styles.taskTitle}>{t.title}</Text>
              {t.why ? <Text style={styles.taskWhy}>{t.why}</Text> : null}
            </View>
          ))}
          <TouchableOpacity
            style={styles.primary}
            onPress={() => setStep('stakes')}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>EXECUTE #1 →</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step === 'stakes' ? (
        <>
          <View style={styles.taskCard}>
            <Text style={styles.taskTitle}>{missionTitle}</Text>
            {missionWhy ? <Text style={styles.taskWhy}>{missionWhy}</Text> : null}
          </View>

          <Text style={styles.sectionLabel}>When will you do this</Text>
          <View style={styles.chips}>
            {(['Today', 'Tomorrow'] as const).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, whenDay === d && styles.chipOn]}
                onPress={() => setWhenDay(d)}>
                <Text
                  style={[styles.chipText, whenDay === d && styles.chipTextOn]}>
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>How long will it take</Text>
          <View style={styles.chips}>
            {DURATION_OPTIONS.map(mins => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.chip,
                  durationMinutes === mins && styles.chipOn,
                ]}
                onPress={() => setDurationMinutes(mins)}>
                <Text
                  style={[
                    styles.chipText,
                    durationMinutes === mins && styles.chipTextOn,
                  ]}>
                  {mins} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.stakesHeadline}>Set your stakes.</Text>
          <Text style={styles.stakesSub}>
            If you don't finish by {whenDay} ({durationMinutes} min), what do
            you lose?
          </Text>

          {stakes.map(s => {
            const isCash = s.isCashStake || s.stakeType === 'money';
            const label = isCash
              ? `${s.emoji} ${settings.currencySymbol}${cashAmount} ${s.label}`
              : `${s.emoji} ${s.label}`;
            return (
              <Option
                key={s.id}
                label={label}
                active={selectedStakeId === s.id}
                onPress={() => setSelectedStakeId(s.id)}
              />
            );
          })}

          {needsCash ? (
            <View style={styles.chips}>
              {settings.cashTiers.map(amt => (
                <TouchableOpacity
                  key={amt}
                  style={[styles.chip, cashAmount === amt && styles.chipOn]}
                  onPress={() => setCashAmount(amt)}>
                  <Text
                    style={[
                      styles.chipText,
                      cashAmount === amt && styles.chipTextOn,
                    ]}>
                    {settings.currencySymbol}
                    {amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {needsPartner ? (
            <View style={styles.partnerBox}>
              <Text style={styles.sectionLabel}>Accountability partner</Text>
              <TextInput
                style={styles.input}
                placeholder="Partner name"
                placeholderTextColor="rgba(26,11,46,0.35)"
                value={partnerName}
                onChangeText={setPartnerName}
              />
              <TextInput
                style={styles.input}
                placeholder="Partner email"
                placeholderTextColor="rgba(26,11,46,0.35)"
                value={partnerEmail}
                onChangeText={setPartnerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.primary,
              (!selectedStakeId || busy) && styles.disabled,
            ]}
            disabled={!selectedStakeId || busy}
            onPress={() => void commitAndActivate()}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>
              {busy ? 'RECORDING COMMITMENT…' : "LET'S XECUTE"}
            </Text>
          </TouchableOpacity>
          {!selectedStakeId ? (
            <Text style={styles.hintMono}>Select a stake to enable COMMIT.</Text>
          ) : null}
        </>
      ) : null}

      {step === 'activated' ? (
        <View style={styles.activatedWrap}>
          <View style={styles.checkCircle}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <Text style={styles.activatedTitle}>Mission Activated!</Text>
          <Text style={styles.activatedSub}>
            Welcome to the Arena. No excuses.
          </Text>
          <View style={styles.taskCard}>
            <Text style={styles.taskTitle}>{missionTitle}</Text>
            <Text style={styles.taskWhy}>
              {whenDay} · {durationMinutes} min
              {stakeLabel ? ` · ${stakeLabel}` : ''}
            </Text>
          </View>
          <Text style={styles.shieldNote}>
            Android Shield locks distracting apps on this device during your
            mission.
          </Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => void finish()}
            activeOpacity={0.88}>
            <Text style={styles.primaryText}>ENTER THE ARENA</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F7F0FF'},
  content: {paddingHorizontal: 20},
  inner: {width: '100%', maxWidth: 480, alignSelf: 'center', gap: 10},
  brand: {
    color: '#9010FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
    textAlign: 'center',
    marginBottom: 2,
  },
  bubbleWrap: {width: '100%', gap: 4},
  xbossLabel: {
    color: '#9010FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  bubble: {
    backgroundColor: '#F1E4FF',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(144,16,255,0.2)',
  },
  bubbleText: {
    color: '#1A0B2E',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  nameAccent: {color: '#9010FF', fontWeight: '800'},
  input: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(144,16,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#1A0B2E',
    fontSize: 16,
    fontWeight: '700',
  },
  area: {minHeight: 110, textAlignVertical: 'top'},
  micBtn: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#1A0B2E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  micBtnOn: {backgroundColor: '#9010FF'},
  micGlyph: {color: '#fff', fontSize: 28},
  micText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1,
  },
  orType: {
    textAlign: 'center',
    color: '#9010FF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  micNotice: {
    color: '#92400e',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  options: {gap: 8, width: '100%'},
  option: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(144,16,255,0.12)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  optionOn: {borderColor: '#9010FF', backgroundColor: 'rgba(144,16,255,0.08)'},
  optionText: {
    color: '#1A0B2E',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  optionTextOn: {color: '#9010FF'},
  rowBtns: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  primary: {
    marginTop: 4,
    backgroundColor: '#9010FF',
    borderRadius: 40,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryFlex: {
    flexGrow: 1,
    backgroundColor: '#9010FF',
    borderRadius: 40,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  secondaryFlex: {
    flexGrow: 1,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#E5CDFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 1.2,
    fontSize: 13,
  },
  secondaryText: {
    color: 'rgba(26,11,46,0.55)',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  disabled: {opacity: 0.4},
  modeCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(144,16,255,0.12)',
    padding: 14,
  },
  modeCardOn: {
    borderColor: '#9010FF',
    backgroundColor: 'rgba(144,16,255,0.08)',
  },
  modeTitle: {color: '#1A0B2E', fontWeight: '900', fontSize: 16},
  modeDetail: {color: 'rgba(26,11,46,0.55)', marginTop: 4, fontSize: 12},
  genWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 16,
  },
  waking: {
    color: 'rgba(26,11,46,0.55)',
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  genMsg: {
    color: 'rgba(26,11,46,0.65)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  revealTitle: {
    color: '#1A0B2E',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  revealSub: {
    color: 'rgba(26,11,46,0.65)',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(144,16,255,0.15)',
  },
  taskRank: {color: '#9010FF', fontWeight: '900', fontSize: 12},
  taskTitle: {color: '#1A0B2E', fontWeight: '800', fontSize: 15, marginTop: 4},
  taskWhy: {color: 'rgba(26,11,46,0.55)', fontSize: 12, marginTop: 6},
  sectionLabel: {
    color: '#1A0B2E',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 4,
  },
  stakesHeadline: {
    color: '#1A0B2E',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
  },
  stakesSub: {
    color: '#9010FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(144,16,255,0.2)',
  },
  chipOn: {backgroundColor: 'rgba(144,16,255,0.15)', borderColor: '#9010FF'},
  chipText: {color: 'rgba(26,11,46,0.55)', fontWeight: '700'},
  chipTextOn: {color: '#9010FF'},
  partnerBox: {gap: 8, marginTop: 4},
  activatedWrap: {alignItems: 'center', gap: 12, paddingTop: 24},
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(144,16,255,0.12)',
    borderWidth: 3,
    borderColor: '#9010FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {color: '#9010FF', fontSize: 28, fontWeight: '900'},
  activatedTitle: {
    color: '#1A0B2E',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  activatedSub: {
    color: '#9010FF',
    fontWeight: '800',
    letterSpacing: 1.5,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  shieldNote: {
    color: 'rgba(26,11,46,0.55)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  hintMono: {
    color: 'rgba(26,11,46,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 4,
  },
});

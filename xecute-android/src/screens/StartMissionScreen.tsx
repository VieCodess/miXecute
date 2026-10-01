import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {missionStore, StakeType} from '../api/missionStore';
import {sessionStore} from '../api/sessionStore';
import {
  accountabilityPartnersStore,
  AccountabilityPartner,
} from '../api/accountabilityPartnersStore';
import {
  stakeConfigStore,
  StakeConfigItem,
  StakeSettings,
  resolveMissionStakeType,
} from '../api/stakeConfigStore';
import {BlockerBridge} from '../native/BlockerBridge';
import {APP_CONFIG} from '../config';
import {useAppNav} from '../navigation/AppNav';

const DURATIONS = [15, 25, 45, 60, 90];

function isCashStakeItem(s: StakeConfigItem): boolean {
  return Boolean(s.isCashStake || s.stakeType === 'money');
}

type StartMissionProps = {
  prefillTitle?: string;
  arenaMissionId?: string;
};

export const StartMissionScreen: React.FC<StartMissionProps> = ({
  prefillTitle,
  arenaMissionId,
}) => {
  const navigation = useAppNav();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(prefillTitle || '');
  const [duration, setDuration] = useState(25);
  const [stakes, setStakes] = useState<StakeConfigItem[]>([]);
  const [settings, setSettings] = useState<StakeSettings>(
    stakeConfigStore.settings(),
  );
  const [selectedStakeId, setSelectedStakeId] = useState<string | null>(null);
  const [cashAmount, setCashAmount] = useState(10);
  const [customCash, setCustomCash] = useState('');
  const [acceptedPartners, setAcceptedPartners] = useState<
    AccountabilityPartner[]
  >([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    null,
  );
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedStake =
    stakes.find(s => s.id === selectedStakeId) || stakes[0] || null;
  const missionStakeType: StakeType = selectedStake
    ? (resolveMissionStakeType(selectedStake) as StakeType)
    : 'streak_only';
  const needsPartner = missionStakeType === 'friend_notify';
  const needsCash =
    missionStakeType === 'money' || Boolean(selectedStake?.isCashStake);

  const load = useCallback(async () => {
    setPartnersLoading(true);
    setPartnersError(null);
    try {
      const [snap, all] = await Promise.all([
        stakeConfigStore.refresh(),
        accountabilityPartnersStore.list().catch(() => []),
      ]);
      const enabled = stakeConfigStore.enabled(snap);
      setStakes(enabled);
      setSettings(snap.settings);
      setSelectedStakeId(prev =>
        prev && enabled.some(s => s.id === prev) ? prev : enabled[0]?.id ?? null,
      );
      const tiers = snap.settings.cashTiers;
      setCashAmount(tiers[1] || tiers[0] || 10);

      const targets = accountabilityPartnersStore.alertTargets(all);
      setAcceptedPartners(targets);
      const def = await accountabilityPartnersStore.resolveDefaultPartner(all);
      setSelectedPartnerId(def?.id ?? targets[0]?.id ?? null);
    } catch (e) {
      const snap = await stakeConfigStore.loadCached();
      const enabled = stakeConfigStore.enabled(snap);
      setStakes(enabled);
      setSettings(snap.settings);
      setSelectedStakeId(enabled[0]?.id ?? null);
      setPartnersError(
        e instanceof Error ? e.message : 'Could not load mission options',
      );
    } finally {
      setPartnersLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (prefillTitle) setTitle(prefillTitle);
  }, [prefillTitle]);

  useEffect(() => {
    void missionStore.getActive().then(active => {
      if (active) {
        Alert.alert(
          'One mission at a time',
          'You already have an active focus session.',
          [
            {
              text: 'Open active',
              onPress: () =>
                navigation.replace('ActiveMission', {missionId: active.id}),
            },
            {text: 'Back', style: 'cancel', onPress: () => navigation.goBack()},
          ],
        );
      }
    });
  }, [navigation]);

  const openPartners = () => {
    navigation.navigate('AccountabilityPartners');
  };

  const selectedPartner =
    acceptedPartners.find(p => p.id === selectedPartnerId) ?? null;

  const resolvedCash = (() => {
    if (!needsCash) return undefined;
    if (settings.allowCustomCashAmount && customCash.trim()) {
      const n = Number(customCash);
      if (Number.isFinite(n)) return n;
    }
    return cashAmount;
  })();

  const start = async () => {
    if (!title.trim()) {
      Alert.alert('Mission title', 'What are you executing?');
      return;
    }
    if (!selectedStake) {
      Alert.alert('Stake', 'No stakes available — check Admin stake config.');
      return;
    }
    if (needsCash) {
      const amt = resolvedCash || 0;
      if (
        amt < settings.minCashAmount ||
        amt > settings.maxCashAmount
      ) {
        Alert.alert(
          'Stake amount',
          `Pick between ${settings.currencySymbol}${settings.minCashAmount} and ${settings.currencySymbol}${settings.maxCashAmount}.`,
        );
        return;
      }
    }
    if (needsPartner) {
      if (!selectedPartner?.partnerEmail) {
        Alert.alert(
          'Accountability partner',
          'Add and accept a partner under You → Accountability partners, then pick them here.',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Manage partners', onPress: openPartners},
          ],
        );
        return;
      }
    }

    setBusy(true);
    try {
      const user = await sessionStore.getUser();
      const mission = await missionStore.start({
        title: title.trim(),
        durationMinutes: duration,
        stakeType: missionStakeType,
        stakeAmount: needsCash ? resolvedCash : undefined,
        stakeLabel: `${selectedStake.emoji} ${selectedStake.label}`.trim(),
        stakeConfigId: selectedStake.id,
        friendEmail: selectedPartner?.partnerEmail,
        friendName: selectedPartner?.partnerName,
        userId: user?.id,
        userName: user?.name,
        arenaMissionId,
      });

      await BlockerBridge.startFocusSession({
        taskId: mission.id,
        durationMinutes: duration,
        isStrict: true,
        domains: APP_CONFIG.defaultBlockedDomains,
      });

      navigation.replace('ActiveMission', {missionId: mission.id});
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      if (msg.includes('ACTIVE_MISSION_EXISTS')) {
        Alert.alert(
          'One mission at a time',
          'Finish your current mission before starting another.',
        );
      } else {
        Alert.alert('Could not start', msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 24}]}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Mission</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Ship onboarding copy"
        placeholderTextColor="#6b7280"
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Duration</Text>
      <View style={styles.chips}>
        {DURATIONS.map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.chip, duration === d && styles.chipOn]}
            onPress={() => setDuration(d)}>
            <Text style={[styles.chipText, duration === d && styles.chipTextOn]}>
              {d}m
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Stake</Text>
      <Text style={styles.adminHint}>
        Options from Admin stake config — free and Pro can both stake. Custom
        cash amount is optional when admin enables it.
      </Text>
      {stakes.length === 0 ? (
        <Text style={styles.partnerEmpty}>No enabled stakes from admin.</Text>
      ) : (
        stakes.map(s => {
          const type = resolveMissionStakeType(s);
          return (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.stake,
                selectedStakeId === s.id && styles.stakeOn,
              ]}
              onPress={() => setSelectedStakeId(s.id)}>
              <Text style={styles.stakeTitle}>
                {s.emoji} {s.label}
              </Text>
              <Text style={styles.stakeHint}>
                {type === 'friend_notify'
                  ? 'Partner gets emailed if you miss'
                  : isCashStakeItem(s)
                    ? `Cash stake (${settings.currencySymbol})`
                    : type === 'public_streak'
                      ? 'Social pressure — public streak on the line'
                      : type === 'custom'
                        ? 'Custom stake from admin'
                        : 'Keep the chain alive'}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

      {needsCash && selectedStake ? (
        <View style={styles.partner}>
          <Text style={styles.partnerHint}>
            Amount (admin tiers · {settings.currencySymbol}
            {settings.minCashAmount}–{settings.currencySymbol}
            {settings.maxCashAmount})
          </Text>
          <View style={styles.chips}>
            {settings.cashTiers.map(amt => (
              <TouchableOpacity
                key={amt}
                style={[styles.chip, cashAmount === amt && !customCash && styles.chipOn]}
                onPress={() => {
                  setCashAmount(amt);
                  setCustomCash('');
                }}>
                <Text
                  style={[
                    styles.chipText,
                    cashAmount === amt && !customCash && styles.chipTextOn,
                  ]}>
                  {settings.currencySymbol}
                  {amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {settings.allowCustomCashAmount ? (
            <TextInput
              style={styles.input}
              placeholder={`Custom amount (${settings.currencySymbol}) — optional`}
              placeholderTextColor="#6b7280"
              keyboardType="numeric"
              value={customCash}
              onChangeText={setCustomCash}
            />
          ) : null}
        </View>
      ) : null}

      {needsPartner ? (
        <View style={styles.partner}>
          <Text style={styles.partnerHint}>
            Uses your shared social accountability partner.
          </Text>
          {partnersLoading ? (
            <ActivityIndicator color="#a855f7" style={styles.partnerLoader} />
          ) : partnersError ? (
            <Text style={styles.partnerError}>{partnersError}</Text>
          ) : acceptedPartners.length === 0 ? (
            <Text style={styles.partnerEmpty}>
              No active partners yet. Invite someone and accept their request.
            </Text>
          ) : (
            acceptedPartners.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.partnerRow,
                  selectedPartnerId === p.id && styles.partnerRowOn,
                ]}
                onPress={() => setSelectedPartnerId(p.id)}>
                <View style={styles.partnerRadio}>
                  {selectedPartnerId === p.id ? (
                    <View style={styles.partnerRadioDot} />
                  ) : null}
                </View>
                <View style={styles.partnerMeta}>
                  <Text style={styles.partnerName}>{p.partnerName}</Text>
                  <Text style={styles.partnerEmail}>{p.partnerEmail}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity style={styles.partnerLink} onPress={openPartners}>
            <Text style={styles.partnerLinkText}>
              Manage accountability partners
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.note}>
        Starting arms Xecute Shield for this window. Distracting apps and sites
        stay locked until you finish or burn XCredits for a break.
      </Text>

      <TouchableOpacity
        style={styles.primary}
        onPress={start}
        disabled={busy}
        activeOpacity={0.85}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Commit & lock Shield</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0d0b14'},
  content: {padding: 16},
  label: {
    color: '#a855f7',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 8,
  },
  adminHint: {color: '#6b7280', fontSize: 12, marginBottom: 10, lineHeight: 16},
  input: {
    backgroundColor: '#151522',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222233',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#151522',
    borderWidth: 1,
    borderColor: '#222233',
  },
  chipOn: {backgroundColor: 'rgba(168,85,247,0.2)', borderColor: '#a855f7'},
  chipText: {color: '#9ca3af', fontWeight: '700'},
  chipTextOn: {color: '#fff'},
  stake: {
    backgroundColor: '#151522',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222233',
    marginBottom: 8,
  },
  stakeOn: {borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.08)'},
  stakeTitle: {color: '#fff', fontWeight: '800'},
  stakeHint: {color: '#9ca3af', fontSize: 12, marginTop: 4},
  partner: {marginTop: 4},
  partnerHint: {color: '#9ca3af', fontSize: 12, marginBottom: 10, lineHeight: 17},
  partnerLoader: {marginVertical: 12},
  partnerError: {color: '#f87171', fontSize: 13, marginBottom: 8},
  partnerEmpty: {color: '#6b7280', fontSize: 13, marginBottom: 8},
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151522',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222233',
    marginBottom: 8,
  },
  partnerRowOn: {
    borderColor: '#a855f7',
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  partnerRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#a855f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  partnerRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#a855f7',
  },
  partnerMeta: {flex: 1},
  partnerName: {color: '#fff', fontWeight: '800'},
  partnerEmail: {color: '#9ca3af', fontSize: 12, marginTop: 2},
  partnerLink: {paddingVertical: 8},
  partnerLinkText: {color: '#a855f7', fontWeight: '700', fontSize: 13},
  note: {color: '#9ca3af', fontSize: 13, lineHeight: 18, marginVertical: 14},
  primary: {
    backgroundColor: '#a855f7',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: {color: '#fff', fontWeight: '800', fontSize: 15},
});

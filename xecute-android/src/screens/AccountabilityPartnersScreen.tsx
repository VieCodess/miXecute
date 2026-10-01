import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  accountabilityPartnersStore,
  AccountabilityPartner,
} from '../api/accountabilityPartnersStore';
import {useAppNav} from '../navigation/AppNav';

export const AccountabilityPartnersScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNav();
  const [partners, setPartners] = useState<AccountabilityPartner[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setPartners(await accountabilityPartnersStore.list());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load partners');
      setPartners([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const active = accountabilityPartnersStore.accepted(partners);
  const incoming = accountabilityPartnersStore.incomingPending(partners);
  const outgoing = accountabilityPartnersStore.outgoingPending(partners);

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!email.includes('@')) {
      Alert.alert('Email required', 'Enter your partner’s email (they can join Xecute later).');
      return;
    }
    setBusy(true);
    try {
      const result = await accountabilityPartnersStore.request(email);
      setInviteEmail('');
      Alert.alert(
        'Partner invited',
        result.externalInvite
          ? result.message ||
              'We emailed them on Resend. When they join Xecute you’ll get a push to connect and share data.'
          : 'They’ll see the request in Xecute and can accept to become your shared accountability partner.',
      );
      await load();
    } catch (e) {
      Alert.alert(
        'Could not invite',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setBusy(false);
    }
  };

  const respond = async (id: string, accept: boolean) => {
    setBusy(true);
    try {
      await accountabilityPartnersStore.respond(id, accept);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const remove = (p: AccountabilityPartner) => {
    Alert.alert(
      'Remove partner?',
      `${p.partnerName} will no longer be your accountability partner.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setBusy(true);
              try {
                await accountabilityPartnersStore.remove(p.id);
                await load();
              } catch (e) {
                Alert.alert(
                  'Error',
                  e instanceof Error ? e.message : 'Try again',
                );
              } finally {
                setBusy(false);
              }
            })(),
        },
      ],
    );
  };

  const setDefault = async (p: AccountabilityPartner) => {
    await accountabilityPartnersStore.setDefaultPartnerId(p.id);
    Alert.alert('Default partner', `${p.partnerName} will pre-fill on new missions.`);
  };

  const PartnerCard = ({
    p,
    actions,
  }: {
    p: AccountabilityPartner;
    actions?: React.ReactNode;
  }) => (
    <View style={styles.card}>
      <Text style={styles.partnerName}>{p.partnerName}</Text>
      <Text style={styles.partnerEmail}>{p.partnerEmail}</Text>
      {p.externalInvite ? (
        <Text style={styles.streak}>Invited by email — alerts until they join</Text>
      ) : null}
      {p.sharedStreaks != null && p.sharedStreaks > 0 ? (
        <Text style={styles.streak}>{p.sharedStreaks} shared streak</Text>
      ) : null}
      {actions}
    </View>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {paddingTop: insets.top + 12}]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a855f7" />
      }>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.brand}>Xecute</Text>
      <Text style={styles.heading}>Accountability partners</Text>
      <Text style={styles.copy}>
        Invite by email (Resend if they’re not on Xecute yet). Missed missions
        email partners via OneSignal. When they join, you get a push to share data.
      </Text>

      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorHint}>
            Partners need Supabase social enabled on the API host.
          </Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{active.length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{incoming.length}</Text>
          <Text style={styles.statLabel}>Incoming</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statVal}>
            {active.reduce((s, p) => s + (p.sharedStreaks || 0), 0)}
          </Text>
          <Text style={styles.statLabel}>Shared streaks</Text>
        </View>
      </View>

      <Text style={styles.section}>Invite partner</Text>
      <TextInput
        style={styles.input}
        placeholder="Partner’s email"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        keyboardType="email-address"
        value={inviteEmail}
        onChangeText={setInviteEmail}
      />
      <TouchableOpacity
        style={styles.primary}
        onPress={() => void invite()}
        disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Send partner request</Text>
        )}
      </TouchableOpacity>

      {incoming.length > 0 ? (
        <>
          <Text style={styles.section}>Requests for you</Text>
          {incoming.map(p => (
            <PartnerCard
              key={p.id}
              p={p}
              actions={
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.accept}
                    onPress={() => void respond(p.id, true)}>
                    <Text style={styles.btnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.decline}
                    onPress={() => void respond(p.id, false)}>
                    <Text style={styles.btnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          ))}
        </>
      ) : null}

      {outgoing.length > 0 ? (
        <>
          <Text style={styles.section}>Waiting on them</Text>
          {outgoing.map(p => (
            <PartnerCard key={p.id} p={p} />
          ))}
        </>
      ) : null}

      <Text style={styles.section}>Active partners</Text>
      {active.length === 0 ? (
        <Text style={styles.empty}>No active partners yet — invite someone above.</Text>
      ) : (
        active.map(p => (
          <PartnerCard
            key={p.id}
            p={p}
            actions={
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => void setDefault(p)}>
                  <Text style={styles.secondaryBtnText}>Set default</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.decline}
                  onPress={() => remove(p)}>
                  <Text style={styles.btnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            }
          />
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0d0b14'},
  content: {paddingHorizontal: 16, paddingBottom: 40},
  back: {color: '#a855f7', fontWeight: '700', marginBottom: 8},
  brand: {
    color: '#a855f7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  heading: {color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 6},
  copy: {color: '#9ca3af', marginTop: 8, marginBottom: 14, lineHeight: 20},
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  errorText: {color: '#f87171', fontWeight: '700'},
  errorHint: {color: '#9ca3af', fontSize: 12, marginTop: 4},
  statsRow: {flexDirection: 'row', gap: 8, marginBottom: 8},
  stat: {
    flex: 1,
    backgroundColor: '#151522',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#222233',
    alignItems: 'center',
  },
  statVal: {color: '#fff', fontWeight: '800', fontSize: 18},
  statLabel: {color: '#6b7280', fontSize: 10, fontWeight: '700', marginTop: 2},
  section: {
    color: '#fff',
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#151522',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222233',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    marginBottom: 10,
  },
  primary: {
    backgroundColor: '#a855f7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {color: '#fff', fontWeight: '800'},
  card: {
    backgroundColor: '#151522',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222233',
    marginBottom: 10,
  },
  partnerName: {color: '#fff', fontWeight: '800', fontSize: 16},
  partnerEmail: {color: '#9ca3af', marginTop: 2},
  streak: {color: '#a855f7', fontSize: 12, fontWeight: '700', marginTop: 6},
  row: {flexDirection: 'row', gap: 8, marginTop: 12},
  accept: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  decline: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#1f1830',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {color: '#fff', fontWeight: '700'},
  btnText: {color: '#fff', fontWeight: '800'},
  empty: {color: '#6b7280', marginBottom: 8},
});

import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {sessionStore, PublicUser} from '../api/sessionStore';
import {creditsStore} from '../api/creditsStore';
import {RevenueCat, CustomerInfoSummary} from '../billing/RevenueCat';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';
import {ArenaHeader} from '../components/ArenaHeader';
import {ArenaHero} from '../components/ArenaHero';

type Props = {
  onSignedOut: () => void;
};

export const ProfileScreen: React.FC<Props> = ({onSignedOut}) => {
  const navigation = useAppNav();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [billing, setBilling] = useState<CustomerInfoSummary | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    void sessionStore.getUser().then(setUser);
    void (async () => {
      setBillingBusy(true);
      try {
        const [info, snap] = await Promise.all([
          RevenueCat.getCustomerInfo().catch(() => null),
          creditsStore.sync().catch(() => null),
        ]);
        setBilling(info);
        if (snap) setCredits(snap.balance);
        else setCredits(await creditsStore.getLocalBalance());
      } catch {
        setBilling(null);
        setCredits(await creditsStore.getLocalBalance().catch(() => null));
      } finally {
        setBillingBusy(false);
      }
    })();
  }, []);

  const signOut = () => {
    Alert.alert('Sign out?', undefined, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await sessionStore.clear();
          onSignedOut();
        },
      },
    ]);
  };

  const openCustomerCenter = async () => {
    try {
      await RevenueCat.presentCustomerCenter();
    } catch (e) {
      Alert.alert(
        'Customer Center',
        e instanceof Error ? e.message : 'Could not open',
      );
    }
  };

  return (
    <View style={styles.root}>
      <ArenaHeader />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
      <ArenaHero
        title="Account Preferences"
        copy="Manage your account profile and other app settings."
        glyph="●"
      />
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name || 'Operator'}</Text>
        <Text style={styles.email}>{user?.email || '—'}</Text>
        <View style={styles.tierRow}>
          <Text style={styles.tierLabel}>Plan</Text>
          {billingBusy ? (
            <ActivityIndicator color="#a855f7" size="small" />
          ) : (
            <Text style={[styles.tierValue, billing?.isPro && styles.tierPro]}>
              {billing?.isFounder
                ? 'Founder'
                : billing?.isPro
                  ? 'Pro'
                  : 'Free'}
            </Text>
          )}
        </View>
        <View style={styles.tierRow}>
          <Text style={styles.tierLabel}>XCredits</Text>
          <Text style={styles.tierValue}>
            {credits == null ? '—' : credits}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primary}
        onPress={() => navigation.navigate('Paywall')}>
        <Text style={styles.primaryText}>
          {billing?.isPro ? 'Manage Xecute Pro' : 'Upgrade to Xecute Pro'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondary}
        onPress={() => navigation.navigate('AccountabilityPartners')}>
        <Text style={styles.secondaryText}>Accountability partners</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondary}
        onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.secondaryText}>Settings & notifications</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondary}
        onPress={() => navigation.navigate('Trends')}>
        <Text style={styles.secondaryText}>
          {billing?.isPro ? 'Weekly trends' : 'Weekly trends (Pro)'}
        </Text>
      </TouchableOpacity>

      {billing?.isPro ? (
        <TouchableOpacity style={styles.secondary} onPress={openCustomerCenter}>
          <Text style={styles.secondaryText}>Subscription Customer Center</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.note}>
        Xecute is ready here. Shield, missions, stakes, and account controls
        all run from this app.
      </Text>

      <TouchableOpacity style={styles.danger} onPress={signOut}>
        <Text style={styles.dangerText}>Sign out</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    content: {paddingHorizontal: 14, paddingBottom: 24, paddingTop: 12},
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 16,
      borderWidth: 2,
      borderColor: c.border,
    },
    name: {color: c.text, fontSize: 18, fontWeight: '800'},
    email: {color: c.textMuted, marginTop: 4},
    tierRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tierLabel: {color: c.textMuted, fontWeight: '700', fontSize: 12},
    tierValue: {color: c.textSoft, fontWeight: '800'},
    tierPro: {color: c.primary},
    primary: {
      marginTop: 16,
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryText: {color: c.onPrimary, fontWeight: '800'},
    note: {color: c.textSoft, marginTop: 18, lineHeight: 20, fontSize: 13},
    secondary: {
      marginTop: 12,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: c.border,
    },
    secondaryText: {color: c.text, fontWeight: '700'},
    danger: {
      marginTop: 12,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.dangerBorder,
    },
    dangerText: {color: c.danger, fontWeight: '800'},
  });
}

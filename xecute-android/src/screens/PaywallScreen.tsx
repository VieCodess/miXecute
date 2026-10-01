import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  RevenueCat,
  CustomerInfoSummary,
  OfferingPackage,
} from '../billing/RevenueCat';
import {apiFetch} from '../api/sessionStore';

async function syncProToBackend(info: CustomerInfoSummary) {
  if (!info.isPro) return;
  try {
    await apiFetch('/api/billing/revenuecat/sync', {
      method: 'POST',
      body: JSON.stringify({
        isPro: true,
        isFounder: !!info.isFounder,
        planKind: info.planKind,
        entitlementId: info.entitlementId,
        productIdentifier: info.productIdentifier,
        expirationDate: info.expirationDate,
        appUserId: info.appUserId,
      }),
    });
  } catch {
    // Offline OK — CustomerInfo remains source of truth on device
  }
}

function packageLabel(pkg: OfferingPackage) {
  if (pkg.displayLabel) return pkg.displayLabel;
  const kind = (pkg.planKind || pkg.identifier || '').toLowerCase();
  if (kind.includes('founder') || kind.includes('life')) return 'Founder Pass';
  if (kind.includes('year') || kind.includes('annual')) return 'Pro Yearly';
  if (kind.includes('month')) return 'Pro Monthly';
  return pkg.title || pkg.identifier;
}

function packageHint(pkg: OfferingPackage) {
  const kind = (pkg.planKind || pkg.identifier || '').toLowerCase();
  if (kind.includes('founder') || kind.includes('life')) {
    return 'Lifetime Founder Pass';
  }
  if (kind.includes('year') || kind.includes('annual')) {
    return 'Pro × 12 (billed yearly)';
  }
  return 'Xecute Pro — monthly';
}

export const PaywallScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<CustomerInfoSummary | null>(null);
  const [packages, setPackages] = useState<OfferingPackage[]>([]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [customer, offerings] = await Promise.all([
        RevenueCat.getCustomerInfo(),
        RevenueCat.getOfferings(),
      ]);
      setInfo(customer);
      setPackages(offerings.packages || []);
      await syncProToBackend(customer);
    } catch (e) {
      Alert.alert(
        'Billing',
        e instanceof Error ? e.message : 'Could not load offerings',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openPaywall = async () => {
    setBusy(true);
    try {
      const result = await RevenueCat.presentPaywall();
      if (result.customerInfo) {
        setInfo(result.customerInfo);
        await syncProToBackend(result.customerInfo);
      } else {
        await refresh();
      }
    } catch (e) {
      Alert.alert('Paywall', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const buy = async (packageId: string) => {
    setBusy(true);
    try {
      const customer = await RevenueCat.purchasePackage(packageId);
      setInfo(customer);
      await syncProToBackend(customer);
      Alert.alert(
        customer.isFounder ? 'Welcome, Founder' : 'Welcome to Pro',
        customer.isFounder
          ? 'Founder Pass is active — lifetime Pro access on this device.'
          : 'Xecute Pro is active on this device.',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Purchase failed';
      if (!/CANCELLED/i.test(msg)) Alert.alert('Purchase', msg);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const customer = await RevenueCat.restore();
      setInfo(customer);
      await syncProToBackend(customer);
      Alert.alert(
        customer.isPro ? 'Restored' : 'No purchases',
        customer.isPro
          ? customer.isFounder
            ? 'Your Founder Pass is back.'
            : 'Your Pro access is back.'
          : 'No active xecute_pro entitlement found.',
      );
    } catch (e) {
      Alert.alert('Restore', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
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

  const statusTitle = info?.isFounder
    ? 'Founder Pass'
    : info?.isPro
      ? info.planKind === 'pro_yearly'
        ? 'Pro Yearly'
        : 'Pro Monthly'
      : 'Free plan';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {paddingTop: insets.top + 12}]}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.brand}>Xecute</Text>
      <Text style={styles.heading}>
        {info?.isFounder
          ? 'You’re a Founder'
          : info?.isPro
            ? 'You’re Pro'
            : 'Unlock Xecute Pro'}
      </Text>
      <Text style={styles.copy}>
        Entitlement <Text style={styles.mono}>xecute_pro</Text> · Pro Monthly ·
        Pro Yearly (×12) · Founder Pass (lifetime).
      </Text>

      <View style={[styles.card, info?.isPro && styles.cardPro]}>
        <Text style={styles.cardEyebrow}>STATUS</Text>
        <Text style={styles.cardTitle}>{statusTitle}</Text>
        {info?.productIdentifier ? (
          <Text style={styles.meta}>Product: {info.productIdentifier}</Text>
        ) : null}
      </View>

      {busy ? (
        <ActivityIndicator color="#a855f7" style={{marginVertical: 16}} />
      ) : null}

      <TouchableOpacity style={styles.primary} onPress={openPaywall} disabled={busy}>
        <Text style={styles.primaryText}>
          {info?.isPro ? 'View paywall' : 'Show RevenueCat Paywall'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.section}>Or pick a package</Text>
      {packages.length === 0 ? (
        <Text style={styles.empty}>
          No packages loaded. In RevenueCat, set current offering packages:
          monthly (Pro), yearly (Pro ×12), lifetime (Founder Pass).
        </Text>
      ) : (
        packages.map(pkg => (
          <TouchableOpacity
            key={pkg.identifier}
            style={styles.pkg}
            onPress={() => buy(pkg.identifier)}
            disabled={busy || !!info?.isPro}>
            <View style={{flex: 1}}>
              <Text style={styles.pkgTitle}>{packageLabel(pkg)}</Text>
              <Text style={styles.pkgMeta}>{packageHint(pkg)}</Text>
            </View>
            <Text style={styles.pkgPrice}>{pkg.priceString}</Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.secondary} onPress={restore} disabled={busy}>
        <Text style={styles.secondaryText}>Restore purchases</Text>
      </TouchableOpacity>

      {info?.isPro ? (
        <TouchableOpacity style={styles.secondary} onPress={openCustomerCenter}>
          <Text style={styles.secondaryText}>
            {info.isFounder ? 'Customer Center' : 'Manage subscription'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0d0b14'},
  content: {paddingHorizontal: 16, paddingBottom: 40},
  brand: {
    color: '#a855f7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: -0.4,
  },
  copy: {color: '#9ca3af', marginTop: 8, marginBottom: 18, lineHeight: 20},
  mono: {color: '#c4b5fd', fontFamily: 'monospace'},
  card: {
    backgroundColor: '#151522',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222233',
    marginBottom: 16,
  },
  cardPro: {
    borderColor: 'rgba(168,85,247,0.5)',
    backgroundColor: 'rgba(168,85,247,0.1)',
  },
  cardEyebrow: {color: '#a855f7', fontWeight: '800', fontSize: 11, letterSpacing: 1},
  cardTitle: {color: '#fff', fontWeight: '800', fontSize: 18, marginTop: 4},
  meta: {color: '#9ca3af', marginTop: 4, fontSize: 12},
  primary: {
    backgroundColor: '#a855f7',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 18,
  },
  primaryText: {color: '#fff', fontWeight: '800'},
  section: {color: '#fff', fontWeight: '800', marginBottom: 10},
  empty: {color: '#6b7280', marginBottom: 12, lineHeight: 18},
  pkg: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151522',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222233',
    marginBottom: 8,
  },
  pkgTitle: {color: '#fff', fontWeight: '800'},
  pkgMeta: {color: '#6b7280', fontSize: 11, marginTop: 2},
  pkgPrice: {color: '#a855f7', fontWeight: '800'},
  secondary: {
    marginTop: 10,
    backgroundColor: '#1f1830',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {color: '#fff', fontWeight: '700'},
});

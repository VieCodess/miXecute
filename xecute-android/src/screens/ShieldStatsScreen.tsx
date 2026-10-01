import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {shieldStatsStore, ShieldStats} from '../api/shieldStatsStore';
import {useAppNav} from '../navigation/AppNav';

function formatWhen(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ShieldStatsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNav();
  const [stats, setStats] = useState<ShieldStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await shieldStatsStore.fetch(40));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load stats');
    } finally {
      setLoading(false);
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

  const s = stats?.summary;

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
      <Text style={styles.heading}>Shield stats</Text>
      <Text style={styles.copy}>
        Blocks synced from this device — same event stream admins see for your account.
      </Text>

      {loading && !stats ? (
        <ActivityIndicator color="#a855f7" style={{marginTop: 24}} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {s ? (
        <View style={styles.grid}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{s.blocksToday}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{s.blocksThisWeek}</Text>
            <Text style={styles.statLabel}>This week</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{s.totalBlocks}</Text>
            <Text style={styles.statLabel}>All time</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{s.uniqueAppsBlocked}</Text>
            <Text style={styles.statLabel}>Apps hit</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{s.appsOnBlocklist}</Text>
            <Text style={styles.statLabel}>Apps listed</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{s.domainsOnBlocklist}</Text>
            <Text style={styles.statLabel}>Sites listed</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>Recent blocks</Text>
      {!stats?.recentEvents?.length ? (
        <Text style={styles.empty}>
          No shield events synced yet. Run a mission with Shield on — blocks will appear here.
        </Text>
      ) : (
        stats.recentEvents.map(ev => (
          <View key={ev.id} style={styles.row}>
            <Text style={styles.pkg} numberOfLines={1}>
              {ev.packageName || 'Unknown app'}
            </Text>
            <Text style={styles.meta}>
              {ev.action || 'SWITCH'} · {formatWhen(ev.timestamp)}
            </Text>
          </View>
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
  error: {color: '#f87171', marginBottom: 12},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8},
  stat: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: '#151522',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222233',
    alignItems: 'center',
  },
  statVal: {color: '#fff', fontWeight: '800', fontSize: 20},
  statLabel: {color: '#6b7280', fontSize: 10, fontWeight: '700', marginTop: 2},
  section: {color: '#fff', fontWeight: '800', marginTop: 18, marginBottom: 8},
  empty: {color: '#6b7280', lineHeight: 20},
  row: {
    backgroundColor: '#151522',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222233',
    marginBottom: 8,
  },
  pkg: {color: '#fff', fontWeight: '700'},
  meta: {color: '#9ca3af', fontSize: 12, marginTop: 4},
});

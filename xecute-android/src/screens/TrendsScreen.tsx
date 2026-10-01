import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {trendsStore, WeeklyTrends} from '../api/trendsStore';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';
import {ArenaHeader} from '../components/ArenaHeader';
import {ArenaHero} from '../components/ArenaHero';

export const TrendsScreen: React.FC = () => {
  const navigation = useAppNav();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<WeeklyTrends | null>(null);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await trendsStore.fetch());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxBar = Math.max(
    1,
    ...(data?.slots.map(s => s.productiveMinutes + s.missedMinutes) || [1]),
  );

  return (
    <View style={styles.root}>
      <ArenaHeader />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}>
        <ArenaHero
          title="Analytics"
          copy="Track and analyse your xecution performance."
          glyph="📈"
        />

        {busy && !data ? (
          <ActivityIndicator color={colors.primary} style={{marginTop: 24}} />
        ) : null}

        {data && !data.isPro ? (
          <View style={styles.lockCard}>
            <Text style={styles.lockTitle}>Pro insight</Text>
            <Text style={styles.lockCopy}>
              Unlock weekly trend charts with Xecute Pro or Founder Pass. Basic
              mission history stays free.
            </Text>
            <TouchableOpacity
              style={styles.primary}
              onPress={() => navigation.navigate('Paywall')}>
              <Text style={styles.primaryText}>Upgrade to Pro</Text>
            </TouchableOpacity>
            <Text style={styles.teaser}>
              This week: {data.totalResolvedThisWeek} missions resolved ·{' '}
              {data.totalProductiveMinutes}m productive (summary only)
            </Text>
          </View>
        ) : null}

        {data?.isPro ? (
          <>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{data.totalProductiveMinutes}m</Text>
                <Text style={styles.statLabel}>Productive</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statVal, styles.miss]}>
                  {data.totalMissedMinutes}m
                </Text>
                <Text style={styles.statLabel}>Missed</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{data.totalResolvedThisWeek}</Text>
                <Text style={styles.statLabel}>Resolved</Text>
              </View>
            </View>

            <Text style={styles.section}>This week</Text>
            {data.slots.map(slot => {
              const prodH = Math.round((slot.productiveMinutes / maxBar) * 80);
              const missH = Math.round((slot.missedMinutes / maxBar) * 80);
              return (
                <View key={slot.day} style={styles.dayRow}>
                  <Text style={styles.dayLabel}>{slot.day}</Text>
                  <View style={styles.bars}>
                    <View style={[styles.barProd, {height: Math.max(2, prodH)}]} />
                    <View style={[styles.barMiss, {height: Math.max(0, missH)}]} />
                  </View>
                  <Text style={styles.dayMeta}>
                    {slot.productiveMinutes}m / {slot.missedMinutes}m
                  </Text>
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    content: {paddingHorizontal: 14, paddingBottom: 24, paddingTop: 12},
    lockCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 2,
      borderColor: c.borderStrong,
    },
    lockTitle: {color: c.primary, fontWeight: '800', fontSize: 13, letterSpacing: 1},
    lockCopy: {color: c.text, marginTop: 8, lineHeight: 20, fontWeight: '600'},
    primary: {
      marginTop: 14,
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryText: {color: c.onPrimary, fontWeight: '800'},
    teaser: {color: c.textMuted, marginTop: 12, fontSize: 12},
    statsRow: {flexDirection: 'row', gap: 8, marginBottom: 18},
    stat: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    statVal: {color: c.text, fontWeight: '800', fontSize: 18},
    miss: {color: c.danger},
    statLabel: {color: c.textMuted, fontSize: 11, fontWeight: '700', marginTop: 4},
    section: {color: c.text, fontWeight: '800', marginBottom: 10},
    dayRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 10,
      gap: 10,
    },
    dayLabel: {color: c.textMuted, width: 32, fontWeight: '700', fontSize: 12},
    bars: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      height: 84,
    },
    barProd: {
      width: 10,
      backgroundColor: c.primary,
      borderRadius: 4,
    },
    barMiss: {
      width: 10,
      backgroundColor: 'rgba(248,113,113,0.7)',
      borderRadius: 4,
    },
    dayMeta: {color: c.textMuted, fontSize: 11, width: 72, textAlign: 'right'},
  });
}

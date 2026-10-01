import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {missionStore, Mission} from '../api/missionStore';
import {
  arenaMissionsStore,
  type ArenaMission,
} from '../api/arenaMissionsStore';
import {
  goalTankService,
  type BrainDumpStatus,
} from '../api/goalTankService';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';
import {ArenaHeader} from '../components/ArenaHeader';
import {ArenaHero} from '../components/ArenaHero';

/**
 * Missions tab: brain dump gate, ranked queue, one focus mission.
 */
export const MissionsScreen: React.FC = () => {
  const navigation = useAppNav();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focusHistory, setFocusHistory] = useState<Mission[]>([]);
  const [arena, setArena] = useState<ArenaMission[]>([]);
  const [focusActive, setFocusActive] = useState<Mission | null>(null);
  const [brainDump, setBrainDump] = useState<BrainDumpStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [missions, queue, active, dumpStatus] = await Promise.all([
        missionStore.list(),
        arenaMissionsStore.list(),
        missionStore.getActive(),
        goalTankService.getBrainDumpStatus(),
      ]);
      setFocusHistory(missions);
      setArena(queue);
      setFocusActive(active);
      setBrainDump(dumpStatus);
    } catch {
      setFocusHistory([]);
      setArena([]);
      setFocusActive(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsub = goalTankService.subscribe(() => {
      void load();
    });
    return unsub;
  }, [load]);

  const requestBrainDump = () => {
    const status = brainDump;
    if (!status?.isLocked) {
      navigation.navigate('BrainDump');
      return;
    }
    Alert.alert(
      'Brain dump locked',
      status.goalMode === 'campaign'
        ? `Long Mission dump unlocks when your tank hits 100% (${status.tankPercent}% filled).`
        : `Sprint dump unlocks after all 4 missions are executed (${status.missionsCompleted}/${status.missionsRequired} done).`,
    );
  };

  const openArenaMission = async (item: ArenaMission) => {
    if (item.isLocked) {
      Alert.alert(
        'Locked',
        'Complete the prior mission in the sequence or upgrade to unlock.',
      );
      return;
    }
    if (focusActive) {
      navigation.navigate('ActiveMission', {missionId: focusActive.id});
      return;
    }
    if (item.status === 'completed' || item.status === 'missed') {
      return;
    }
    if (item.status === 'pending') {
      const res = await arenaMissionsStore.activate(item.id);
      if (!res.ok) {
        Alert.alert('One mission at a time', res.reason);
        return;
      }
    }
    navigation.navigate('StartMission', {
      title: item.title,
      arenaMissionId: item.id,
    });
  };

  const settled = focusHistory.filter(m => m.status !== 'active');

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
        <View style={styles.heroRow}>
          <ArenaHero
            title="Missions"
            copy="Complete missions to credit XCredits. Brain dump keeps one active mission in focus."
            glyph="◎"
          />
          <TouchableOpacity
            style={[
              styles.newBtn,
              brainDump?.isLocked && styles.newBtnLocked,
            ]}
            onPress={requestBrainDump}
            activeOpacity={0.88}>
            <Text style={styles.newBtnText}>
              {brainDump?.isLocked ? '🔒 New' : '+ New'}
            </Text>
          </TouchableOpacity>
        </View>

        {focusActive ? (
          <TouchableOpacity
            style={styles.activeCard}
            onPress={() =>
              navigation.navigate('ActiveMission', {missionId: focusActive.id})
            }
            activeOpacity={0.88}>
            <Text style={styles.eyebrow}>FOCUS SESSION ACTIVE</Text>
            <Text style={styles.cardTitle}>{focusActive.title}</Text>
            <Text style={styles.cardMeta}>
              {focusActive.durationMinutes}m · finish before starting another
            </Text>
            <Text style={styles.link}>Open mission →</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.section}>Your sequence</Text>
        {arena.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>
              No XBoss sequence yet. Tap + New to voice or text dump.
            </Text>
          </View>
        ) : (
          arena.map(item => {
            const isActiveArena = item.status === 'active';
            const done = item.status === 'completed';
            const missed = item.status === 'missed';
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.row,
                  item.isLocked && styles.rowLocked,
                  done && styles.rowOk,
                  missed && styles.rowMiss,
                ]}
                onPress={() => void openArenaMission(item)}
                activeOpacity={0.88}
                disabled={item.isLocked && !isActiveArena}>
                <View style={{flex: 1, paddingRight: 10}}>
                  <Text style={styles.rank}>#{item.rank}</Text>
                  <Text
                    style={[
                      styles.rowTitle,
                      missed && styles.rowTitleMiss,
                      item.isLocked && styles.rowTitleLocked,
                    ]}
                    numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.isLocked
                      ? 'Locked'
                      : isActiveArena
                        ? 'Active · tap to stake & start'
                        : item.status}
                    {' · '}
                    {item.durationMinutes}m
                  </Text>
                </View>
                <Text style={styles.rowMark}>
                  {item.isLocked ? '🔒' : done ? '✓' : missed ? '✕' : '○'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.section}>Focus history</Text>
        {settled.length === 0 ? (
          <Text style={styles.empty}>No settled focus sessions yet.</Text>
        ) : (
          settled.map(m => {
            const missed = m.status === 'missed';
            return (
              <View
                key={m.id}
                style={[styles.row, missed && styles.rowMiss]}>
                <View style={{flex: 1, paddingRight: 10}}>
                  <Text
                    style={[styles.rowTitle, missed && styles.rowTitleMiss]}
                    numberOfLines={2}>
                    {m.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {m.status} · {m.durationMinutes}m
                  </Text>
                </View>
                <View
                  style={[
                    styles.dot,
                    missed ? styles.dotMiss : styles.dotOk,
                  ]}>
                  <Text style={styles.dotText}>{missed ? '✕' : '✓'}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    content: {paddingHorizontal: 14, paddingBottom: 24, paddingTop: 12},
    heroRow: {marginBottom: 4},
    newBtn: {
      alignSelf: 'flex-start',
      marginTop: 8,
      backgroundColor: '#10b981',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
    },
    newBtnLocked: {backgroundColor: '#475569'},
    newBtnText: {color: '#fff', fontWeight: '900', fontSize: 11},
    activeCard: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 2,
      borderColor: c.borderStrong,
      marginBottom: 16,
    },
    eyebrow: {
      color: c.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    cardTitle: {color: c.text, fontSize: 18, fontWeight: '900', marginTop: 4},
    cardMeta: {color: c.textSoft, marginTop: 4, marginBottom: 8},
    link: {color: c.primary, fontWeight: '800', fontSize: 13},
    section: {
      color: c.text,
      fontWeight: '900',
      fontSize: 15,
      marginBottom: 10,
      marginTop: 8,
    },
    emptyBox: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    empty: {color: c.textMuted, fontWeight: '600'},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
    },
    rowLocked: {opacity: 0.55},
    rowMiss: {
      backgroundColor: c.dangerBg,
      borderColor: c.dangerBorder,
    },
    rowOk: {borderColor: c.successBorder},
    rank: {
      color: c.primary,
      fontSize: 10,
      fontWeight: '900',
      marginBottom: 2,
    },
    rowTitle: {color: c.text, fontWeight: '800', fontSize: 13},
    rowTitleMiss: {color: c.danger, textDecorationLine: 'line-through'},
    rowTitleLocked: {color: c.textMuted},
    rowMeta: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 3,
      textTransform: 'uppercase',
    },
    rowMark: {fontSize: 16, paddingLeft: 8},
    dot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotOk: {backgroundColor: c.success},
    dotMiss: {backgroundColor: c.danger},
    dotText: {color: '#fff', fontWeight: '900', fontSize: 12},
  });
}

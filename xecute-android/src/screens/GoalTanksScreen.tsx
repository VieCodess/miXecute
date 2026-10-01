import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {goalTankService, type GoalTank} from '../api/goalTankService';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';
import {ArenaHeader} from '../components/ArenaHeader';
import {ArenaHero} from '../components/ArenaHero';
import {GoalJarGraphic} from '../components/GoalJarGraphic';

/** Native Goal Tanks — animated jars for the Lab of Success. */
export const GoalTanksScreen: React.FC = () => {
  const navigation = useAppNav();
  const {goBack} = navigation;
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {width} = useWindowDimensions();
  const jarWidth = Math.min(160, (width - 48) / 2);

  const [tanks, setTanks] = useState<GoalTank[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [disturbedId, setDisturbedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTanks(await goalTankService.getTanks());
    } catch {
      setTanks([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsub = goalTankService.subscribe(() => {
      void load();
    });
    return unsub;
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <ArenaHeader />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={goBack} style={styles.back} activeOpacity={0.8}>
          <Text style={styles.backText}>← Home</Text>
        </TouchableOpacity>
        <ArenaHero
          title="Goal Tanks"
          copy="Animated goal jars fill as you complete missions."
          glyph="🧪"
        />

        {tanks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No tanks yet</Text>
            <Text style={styles.emptyCopy}>
              Run a brain dump from Missions (+ New) to spin up jars in your
              Lab of Success.
            </Text>
            <TouchableOpacity
              style={styles.primary}
              onPress={() => navigation.setTab('Missions')}
              activeOpacity={0.88}>
              <Text style={styles.primaryText}>GO TO MISSIONS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.jarGrid}>
            {tanks.map(tank => (
              <TouchableOpacity
                key={tank.goalId}
                style={styles.jarCell}
                activeOpacity={0.9}
                onPress={() => setDisturbedId(tank.goalId)}>
                <GoalJarGraphic
                  jar={{
                    goalId: tank.goalId,
                    goalTitle: tank.goalTitle,
                    tasksCompleted: tank.tasksCompleted,
                    tasksTotal: tank.tasksTotal,
                    status: tank.status,
                  }}
                  width={jarWidth}
                  isDisturbed={disturbedId === tank.goalId}
                  onDisturbanceEnd={() => setDisturbedId(null)}
                />
                <Text style={styles.latest} numberOfLines={2}>
                  {tank.latestTask}
                </Text>
                <Text style={styles.time}>{tank.timeSinceLastProgress}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    content: {paddingHorizontal: 14, paddingBottom: 24, paddingTop: 12},
    back: {marginBottom: 8},
    backText: {color: c.primary, fontWeight: '800', fontSize: 13},
    emptyCard: {
      backgroundColor: c.surface,
      borderRadius: 24,
      padding: 16,
      borderWidth: 2,
      borderColor: c.borderStrong,
    },
    emptyTitle: {color: c.text, fontWeight: '900', fontSize: 18},
    emptyCopy: {color: c.textSoft, marginTop: 8, fontWeight: '600', lineHeight: 20},
    primary: {
      marginTop: 14,
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
    },
    primaryText: {color: c.onPrimary, fontWeight: '900', fontSize: 12, letterSpacing: 0.6},
    jarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
      gap: 8,
    },
    jarCell: {
      width: '46%',
      alignItems: 'center',
      marginBottom: 12,
      backgroundColor: c.surface,
      borderRadius: 20,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    latest: {
      color: c.text,
      fontWeight: '700',
      fontSize: 11,
      textAlign: 'center',
      marginTop: 4,
      paddingHorizontal: 4,
    },
    time: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '700',
      marginTop: 2,
    },
  });
}

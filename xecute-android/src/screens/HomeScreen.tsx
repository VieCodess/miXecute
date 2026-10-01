import React, {useCallback, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import {missionStore, Mission} from '../api/missionStore';
import {sessionResume, ResumeState} from '../api/sessionResume';
import {contentTemplates} from '../api/contentTemplates';
import {useAppNav} from '../navigation/AppNav';
import {useTheme} from '../theme';
import type {ThemeColors} from '../theme';
import {ArenaHeader} from '../components/ArenaHeader';
import {ArenaHero} from '../components/ArenaHero';

function formatWhen(iso?: string | null) {
  if (!iso) return 'Recently';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

function remainingLabel(mission: Mission) {
  if (!mission.endsAt) return 'Open timer';
  const ms = new Date(mission.endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Time up';
  const mins = Math.ceil(ms / 60000);
  return `${mins}m left`;
}

export const HomeScreen: React.FC = () => {
  const navigation = useAppNav();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [active, setActive] = React.useState<Mission | null>(null);
  const [recent, setRecent] = React.useState<Mission[]>([]);
  const [resume, setResume] = React.useState<ResumeState | null>(null);
  const [resuming, setResuming] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [dashTitle, setDashTitle] = React.useState(
    contentTemplates.get('native_dashboard_title'),
  );
  const [dashSub, setDashSub] = React.useState(
    contentTemplates.get('native_dashboard_subhead'),
  );

  const load = useCallback(async () => {
    try {
      const [missions, resumeState] = await Promise.all([
        missionStore.list().catch(() => [] as Mission[]),
        sessionResume.detect().catch(() => null),
      ]);
      setActive(missions.find(m => m.status === 'active') || null);
      setRecent(missions.filter(m => m.status !== 'active').slice(0, 5));
      setResume(resumeState);
      void contentTemplates.refresh().then(() => {
        setDashTitle(contentTemplates.get('native_dashboard_title'));
        setDashSub(contentTemplates.get('native_dashboard_subhead'));
      });
    } catch {
      // Keep the last good dashboard visible.
    }
  }, []);

  const onResume = async () => {
    if (!resume || resuming) return;
    setResuming(true);
    try {
      await sessionResume.resume(resume.mission);
      navigation.navigate('ActiveMission', {missionId: resume.mission.id});
    } finally {
      setResuming(false);
      void load();
    }
  };

  const toggleShield = async (value: boolean) => {
    setShieldBusy(true);
    try {
      await BlockerBridge.toggleShield(value);
      setShieldOn(value);
    } catch {
      // Leave previous state.
    } finally {
      setShieldBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const firstName = user?.name?.split(' ')[0] || 'Operator';
  const completedCount = recent.filter(m => m.status === 'completed').length;
  const missedCount = recent.filter(m => m.status === 'missed').length;
  const showResume = Boolean(
    resume && (resume.needsRearm || resume.remainingMs <= 0),
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {paddingTop: insets.top + 8}]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkX}>X</Text>
          </View>
          <View style={styles.headerNameWrap}>
            <Text style={styles.greeting}>{dayGreeting()},</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
        </View>
        <View style={styles.walletChip}>
          <Text style={styles.walletLabel}>XC</Text>
          <Text style={styles.walletValue}>
            {credits == null ? '--' : Math.round(credits)}
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroHalo} />
        <View style={styles.heroTop}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>XECUTE ARENA</Text>
          </View>
          <Text style={styles.heroStatus}>{shieldOn ? 'Shield armed' : 'Shield ready'}</Text>
        </View>
        <Text style={styles.heroTitle}>{dashTitle || 'Xecution Arena'}</Text>
        <Text style={styles.heroCopy}>
          {dashSub ||
            'Your missions, XCredits, and Shield controls in one command view.'}
        </Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{active ? '1' : '0'}</Text>
            <Text style={styles.heroStatLabel}>Active</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{completedCount}</Text>
            <Text style={styles.heroStatLabel}>Wins</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{missedCount}</Text>
            <Text style={styles.heroStatLabel}>Missed</Text>
          </View>
        </View>
      </View>

      {showResume && resume ? (
        <View style={styles.resumeCard}>
          <Text style={styles.sectionEyebrow}>SESSION RESUME</Text>
          <Text style={styles.featureTitle}>{resume.mission.title}</Text>
          <Text style={styles.featureCopy}>
            {resume.remainingMs <= 0
              ? 'Timer ended while you were away. Open it to settle the mission.'
              : 'Shield dropped after an interrupt. Re-arm and continue.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => void onResume()}
            activeOpacity={0.88}
            disabled={resuming}>
            <Text style={styles.primaryBtnText}>
              {resuming
                ? 'Resuming...'
                : resume.remainingMs <= 0
                  ? 'Open to settle'
                  : 'Resume + re-arm'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : active ? (
        <View style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>ACTIVE MISSION</Text>
              <Text style={styles.activeTimer}>{remainingLabel(active)}</Text>
            </View>
            <View style={styles.livePill}>
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          </View>
          <Text style={styles.featureTitle} numberOfLines={2}>
            {active.title}
          </Text>
          <Text style={styles.featureCopy}>
            {(active.stakeType || 'streak_only').replace('_', ' ')}
          </Text>
          <TouchableOpacity
            style={[styles.ctaTile, styles.ctaSpend]}
            onPress={() => navigation.setTab('Spend')}
            activeOpacity={0.88}>
            <View style={styles.ctaTileTop}>
              <View style={[styles.ctaIcon, styles.ctaIconSpend]}>
                <Text style={styles.ctaIconTextSpend}>▣</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.ctaEyebrowSpend}>XPAUSE</Text>
                <Text style={styles.ctaTitle}>Unlock Apps</Text>
              </View>
            </View>
            <Text style={styles.ctaHint}>A lil break while you xecute.</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.activeCard}>
          <Text style={styles.sectionEyebrow}>NEXT MISSION</Text>
          <Text style={styles.featureTitle}>Start your next locked-in task</Text>
          <Text style={styles.featureCopy}>
            Pick a mission, set the stakes, and let Shield hold the line.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('MissionsMain')}
            activeOpacity={0.88}>
            <Text style={styles.primaryBtnText}>Start mission</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionCard, styles.actionEarn]}
          onPress={() =>
            active
              ? navigation.navigate('ActiveMission', {missionId: active.id})
              : navigation.navigate('MissionsMain')
          }
          activeOpacity={0.88}>
          <Text style={styles.actionGlyph}>M</Text>
          <Text style={styles.actionLabel}>Missions</Text>
          <Text style={styles.actionCopy}>Earn XCredits</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, styles.actionSpend]}
          onPress={() => navigation.navigate('ShieldHome')}
          activeOpacity={0.88}>
          <Text style={styles.actionGlyph}>S</Text>
          <Text style={styles.actionLabel}>Shield</Text>
          <Text style={styles.actionCopy}>Unlock apps</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.shieldCard, shieldOn && styles.shieldCardOn]}>
        <View style={styles.shieldIcon}>
          <Text style={styles.shieldIconText}>{shieldOn ? 'ON' : 'OFF'}</Text>
        </View>
        <View style={styles.shieldText}>
          <Text style={styles.sectionEyebrow}>ANDROID SHIELD</Text>
          <Text style={styles.shieldTitle}>
            {shieldOn ? 'Distractions are locked' : 'Arm Shield to block apps'}
          </Text>
        </View>
        <Switch
          value={shieldOn}
          onValueChange={v => void toggleShield(v)}
          disabled={shieldBusy}
          trackColor={{false: colors.border, true: 'rgba(144,16,255,0.55)'}}
          thumbColor={shieldOn ? colors.primary : '#9ca3af'}
        />
      </View>

      <View style={styles.recentCard}>
        <View style={styles.recentHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>DASHBOARD FEED</Text>
            <Text style={styles.recentHeading}>Recent Tasks</Text>
          </View>
          <Text style={styles.recentCount}>{recent.length}</Text>
        </View>
        {recent.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No finished missions yet</Text>
            <Text style={styles.emptyCopy}>
              Complete a mission and your wins will appear here.
            </Text>
          </View>
        ) : (
          recent.slice(0, 4).map(m => {
            const missed = m.status === 'missed';
            return (
              <View
                key={m.id}
                style={[styles.recentRow, missed && styles.recentRowMiss]}>
                <View style={styles.recentStatusMark}>
                  <Text style={styles.recentStatusText}>{missed ? '!' : 'OK'}</Text>
                </View>
                <View style={styles.recentBody}>
                  <Text
                    style={[styles.recentTitle, missed && styles.recentTitleMiss]}
                    numberOfLines={2}>
                    {m.title}
                  </Text>
                  <Text
                    style={[styles.recentMeta, missed && styles.recentMetaMiss]}>
                    {missed
                      ? `MISSED - ${formatWhen(m.endsAt || m.createdAt)}`
                      : `REWARD - ${m.durationMinutes}m`}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

function makeStyles(c: ThemeColors) {
  const isDark = c.mode === 'dark';
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    content: {paddingHorizontal: 14, paddingBottom: 38, flexGrow: 1},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 10,
    },
    headerLeft: {flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10},
    headerNameWrap: {flex: 1, minWidth: 0},
    brandMark: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.primary,
      shadowOpacity: 0.24,
      shadowRadius: 12,
      shadowOffset: {width: 0, height: 6},
      elevation: 3,
    },
    brandMarkX: {color: c.onPrimary, fontWeight: '900', fontSize: 18},
    greeting: {color: c.textMuted, fontSize: 12, fontWeight: '700'},
    userName: {color: c.text, fontSize: 19, fontWeight: '900'},
    walletChip: {
      minWidth: 78,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    walletLabel: {
      color: c.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    walletValue: {color: c.credits, fontWeight: '900', fontSize: 15},
    hero: {
      borderRadius: 24,
      padding: 18,
      marginBottom: 12,
      overflow: 'hidden',
      backgroundColor: c.heroVia,
      borderWidth: 1,
      borderColor: 'rgba(180,143,255,0.34)',
    },
    heroHalo: {
      position: 'absolute',
      top: -54,
      right: -34,
      width: 170,
      height: 170,
      borderRadius: 85,
      backgroundColor: 'rgba(144,16,255,0.24)',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    heroBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
    },
    heroBadgeText: {
      color: '#E9D5FF',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
    heroStatus: {color: '#C4B5FD', fontSize: 11, fontWeight: '800'},
    heroTitle: {color: '#fff', fontSize: 27, fontWeight: '900'},
    heroCopy: {
      color: c.heroCopy,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 7,
      fontWeight: '600',
    },
    heroStats: {
      marginTop: 18,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    heroStat: {flex: 1, alignItems: 'center'},
    heroStatValue: {color: '#fff', fontSize: 19, fontWeight: '900'},
    heroStatLabel: {
      color: '#C4B5FD',
      fontSize: 10,
      fontWeight: '800',
      marginTop: 2,
      textTransform: 'uppercase',
    },
    heroStatDivider: {
      width: 1,
      height: 30,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    sectionEyebrow: {
      color: c.primary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
    resumeCard: {
      backgroundColor: c.warningBg,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: c.warningBorder,
      marginBottom: 12,
    },
    activeCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: c.borderStrong,
      marginBottom: 12,
      shadowColor: '#430076',
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 14,
      shadowOffset: {width: 0, height: 7},
      elevation: isDark ? 0 : 2,
    },
    activeHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    activeTimer: {color: c.textMuted, fontSize: 12, fontWeight: '800', marginTop: 3},
    livePill: {
      backgroundColor: c.successBg,
      borderColor: c.successBorder,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    livePillText: {color: c.success, fontSize: 10, fontWeight: '900'},
    featureTitle: {color: c.text, fontSize: 20, fontWeight: '900', lineHeight: 25},
    featureCopy: {
      color: c.textSoft,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 7,
      marginBottom: 14,
      fontWeight: '600',
    },
    primaryBtn: {
      alignSelf: 'flex-start',
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingVertical: 12,
      paddingHorizontal: 18,
      minWidth: 132,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: c.onPrimary,
      fontWeight: '900',
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    actionRow: {flexDirection: 'row', gap: 10, marginBottom: 12},
    actionCard: {
      flex: 1,
      minHeight: 112,
      borderRadius: 22,
      padding: 14,
      borderWidth: 1,
      justifyContent: 'space-between',
    },
    actionEarn: {backgroundColor: c.successBg, borderColor: c.successBorder},
    actionSpend: {
      backgroundColor: isDark ? 'rgba(119,10,201,0.18)' : 'rgba(144,16,255,0.08)',
      borderColor: c.borderStrong,
    },
    actionGlyph: {
      width: 34,
      height: 34,
      borderRadius: 13,
      overflow: 'hidden',
      textAlign: 'center',
      textAlignVertical: 'center',
      color: c.onPrimary,
      backgroundColor: c.primary,
      fontWeight: '900',
      fontSize: 13,
    },
    actionLabel: {color: c.text, fontSize: 16, fontWeight: '900'},
    actionCopy: {color: c.textSoft, fontSize: 11, fontWeight: '700'},
    shieldCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
      gap: 12,
    },
    shieldCardOn: {
      borderColor: c.borderStrong,
      backgroundColor: isDark ? 'rgba(119,10,201,0.18)' : 'rgba(144,16,255,0.06)',
    },
    shieldIcon: {
      width: 42,
      height: 42,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    shieldIconText: {color: c.onPrimary, fontWeight: '900', fontSize: 10},
    shieldText: {flex: 1, minWidth: 0},
    shieldTitle: {color: c.text, fontSize: 14, fontWeight: '900', marginTop: 3},
    recentCard: {
      backgroundColor: c.surface,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#430076',
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 12,
      shadowOffset: {width: 0, height: 4},
      elevation: isDark ? 0 : 2,
    },
    recentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingBottom: 12,
      marginBottom: 10,
    },
    recentHeading: {color: c.text, fontSize: 18, fontWeight: '900', marginTop: 2},
    recentCount: {
      color: c.primary,
      fontWeight: '900',
      fontSize: 13,
      backgroundColor: isDark ? 'rgba(180,143,255,0.12)' : 'rgba(144,16,255,0.08)',
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    emptyState: {
      backgroundColor: isDark ? 'rgba(12,19,36,0.55)' : c.bg,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyTitle: {color: c.text, fontSize: 14, fontWeight: '900'},
    emptyCopy: {color: c.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4},
    recentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(12,19,36,0.55)' : c.bg,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 8,
      gap: 11,
    },
    recentRowMiss: {backgroundColor: c.dangerBg, borderColor: c.dangerBorder},
    recentStatusMark: {
      width: 34,
      height: 34,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    recentStatusText: {color: c.onPrimary, fontWeight: '900', fontSize: 10},
    recentBody: {flex: 1, minWidth: 0},
    recentTitle: {color: c.text, fontWeight: '900', fontSize: 13, lineHeight: 18},
    recentTitleMiss: {color: c.danger, textDecorationLine: 'line-through'},
    recentMeta: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
      marginTop: 3,
    },
    recentMetaMiss: {color: c.danger},
  });
}

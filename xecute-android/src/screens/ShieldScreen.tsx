import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import {BlockerBridge} from '../native/BlockerBridge';
import {PermissionDiagnostic} from '../components/PermissionDiagnostic';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';
import {ArenaHeader} from '../components/ArenaHeader';
import {ArenaHero} from '../components/ArenaHero';
import {missionStore, Mission} from '../api/missionStore';
import {APP_CONFIG} from '../config';

const LOCKED_APPS = [
  {id: 'ig', name: 'Instagram', cat: 'Social'},
  {id: 'tt', name: 'TikTok', cat: 'Social'},
  {id: 'yt', name: 'YouTube', cat: 'Watch'},
  {id: 'x', name: 'X / Twitter', cat: 'Social'},
  {id: 'rd', name: 'Reddit', cat: 'Social'},
  {id: 'nf', name: 'Netflix', cat: 'Watch'},
];

type Props = {
  onSignedOut?: () => void;
};

/** Spend tab — XPause / Unlock Apps, plus native Android Shield. */
export const ShieldScreen: React.FC<Props> = ({onSignedOut: _onSignedOut}) => {
  const navigation = useAppNav();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [shieldActive, setShieldActive] = useState(false);
  const [active, setActive] = useState<Mission | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [on, missions] = await Promise.all([
        BlockerBridge.isShieldActive().catch(() => false),
        missionStore.list().catch(() => [] as Mission[]),
      ]);
      setShieldActive(on);
      setActive(missions.find(m => m.status === 'active') || null);
    } catch {
      setShieldActive(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleShield = async (value: boolean) => {
    try {
      await BlockerBridge.toggleShield(value);
      setShieldActive(value);
    } catch (e) {
      Alert.alert(
        'Shield error',
        e instanceof Error ? e.message : 'Could not toggle shield',
      );
    }
  };

  const takeBreak = async () => {
    try {
      await BlockerBridge.requestBreak(APP_CONFIG.breakMinutes);
      Alert.alert(
        'Break active',
        `${APP_CONFIG.breakMinutes}-minute break. Blocked apps unlock until the timer ends.`,
      );
    } catch (e) {
      Alert.alert(
        'Break failed',
        e instanceof Error ? e.message : 'Could not start break',
      );
    }
  };

  const heroCopy = !active
    ? 'Nothing to pause yet. Start a mission first.'
    : shieldActive
      ? 'Still xecuting? Take five if you\'ve got the minutes.'
      : 'Arm Shield to lock distractions while this mission runs.';

  return (
    <View style={styles.root}>
      <ArenaHeader />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <ArenaHero title="XPause" copy={heroCopy} glyph="▣" />

        <View style={[styles.masterToggle, shieldActive && styles.masterToggleOn]}>
          <View style={{flex: 1, paddingRight: 12}}>
            <Text style={styles.toggleLabel}>
              {shieldActive ? 'SHIELD ACTIVE' : 'SHIELD OFF'}
            </Text>
            <Text style={styles.toggleHint}>
              {shieldActive
                ? 'Distracting apps & sites stay locked'
                : 'Turn on to enforce your blocklist'}
            </Text>
          </View>
          <Switch
            value={shieldActive}
            onValueChange={toggleShield}
            trackColor={{false: colors.border, true: 'rgba(144,16,255,0.55)'}}
            thumbColor={shieldActive ? colors.primary : '#9ca3af'}
          />
        </View>

        {!active ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>NO ACTIVE MISSION</Text>
            <Text style={styles.emptyCopy}>
              Nothing to pause yet. Start a mission first.
            </Text>
            <TouchableOpacity
              style={styles.primary}
              onPress={() => navigation.setTab('Missions')}
              activeOpacity={0.88}>
              <Text style={styles.primaryText}>START A MISSION</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.missionCard}>
            <Text style={styles.missionTitle}>{active.title}</Text>
            <Text style={styles.missionCopy}>
              Blocked while this mission is active. Burn XCredits for a short
              break.
            </Text>
            <TouchableOpacity
              style={styles.breakBtn}
              onPress={() => void takeBreak()}
              activeOpacity={0.88}>
              <Text style={styles.breakText}>BREAK</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.grid}>
          {LOCKED_APPS.map(app => (
            <View key={app.id} style={styles.appTile}>
              <Text style={styles.appName}>{app.name}</Text>
              <Text style={styles.appCat}>{app.cat}</Text>
              <Text
                style={[
                  styles.appBadge,
                  !shieldActive && styles.appBadgeOff,
                ]}>
                {shieldActive ? 'BLOCKED' : 'UNLOCKED'}
              </Text>
            </View>
          ))}
        </View>

        <PermissionDiagnostic />

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Blocklist')}
          activeOpacity={0.85}>
          <Text style={styles.buttonText}>Blocked apps</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Domains')}
          activeOpacity={0.85}>
          <Text style={styles.buttonText}>Blocked sites</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('ShieldStats')}
          activeOpacity={0.85}>
          <Text style={styles.buttonText}>Shield stats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={async () => {
            try {
              await BlockerBridge.requestDeviceAdmin();
            } catch (e) {
              Alert.alert(
                'Device admin',
                e instanceof Error ? e.message : 'Could not open device admin',
              );
            }
          }}
          activeOpacity={0.85}>
          <Text style={styles.buttonText}>Enable uninstall protection</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    content: {paddingHorizontal: 14, paddingBottom: 28, paddingTop: 12},
    masterToggle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surface,
      padding: 16,
      borderRadius: 18,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: c.border,
    },
    masterToggleOn: {
      borderColor: c.borderStrong,
      backgroundColor:
        c.mode === 'dark' ? 'rgba(119,10,201,0.18)' : 'rgba(144,16,255,0.08)',
    },
    toggleLabel: {color: c.primary, fontSize: 15, fontWeight: '800'},
    toggleHint: {color: c.textSoft, fontSize: 12, marginTop: 4},
    emptyBox: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 22,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: c.border,
      alignItems: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      color: c.text,
      fontWeight: '900',
      fontSize: 13,
      letterSpacing: 0.8,
    },
    emptyCopy: {
      color: c.textSoft,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 12,
    },
    primary: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 18,
    },
    primaryText: {color: c.onPrimary, fontWeight: '900', fontSize: 12},
    missionCard: {
      backgroundColor: c.tabBar,
      borderRadius: 22,
      padding: 16,
      borderWidth: 2,
      borderColor: '#770AC9',
      marginBottom: 14,
    },
    missionTitle: {color: '#fff', fontWeight: '900', fontSize: 16},
    missionCopy: {color: 'rgba(255,255,255,0.8)', marginTop: 6, fontSize: 12},
    breakBtn: {
      marginTop: 12,
      alignSelf: 'flex-start',
      backgroundColor: '#fbbf24',
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    breakText: {color: '#0f172a', fontWeight: '900', fontSize: 12, letterSpacing: 0.8},
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    appTile: {
      width: '31%',
      flexGrow: 1,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: c.border,
      padding: 10,
      alignItems: 'center',
      minWidth: 96,
    },
    appName: {color: c.text, fontWeight: '900', fontSize: 12, textAlign: 'center'},
    appCat: {color: c.textMuted, fontSize: 9, fontWeight: '700', marginTop: 2},
    appBadge: {
      marginTop: 8,
      fontSize: 8,
      fontWeight: '800',
      color: c.text,
      backgroundColor: 'rgba(67,0,118,0.12)',
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    appBadgeOff: {color: c.success},
    button: {
      backgroundColor: c.primary,
      paddingVertical: 15,
      paddingHorizontal: 16,
      borderRadius: 14,
      alignItems: 'center',
      marginBottom: 10,
    },
    secondaryButton: {backgroundColor: c.tabBar},
    buttonText: {color: '#fff', fontSize: 14, fontWeight: '700'},
  });
}

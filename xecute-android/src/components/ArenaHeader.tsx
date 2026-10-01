import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {creditsStore} from '../api/creditsStore';
import {sessionStore, PublicUser} from '../api/sessionStore';
import {useAppNav} from '../navigation/AppNav';
import {useTheme, type ThemeColors} from '../theme';

function dayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Sticky top chrome for Arena screens. */
export const ArenaHeader: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useAppNav();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [greeting] = useState(dayGreeting);

  const load = useCallback(async () => {
    const [u, balance] = await Promise.all([
      sessionStore.getUser(),
      creditsStore.getLocalBalance().catch(() => null),
    ]);
    setUser(u);
    setCredits(balance);
    void creditsStore.sync().then(snap => {
      if (snap) setCredits(snap.balance);
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const firstName = user?.name?.split(' ')[0] || 'Operator';

  return (
    <View style={[styles.wrap, {paddingTop: Math.max(insets.top, 8)}]}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.mark}>
            <Text style={styles.markX}>X</Text>
          </View>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.name} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.creditsChip}
          onPress={() => navigation.navigate('Paywall')}
          activeOpacity={0.85}
          accessibilityLabel="XCredits wallet">
          <Text style={styles.creditsLabel}>XC</Text>
          <Text style={styles.creditsValue}>
            {credits == null ? '—' : credits}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    left: {flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10},
    mark: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markX: {color: c.onPrimary, fontWeight: '900', fontSize: 18},
    greeting: {color: c.textMuted, fontSize: 12, fontWeight: '600'},
    name: {
      color: c.text,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: -0.3,
    },
    creditsChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surface,
      borderWidth: 2,
      borderColor: c.borderStrong,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    creditsLabel: {
      color: c.primary,
      fontWeight: '900',
      fontSize: 10,
      letterSpacing: 0.6,
    },
    creditsValue: {color: c.credits, fontWeight: '900', fontSize: 14},
  });
}

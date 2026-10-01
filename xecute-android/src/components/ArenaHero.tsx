import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme, type ThemeColors} from '../theme';

type Props = {
  title: string;
  copy: string;
  glyph?: string;
};

/** Dark purple banner used on Arena surfaces. */
export const ArenaHero: React.FC<Props> = ({
  title,
  copy,
  glyph = '⚡',
}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.hero}>
      <View style={styles.glow} />
      <View style={styles.row}>
        <View style={{flex: 1, paddingRight: 10}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.copy}>{copy}</Text>
        </View>
        <View style={styles.icon}>
          <Text style={styles.glyph}>{glyph}</Text>
        </View>
      </View>
    </View>
  );
};

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    hero: {
      borderRadius: 24,
      padding: 18,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: c.borderStrong,
      backgroundColor: c.heroVia,
    },
    glow: {
      position: 'absolute',
      top: -40,
      right: -30,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: c.heroGlow,
    },
    row: {flexDirection: 'row', alignItems: 'center'},
    title: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    copy: {
      color: c.heroCopy,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 6,
      fontWeight: '500',
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: 'rgba(144,16,255,0.22)',
      borderWidth: 1,
      borderColor: 'rgba(144,16,255,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    glyph: {fontSize: 20},
  });
}

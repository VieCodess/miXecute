import React, {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {XBossLoader} from '../components/XBossLoader';

type Props = {
  onDone: () => void;
};

/** Splash — XBoss loader with waking-up copy. */
export const SplashScreen: React.FC<Props> = ({onDone}) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.root}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <XBossLoader size={120} />
      <Text style={styles.caption}>XBoss is waking up…</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  glowA: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(229,205,255,0.55)',
  },
  glowB: {
    position: 'absolute',
    bottom: 80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(159,54,255,0.12)',
  },
  caption: {
    marginTop: 8,
    color: 'rgba(26,11,46,0.55)',
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});

import React, {useEffect, useState} from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {contentTemplates} from '../api/contentTemplates';

type Props = {
  onStart: () => void;
  /** Returning accounts — Sign In beside the Xecute mark. */
  onSignIn: () => void;
};

export const LandingScreen: React.FC<Props> = ({onStart, onSignIn}) => {
  const insets = useSafeAreaInsets();
  const [headline, setHeadline] = useState(
    contentTemplates.get('native_landing_headline'),
  );
  const [subhead, setSubhead] = useState(
    contentTemplates.get('native_landing_subhead'),
  );
  const [cta, setCta] = useState(contentTemplates.get('native_landing_cta'));
  const fade = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void contentTemplates.refresh().then(() => {
      setHeadline(contentTemplates.get('native_landing_headline'));
      setSubhead(contentTemplates.get('native_landing_subhead'));
      setCta(contentTemplates.get('native_landing_cta'));
    });
    Animated.timing(fade, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  return (
    <View
      style={[
        styles.root,
        {paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24},
      ]}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />

      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Image
            source={require('../assets/xecute-mark.png')}
            style={styles.topLogo}
            resizeMode="contain"
          />
          <Text style={styles.topBrand}>Xecute</Text>
        </View>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={onSignIn}
          activeOpacity={0.85}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={styles.signInText}>Sign In</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.center, {opacity: fade}]}>
        <Image
          source={require('../assets/xecute-mark.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.subhead}>{subhead}</Text>
        <TouchableOpacity style={styles.cta} onPress={onStart} activeOpacity={0.88}>
          <Text style={styles.ctaText}>{cta.toUpperCase()}</Text>
        </TouchableOpacity>
        <Text style={styles.foot}>Built-in Shield · no Chrome required</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F0FF',
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  topLogo: {width: 28, height: 28},
  topBrand: {
    color: '#9010FF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  signInBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(144,16,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(144,16,255,0.35)',
  },
  signInText: {
    color: '#9010FF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  glowA: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(229,205,255,0.5)',
  },
  glowB: {
    position: 'absolute',
    top: '42%',
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(159,54,255,0.1)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logo: {width: 84, height: 84, marginBottom: 8},
  headline: {
    color: '#1A0B2E',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    textAlign: 'center',
    lineHeight: 42,
  },
  subhead: {
    color: 'rgba(26,11,46,0.72)',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
    marginBottom: 8,
  },
  cta: {
    marginTop: 12,
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#9010FF',
    borderRadius: 40,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#9010FF',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1.6,
  },
  foot: {
    marginTop: 18,
    color: 'rgba(26,11,46,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
});

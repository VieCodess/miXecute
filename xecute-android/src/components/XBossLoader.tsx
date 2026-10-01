import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';

/**
 * XBoss loader — crossed bars + orbiting bubbles.
 * Bubbles are anchored at the X center (not the top of the box).
 */
export const XBossLoader: React.FC<{size?: number}> = ({size = 140}) => {
  const scale = size / 140;
  const anims = useRef(
    [0, 1, 2, 3, 4].map(() => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const durations = [5000, 6000, 4000, 7000, 5500];
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: durations[i],
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [anims]);

  const bubbleColors = [
    ['#D89BFF', '#9010FF'],
    ['#F5C2FF', '#9F36FF'],
    ['#C084FC', '#430076'],
    ['#FFC09F', '#F35B04'],
    ['#FFFFFF', '#9010FF'],
  ];

  // Shift left-biased keyframes so the orbit sits on the X crossing.
  const cx = -40 * scale;
  const cy = -12 * scale;
  const translate = (v: Animated.Value) => ({
    transform: [
      {
        translateX: v.interpolate({
          inputRange: [0, 0.1667, 0.3334, 0.5001, 0.6668, 0.8335, 1],
          outputRange: [
            cx + 0 * scale,
            cx + 80 * scale,
            cx + 40 * scale,
            cx + 40 * scale,
            cx + 40 * scale,
            cx + 40 * scale,
            cx + 0 * scale,
          ],
        }),
      },
      {
        translateY: v.interpolate({
          inputRange: [0, 0.1667, 0.3334, 0.5001, 0.6668, 0.8335, 1],
          outputRange: [
            cy + 15 * scale,
            cy + 13 * scale,
            cy + 10 * scale,
            cy + -30 * scale,
            cy + 55 * scale,
            cy + 10 * scale,
            cy + 15 * scale,
          ],
        }),
      },
    ],
  });

  const bubbleSize = 20 * scale;
  const center = size / 2 - bubbleSize / 2;

  return (
    <View style={[styles.wrap, {width: size, height: size}]}>
      <View
        style={[
          styles.bar,
          {
            width: 130 * scale,
            height: 50 * scale,
            borderRadius: 25 * scale,
            transform: [{rotate: '45deg'}],
          },
        ]}
      />
      <View
        style={[
          styles.bar,
          {
            width: 130 * scale,
            height: 50 * scale,
            borderRadius: 25 * scale,
            transform: [{rotate: '-45deg'}],
          },
        ]}
      />
      {anims.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bubble,
            {
              width: bubbleSize,
              height: bubbleSize,
              borderRadius: bubbleSize / 2,
              left: center + (i - 2) * 1.5 * scale,
              top: center,
              backgroundColor: bubbleColors[i][1],
              zIndex: i + 1,
            },
            translate(v),
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bar: {
    position: 'absolute',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  bubble: {
    position: 'absolute',
  },
});

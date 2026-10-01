import React, {useEffect, useRef, useState} from 'react';
import {Text, View, StyleSheet} from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type {GoalTank} from '../api/goalTankService';

export type GoalJarData = {
  goalId: string;
  goalTitle: string;
  tasksCompleted: number;
  tasksTotal: number;
  status: GoalTank['status'];
};

type Props = {
  jar: GoalJarData;
  width?: number;
  isDisturbed?: boolean;
  onDisturbanceEnd?: () => void;
};

type Bubble = {id: number; x: number; y: number; r: number; speed: number};

export const GoalJarGraphic: React.FC<Props> = ({
  jar,
  width = 160,
  isDisturbed = false,
  onDisturbanceEnd,
}) => {
  const targetPct = Math.min(
    100,
    Math.max(0, (jar.tasksCompleted / Math.max(1, jar.tasksTotal)) * 100),
  );
  const [currentPct, setCurrentPct] = useState(targetPct);
  const [phase, setPhase] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const lastTimeRef = useRef(Date.now());
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let frameId: number;
    const animateFill = () => {
      setCurrentPct(prev => {
        const diff = targetPct - prev;
        if (Math.abs(diff) < 0.2) return targetPct;
        return prev + diff * 0.08;
      });
      frameId = requestAnimationFrame(animateFill);
    };
    frameId = requestAnimationFrame(animateFill);
    return () => cancelAnimationFrame(frameId);
  }, [targetPct]);

  useEffect(() => {
    if (!isDisturbed) return;
    const newBubbles: Bubble[] = Array.from({length: 6}, (_, i) => ({
      id: Date.now() + i,
      x: 35 + Math.random() * 90,
      y: 170,
      r: 2 + Math.random() * 3,
      speed: 1 + Math.random() * 1.5,
    }));
    setBubbles(newBubbles);
    const timer = setTimeout(() => onDisturbanceEnd?.(), 1200);
    return () => clearTimeout(timer);
  }, [isDisturbed, onDisturbanceEnd]);

  useEffect(() => {
    const loop = () => {
      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const speed = isDisturbed ? 4.5 : 2.0;
      setPhase(p => (p + dt * speed) % (Math.PI * 2));
      setBubbles(prev =>
        prev
          .map(b => ({...b, y: b.y - b.speed * 1.8}))
          .filter(b => b.y > 60),
      );
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [isDisturbed]);

  const usableHeight = 152;
  const liquidBottomY = 194;
  const isFull =
    currentPct >= 100 || jar.tasksCompleted >= jar.tasksTotal;
  const liquidSurfaceY = isFull
    ? 42
    : liquidBottomY - (currentPct / 100) * usableHeight;
  const amplitude = isFull ? 0 : isDisturbed ? 7 : 3.2;

  const generateSinePath = () => {
    if (currentPct <= 0) return '';
    const startX = 20;
    const endX = 140;
    if (isFull) {
      return `M ${startX},${liquidBottomY} L ${startX},42 L ${endX},42 L ${endX},${liquidBottomY} Z`;
    }
    const points: string[] = [];
    for (let x = startX; x <= endX; x += 5) {
      const sinVal = Math.sin((x / 120) * Math.PI * 4 + phase);
      const y = liquidSurfaceY + sinVal * amplitude;
      points.push(`${x},${y.toFixed(1)}`);
    }
    return `M ${startX},${liquidBottomY} L ${points.join(' L ')} L ${endX},${liquidBottomY} Z`;
  };

  const gradientId = `liquid-grad-${jar.goalId}`;
  const clipId = `jar-clip-${jar.goalId}`;
  const highlightId = `glass-highlight-${jar.goalId}`;

  const badgeColor =
    jar.status === 'On Track'
      ? '#22c55e'
      : jar.status === 'In Progress'
        ? '#3b82f6'
        : '#f43f5e';

  const height = (width / 160) * 198;
  const liquidPath = generateSinePath();

  return (
    <View style={[styles.wrap, {width, height}]}>
      <Svg width={width} height={height} viewBox="0 0 160 198">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#9010FF" />
            <Stop offset="100%" stopColor="#430076" />
          </LinearGradient>
          <LinearGradient id={highlightId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <Stop offset="30%" stopColor="#ffffff" stopOpacity="0.15" />
            <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </LinearGradient>
          <ClipPath id={clipId}>
            <Path d="M 30,42 H 130 Q 138,42 138,50 V 175 Q 138,194 118,194 H 42 Q 22,194 22,175 V 50 Q 22,42 30,42 Z" />
          </ClipPath>
        </Defs>

        <Path
          d="M 30,42 H 130 Q 138,42 138,50 V 175 Q 138,194 118,194 H 42 Q 22,194 22,175 V 50 Q 22,42 30,42 Z"
          fill="rgba(255, 255, 255, 0.9)"
          stroke="rgba(144, 16, 255, 0.45)"
          strokeWidth={2.5}
        />

        <G clipPath={`url(#${clipId})`}>
          {currentPct > 0 && liquidPath ? (
            <Path d={liquidPath} fill={`url(#${gradientId})`} />
          ) : null}
          {bubbles.map(b => (
            <Circle
              key={b.id}
              cx={b.x}
              cy={b.y}
              r={b.r}
              fill="rgba(255,255,255,0.7)"
            />
          ))}
        </G>

        <SvgText
          x={80}
          y={88}
          fill="#1e293b"
          fontSize={11}
          fontWeight="900"
          textAnchor="middle">
          {jar.goalTitle.length > 28
            ? `${jar.goalTitle.slice(0, 26)}…`
            : jar.goalTitle}
        </SvgText>

        <Path
          d="M 28,48 C 28,48 36,80 36,120 C 36,160 28,180 28,180"
          stroke={`url(#${highlightId})`}
          strokeWidth={8}
          strokeLinecap="round"
          fill="none"
        />

        <Rect
          x={40}
          y={30}
          width={80}
          height={12}
          rx={3}
          fill="rgba(245, 243, 255, 0.95)"
          stroke="rgba(144, 16, 255, 0.5)"
          strokeWidth={1.5}
        />
        <Rect
          x={34}
          y={20}
          width={92}
          height={10}
          rx={4}
          fill="rgba(255, 255, 255, 0.98)"
          stroke="#7c3aed"
          strokeWidth={2}
        />

        <G transform="translate(62, 5)">
          <Rect
            x={0}
            y={0}
            width={36}
            height={32}
            rx={10}
            fill={badgeColor}
            stroke="#ffffff"
            strokeWidth={2}
          />
          <Circle cx={18} cy={8} r={2.5} fill="#ffffff" opacity={0.9} />
          <SvgText
            x={18}
            y={24}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={14}
            fontWeight="900">
            {String(jar.tasksCompleted)}
          </SvgText>
        </G>
      </Svg>
      <Text style={styles.meta} numberOfLines={1}>
        {jar.tasksCompleted}/{jar.tasksTotal} · {jar.status}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', marginBottom: 8},
  meta: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});

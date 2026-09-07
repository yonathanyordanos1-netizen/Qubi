import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable as RnPressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './ui/Button';
import { QubiMascot } from './QubiMascot';
import { QuestStatus, type Habit } from '../types/models';

/**
 * QuestPath — Duolingo-style winding quest roadmap.
 * 72px circular nodes on a wave (−64/0/+64), 4px SVG bezier connectors
 * (green for the earned trail, grey ahead), START bubble above node 0,
 * trophy checkpoint that lights gold when all quests are verified.
 * Node states: verified (gold star + green ring), active (first pending —
 * glow-pulse ring + bobbing Qubi prompt), locked (grey + lock).
 * Tapping a node opens an anchored popup with a 3D START · +50 XP CTA.
 */

const NODE = 72;
const NODE_R = 36;
const ROW_H = 100;
const TOP_PAD = 96;
const TROPHY_GAP = 62;
const BOTTOM_PAD = 62;
const WAVE = [-64, 0, 64];
const POPUP_W = 248;
const POPUP_H = 176;
const XP_PER_QUEST = 50;

export interface QuestPathProps {
  habits: Habit[];
  statusOf: (id: string) => QuestStatus;
  onStart: (habit: Habit) => void;
}

export function QuestPath({ habits, statusOf, onStart }: QuestPathProps) {
  const { isDark } = useTheme();
  const [containerW, setContainerW] = useState(() => Math.max(280, Dimensions.get('window').width - 48));
  const [popupId, setPopupId] = useState<string | null>(null);

  const n = habits.length;
  const nodeX = (i: number) => containerW / 2 + WAVE[i % WAVE.length];
  const nodeY = (i: number) => TOP_PAD + i * ROW_H + NODE_R;
  const trophyY = TOP_PAD + n * ROW_H + TROPHY_GAP;
  const totalH = trophyY + BOTTOM_PAD;

  const statuses = useMemo(() => habits.map((h) => statusOf(h.id)), [habits, statusOf]);
  const activeIdx = useMemo(() => statuses.findIndex((s) => s === QuestStatus.pending), [statuses]);
  const allDone = n > 0 && statuses.every((s) => s === QuestStatus.verified);

  const connectorColor = (i: number): string => {
    const next = statuses[i + 1];
    if (next === QuestStatus.verified) return AppColors.pathGreen;
    if (next === QuestStatus.pending && statuses[i] === QuestStatus.verified) return AppColors.pathGreen;
    return isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0';
  };

  const segments = useMemo(() => {
    const pts: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    for (let i = 0; i < n - 1; i++) {
      pts.push({ x1: nodeX(i), y1: nodeY(i), x2: nodeX(i + 1), y2: nodeY(i + 1), color: connectorColor(i) });
    }
    if (n > 0) {
      pts.push({ x1: nodeX(n - 1), y1: nodeY(n - 1), x2: containerW / 2, y2: trophyY, color: allDone ? AppColors.pathGold : (isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0') });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, containerW, statuses, allDone, isDark]);

  const activeHabit = activeIdx >= 0 && activeIdx < n ? habits[activeIdx] : null;
  const popupHabit = popupId != null ? habits.find((h) => h.id === popupId) ?? null : null;
  const popupIdx = popupHabit != null ? habits.indexOf(popupHabit) : -1;

  const handleNodeTap = (habit: Habit) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPopupId((cur) => (cur === habit.id ? null : habit.id));
  };

  return (
    <View style={{ width: '100%', height: totalH }} onLayout={(e) => setContainerW(Math.max(280, e.nativeEvent.layout.width))}>
      {/* Connector layer — 4px rounded bezier curves */}
      <Svg width={containerW} height={totalH} style={{ position: 'absolute', top: 0, left: 0 }}>
        {segments.map((s, i) => {
          const dh = s.y2 - s.y1;
          const d = `M ${s.x1} ${s.y1} C ${s.x1} ${s.y1 + dh * 0.5}, ${s.x2} ${s.y2 - dh * 0.5}, ${s.x2} ${s.y2}`;
          return <Path key={`seg-${i}`} d={d} stroke={s.color} strokeWidth={4} strokeLinecap="round" fill="none" />;
        })}
      </Svg>

      {activeIdx === 0 ? <StartBubble x={nodeX(0)} top={TOP_PAD - NODE_R - 54} /> : null}

      {habits.map((habit, i) => (
        <PathNode
          key={habit.id}
          habit={habit}
          x={nodeX(i)}
          y={nodeY(i)}
          status={statuses[i]}
          isActive={i === activeIdx}
          dark={isDark}
          onPress={() => handleNodeTap(habit)}
        />
      ))}

      {/* Qubi mascot prompt beside the ACTIVE node (bobs on the opposite side of the wave) */}
      {activeHabit != null ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: nodeX(activeIdx) + (WAVE[activeIdx % WAVE.length] <= 0 ? 54 : -94),
            top: nodeY(activeIdx) - 20,
          }}
        >
          <QubiMascot size={40} bob celebrating />
        </View>
      ) : null}

      <TrophyCheckpoint x={containerW / 2} y={trophyY} unlocked={allDone} />

      {popupHabit != null && popupIdx >= 0 ? (
        <NodePopup
          key={popupHabit.id}
          habit={popupHabit}
          nodeX={nodeX(popupIdx)}
          nodeY={nodeY(popupIdx)}
          containerW={containerW}
          status={statuses[popupIdx]}
          isNextUp={popupIdx === activeIdx}
          dark={isDark}
          onStart={(h) => {
            setPopupId(null);
            onStart(h);
          }}
        />
      ) : null}
    </View>
  );
}

/** Gentle up-down bounce wrapper */
function Bounce({ children, distance = 5, duration = 900 }: { children: React.ReactNode; distance?: number; duration?: number }) {
  const y = useSharedValue(0);
  React.useEffect(() => {
    y.value = withRepeat(withTiming(distance, { duration: duration / 2 }), -1, true);
  }, [y, distance, duration]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** "START" pill floating above the first node */
function StartBubble({ x, top }: { x: number; top: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - 44, top, width: 88, alignItems: 'center' }}>
      <Bounce distance={4} duration={850}>
        <View style={styles.startBubble}>
          <Text style={styles.startBubbleText}><Text>{'START'}</Text></Text>
        </View>
        <View style={styles.startCaret} />
      </Bounce>
    </View>
  );
}

function PathNode({
  habit, x, y, status, isActive, dark, onPress,
}: {
  habit: Habit; x: number; y: number; status: QuestStatus; isActive: boolean; dark: boolean; onPress: () => void;
}) {
  const verified = status === QuestStatus.verified;
  const locked = status === QuestStatus.pending && !isActive;

  // Glow pulse ring — active node only
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.65);
  React.useEffect(() => {
    if (!isActive) return;
    ringScale.value = withRepeat(withSpring(1.16, { damping: 14, stiffness: 60 }), -1, true);
    ringOpacity.value = withRepeat(withTiming(0.22, { duration: 900 }), -1, true);
  }, [isActive, ringScale, ringOpacity]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: isActive ? ringOpacity.value : 0,
  }));

  const pressScale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));

  const bg = verified || isActive ? '#FFFFFF' : AppColors.pathLocked;
  const ring = verified ? AppColors.pathGreen : isActive ? AppColors.primary : AppColors.pathLockedBorder;
  const edge = verified ? AppColors.pathGreenDeep : isActive ? '#C2410C' : '#C7C7C7';
  void dark;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: x - (NODE + 32) / 2, top: y - (NODE + 32) / 2 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: NODE + 32,
            height: NODE + 32,
            borderRadius: (NODE + 32) / 2,
            borderWidth: 3,
            borderColor: AppColors.primary,
            top: 0,
            left: 0,
          },
          ringStyle,
        ]}
      />
      <Animated.View style={pressStyle}>
        <RnPressable
          onPressIn={() => { pressScale.value = withSpring(0.92, { damping: 14, stiffness: 320 }); }}
          onPressOut={() => { pressScale.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
          onPress={onPress}
          style={[styles.node, { backgroundColor: bg, borderColor: ring, borderBottomColor: edge, opacity: locked ? 0.92 : 1 }]}
          accessibilityLabel={habit.name}
          accessibilityRole="button"
        >
          {verified ? (
            <>
              <Text style={{ fontSize: 30 }}><Text>{'⭐'}</Text></Text>
              <View style={styles.nodeCheck}>
                <Ionicons name="checkmark" size={11} color="#FFFFFF" />
              </View>
              <View style={styles.nodeCrown}>
                <Text style={{ fontSize: 10 }}><Text>{'👑'}</Text></Text>
              </View>
            </>
          ) : locked ? (
            <Ionicons name="lock-closed" size={26} color={AppColors.pathLockedInk} />
          ) : (
            <Text style={{ fontSize: 30 }}><Text>{habit.emoji}</Text></Text>
          )}
        </RnPressable>
      </Animated.View>
    </View>
  );
}

function TrophyCheckpoint({ x, y, unlocked }: { x: number; y: number; unlocked: boolean }) {
  const pop = useSharedValue(1);
  React.useEffect(() => {
    if (unlocked) {
      pop.value = withSpring(1.18, { damping: 9, stiffness: 200 }, () => {
        pop.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
    }
  }, [unlocked, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - 46, top: y - 46 }}>
      <Animated.View style={popStyle}>
        <View
          style={[
            styles.trophy,
            unlocked
              ? { backgroundColor: AppColors.pathGold, borderColor: AppColors.pathGold, borderBottomColor: AppColors.pathGoldDeep }
              : { backgroundColor: AppColors.pathLocked, borderColor: AppColors.pathLockedBorder, borderBottomColor: '#C7C7C7' },
          ]}
        >
          <Ionicons name="trophy" size={34} color={unlocked ? '#FFFFFF' : AppColors.pathLockedInk} />
        </View>
      </Animated.View>
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <Text style={[styles.trophyLabel, { color: unlocked ? AppColors.pathGoldDeep : AppColors.pathLockedInk }]}>
          <Text>{unlocked ? 'UNIT COMPLETE!' : 'CHECKPOINT'}</Text>
        </Text>
      </View>
    </View>
  );
}

/** Anchored popup card with caret — flipped below the node when there is no headroom */
function NodePopup({
  habit, nodeX, nodeY, containerW, status, isNextUp, dark, onStart,
}: {
  habit: Habit; nodeX: number; nodeY: number; containerW: number;
  status: QuestStatus; isNextUp: boolean; dark: boolean;
  onStart: (habit: Habit) => void;
}) {
  const verified = status === QuestStatus.verified;
  const locked = !verified && !isNextUp;

  const above = nodeY - NODE_R - POPUP_H - 20 >= 0;
  const left = Math.min(Math.max(nodeX - POPUP_W / 2, 8), Math.max(8, containerW - POPUP_W - 8));
  const top = above ? nodeY - NODE_R - POPUP_H - 16 : nodeY + NODE_R + 16;
  const popupBg = dark ? '#161E2E' : '#FFFFFF';
  const popupBorder = dark ? 'rgba(255,255,255,0.10)' : '#E2E8F0';

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      style={[styles.popup, { left, top, width: POPUP_W, backgroundColor: popupBg, borderColor: popupBorder }]}
    >
      {/* Caret — rotated square, two visible edges match the popup border */}
      <View
        style={[
          styles.popupCaret,
          above
            ? { bottom: -8, borderRightWidth: 2, borderBottomWidth: 2, borderColor: popupBorder, backgroundColor: popupBg }
            : { top: -8, borderLeftWidth: 2, borderTopWidth: 2, borderColor: popupBorder, backgroundColor: popupBg },
        ]}
      />
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.popupEmoji, { backgroundColor: withAlpha(AppColors.primary, 0.1) }]}>
          {locked ? (
            <Ionicons name="lock-closed" size={22} color={AppColors.pathLockedInk} />
          ) : (
            <Text style={{ fontSize: 26 }}><Text>{habit.emoji}</Text></Text>
          )}
        </View>
        <View style={{ height: 8 }} />
        <Text style={[styles.popupTitle, { color: dark ? '#F8FAFC' : AppColors.ink }]} numberOfLines={1}>
          <Text>{habit.name}</Text>
        </Text>
        <View style={{ height: 6 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.popupChip, { backgroundColor: withAlpha(AppColors.sky, 0.12) }]}>
            <Text style={{ fontSize: 10 }}><Text>{'⏰'}</Text></Text>
            <Text style={[styles.popupChipText, { color: AppColors.skyDeep }]}><Text>{habit.time}</Text></Text>
          </View>
          <View style={[styles.popupChip, { backgroundColor: withAlpha(AppColors.pathGreen, 0.14) }]}>
            <Text style={{ fontSize: 10 }}><Text>{'✨'}</Text></Text>
            <Text style={[styles.popupChipText, { color: AppColors.pathGreenDeep }]}><Text>{`+${XP_PER_QUEST} XP`}</Text></Text>
          </View>
        </View>
        <View style={{ height: 12 }} />
        {verified ? (
          <Button label="COMPLETED" variant="success" size="md" disabled />
        ) : locked ? (
          <>
            <Button label="LOCKED" variant="secondary" size="md" disabled />
            <View style={{ height: 8 }} />
            <Text style={[styles.popupHint, { color: dark ? '#94A3B8' : AppColors.muted }]}>
              <Text>{'Complete the previous quest to unlock!'}</Text>
            </Text>
          </>
        ) : (
          <Button label="START" variant="primary" size="md" onPress={() => onStart(habit)} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE_R,
    borderWidth: 3,
    borderBottomWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  nodeCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: AppColors.pathGreen,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCrown: {
    position: 'absolute',
    top: -4,
    left: -2,
  },
  startBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderBottomColor: '#CBD5E1',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  startBubbleText: {
    fontSize: 12,
    fontFamily: fontFamilyFor('w800'),
    color: AppColors.ink,
    letterSpacing: 0.8,
  },
  startCaret: {
    position: 'absolute',
    bottom: -5,
    width: 10,
    height: 10,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#E2E8F0',
    transform: [{ rotate: '45deg' }],
    alignSelf: 'center',
  },
  trophy: {
    width: 92,
    height: 92,
    borderRadius: 30,
    borderWidth: 3,
    borderBottomWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  trophyLabel: {
    fontSize: 11,
    fontFamily: fontFamilyFor('w800'),
    letterSpacing: 0.6,
  },
  popup: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 2,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 30,
  },
  popupCaret: {
    position: 'absolute',
    left: '50%',
    marginLeft: -8,
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
  },
  popupEmoji: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupTitle: {
    fontSize: 15,
    fontFamily: fontFamilyFor('w800'),
    letterSpacing: -0.2,
    maxWidth: POPUP_W - 40,
  },
  popupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  popupChipText: {
    fontSize: 11,
    fontFamily: fontFamilyFor('w700'),
  },
  popupHint: {
    fontSize: 11,
    fontFamily: fontFamilyFor('w600'),
    textAlign: 'center',
  },
});

export default QuestPath;
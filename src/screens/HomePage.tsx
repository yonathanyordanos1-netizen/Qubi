import { useState, useEffect, useMemo, useRef } from 'react';
import { Pressable as RnPressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import Animated, { useAnimatedStyle, useAnimatedProps, useSharedValue, withSpring, withTiming, interpolateColor } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { Pressable } from '../components/Pressable';
import { QubiMascot } from '../components/QubiMascot';
import { BarChartWidget } from '../components/BarChartWidget';
import { selectCompletedCount, selectHabits, selectStatusOf, selectTodayIndex, selectWeeklyXpBars, useAppStore } from '../state/appStore';
import { QuestStatus, type Habit } from '../types/models';
import { useNav } from './navContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QubiHeaderLogo } from '../components/ui/QubiHeaderLogo';
import { QuestPath } from '../components/QuestPath';
import { SupabaseServiceInstance } from '../services/supabase';

/**
 * HomePage — Duolingo-inspired dashboard in the Qubi theme.
 * Warm cream canvas (#FFF7ED), chunky white cards with 2px ink borders and
 * hard offset shadows, quest-orange CTAs with 3D bottom edges.
 * Sections: sticky header → streak hero (flame + week chain) → daily-goal
 * XP ring → bonus quests → winding quest path → weekly XP chart.
 */

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_CHAIN = ['Mo', 'Tu', 'We', 'Th', 'Fr'] as const;
const CATEGORY_EMOJI: Record<string, string> = { Fitness: '🏋️', Intellect: '🧠', Discipline: '🧘', Wellness: '🧘', Learning: '📚', Chores: '🧹', Focus: '🧘' };
const QUEST_XP = 50;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ── Duolingo week chain — connected ✓ coins for Mo–Fr ────────────────────── */

function WeekChain({ week, todayIdx }: { week: boolean[]; todayIdx: number }) {
  return (
    <View style={styles.chainRow}>
      {WEEK_CHAIN.map((label, i) => {
        const done = week[i] === true;
        const isToday = i === todayIdx;
        return (
          <View key={`${label}-${i}`} style={styles.chainCell}>
            <Text style={[styles.chainDay, done && styles.chainDayDone]}><Text>{label}</Text></Text>
            <View style={[styles.chainDot, done && styles.chainDotDone, isToday && !done && styles.chainDotToday]}>
              {done ? <Ionicons name="checkmark" size={13} color="#F97316" /> : null}
            </View>
            {i < WEEK_CHAIN.length - 1 ? (
              <View style={[styles.chainLink, (done || week[i + 1] === true) && styles.chainLinkDone]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ── Daily goal ring — chunky animated XP ring ────────────────────────────── */

function QubiGoalRing({ progress, xp, goal, size = 190 }: { progress: number; xp: number; goal: number; size?: number }) {
  const { isDark } = useTheme();
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const bg = isDark ? '#2A354B' : '#F1F5F9';

  const dashOffset = useSharedValue(c);
  useEffect(() => {
    dashOffset.value = withTiming(c * (1 - clamped), { duration: 1200 });
  }, [clamped, c, dashOffset]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: dashOffset.value }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={bg} strokeWidth={16} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={AppColors.primary} strokeWidth={16} fill="none" strokeLinecap="round" strokeDasharray={`${c}`} animatedProps={animatedProps} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={styles.ringCenter}>
        <QubiMascot size={52} />
        <View style={{ height: 6 }} />
        <Text style={[styles.ringXp, { color: isDark ? '#F8FAFC' : AppColors.ink }]}><Text>{`${xp}`}</Text></Text>
        <Text style={[styles.ringGoal, { color: isDark ? '#94A3B8' : AppColors.muted }]}><Text>{`/ ${goal} XP`}</Text></Text>
      </View>
    </View>
  );
}

/** Floating "+50 XP" chip on verified quests */
function FloatingXp({ visible }: { visible: boolean }) {
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      y.value = 0; opacity.value = 1;
      y.value = withTiming(-42, { duration: 650 });
      opacity.value = withTiming(0, { duration: 650 });
    }
  }, [visible, y, opacity]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: opacity.value }));
  if (!visible) return null;
  return <Animated.View style={[{ position: 'absolute', right: 14, top: 8, backgroundColor: AppColors.success, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }, style]}><Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 11, color: '#FFFFFF' }}><Text>+50 XP ✨</Text></Text></Animated.View>;
}

/* ── Chunky Duolingo card primitives ──────────────────────────────────────── */

function DuoCard({ children, style, isDark, glassEdge, pad = 16 }: { children: React.ReactNode; style?: object; isDark: boolean; glassEdge: string; pad?: number }) {
  return (
    <View
      style={[
        styles.duoCard,
        { padding: pad, borderColor: isDark ? glassEdge : '#000000', backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** 3D tactile pill button — press flattens the bottom edge (Duolingo spec) */
export function ChunkyButton({ label, onPress, variant = 'orange' }: { label: string; onPress?: () => void; variant?: 'orange' | 'green' | 'ghost' }) {
  const y = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const palette = variant === 'green' ? { bg: AppColors.pathGreen, edge: AppColors.pathGreenDeep } : variant === 'ghost' ? { bg: '#FFFFFF', edge: '#CBD5E1' } : { bg: AppColors.primary, edge: '#C2410C' };
  const ink = variant === 'ghost' ? AppColors.ink : '#FFFFFF';
  return (
    <Pressable
      onTap={onPress}
      scale={1}
    >
      <Animated.View
        style={[{ borderRadius: 16 }, style]}
      >
        <View
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => { y.value = withSpring(4, { damping: 18, stiffness: 420 }); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
          onResponderRelease={() => { y.value = withSpring(0, { damping: 16, stiffness: 360 }); }}
          style={[styles.chunkyBtnShadow, { backgroundColor: palette.edge }]}
        >
          <View style={[styles.chunkyBtnFront, { backgroundColor: palette.bg }]}>
            <Text style={[styles.chunkyBtnText, { color: ink }]}><Text>{label}</Text></Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────────── */

export function HomePage() {
  const { isDark, colors } = useTheme();
  const nav = useNav() as any;
  const insets = useSafeAreaInsets();
  const habits = useAppStore(selectHabits);
  const xp = useAppStore((s) => s.xp);
  const streak = useAppStore((s) => s.streak);
  const displayName = useAppStore((s) => s.displayName);
  const firstName = (displayName.split(' ')[0] ?? displayName).trim();
  const targetQuestCount = useAppStore((s) => s.targetQuestCount);
  const completedCount = useAppStore(selectCompletedCount);
  const weeklyBars = useAppStore(selectWeeklyXpBars);
  const todayIndex = selectTodayIndex();
  const statusOf = (id: string) => selectStatusOf(useAppStore.getState(), id, todayIndex);
  const verifiedToday = habits.filter((h) => statusOf(h.id) === QuestStatus.verified).length;
  const todayXp = verifiedToday * QUEST_XP;
  const dailyGoalXp = Math.max(150, targetQuestCount * 50);
  const progress = Math.min(1, todayXp / dailyGoalXp);

  // Week chain: last 5 days ending today (Mo–Fr style labels are decorative)
  const weekChain = useMemo(() => {
    const flags = [false, false, false, false, false];
    for (let i = 0; i < 5; i++) {
      const dayIdx = Math.max(0, todayIndex - (4 - i));
      flags[i] = dayIdx < todayIndex
        ? habits.some((h) => selectStatusOf(useAppStore.getState(), h.id, dayIdx) === QuestStatus.verified)
        : verifiedToday > 0;
    }
    return flags;
  }, [habits, todayIndex, verifiedToday]);

  const [pendingCount, setPendingCount] = useState(3);
  useEffect(() => {
    void (async () => {
      try { const rows = await SupabaseServiceInstance.getFriendRequests(); setPendingCount(rows.length); } catch {}
    })();
  }, []);

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? colors.canvas : '#FFF7ED' }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 150, paddingTop: insets.top }}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* Top Header — squircle mascot avatar, 🔥 streak badge, ⭐ total XP badge */}
        <QubiHeaderLogo
          streak={streak}
          xp={xp}
          onAvatarPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); nav.openQubi(); }}
          right={
            <RnPressable
              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); nav.openFriends?.() ?? nav.toast('Friends'); }}
              style={({ pressed }) => [styles.friendsLauncher, { backgroundColor: colors.card, borderColor: colors.glassEdge }, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="people-outline" size={20} color={colors.ink} />
              {pendingCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}><Text>{`${Math.min(pendingCount, 9)}`}</Text></Text></View> : null}
            </RnPressable>
          }
        />

        {/* ── Streak hero — mirrors the live Home Screen widget states ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <View
            style={[
              styles.streakHero,
              streak === 0
                ? styles.streakHeroPurple
                : verifiedToday === 0
                  ? styles.streakHeroRisk
                  : streak >= 7
                    ? styles.streakHeroFire
                    : styles.streakHeroBlue,
            ]}
          >
            <View style={styles.streakHeroLeft}>
              <View style={styles.streakHeadRow}>
                <Text style={{ fontSize: 22 }}><Text>{'🔥'}</Text></Text>
                <Text style={styles.streakHeadDays}><Text>{`${streak} ${streak === 1 ? 'Day' : 'Days'}`}</Text></Text>
              </View>
              <Text style={styles.streakHeadStatus}>
                <Text>
                  {streak === 0
                    ? 'Let\u2019s flex that brain!'
                    : verifiedToday === 0
                      ? 'Houston, we have a problem!'
                      : streak < 7
                        ? 'Building the habit!'
                        : 'It\u2019s a bird, it\u2019s a plane! IT\u2019S QUBI!'}
                </Text>
              </Text>
              <View style={{ height: 12 }} />
              <WeekChain week={weekChain} todayIdx={4} />
            </View>
            <View style={styles.streakHeroMascot}>
              <QubiMascot size={72} celebrating={verifiedToday > 0} bob />
            </View>
          </View>
        </View>

        {/* ── Daily Goal Ring — bold circular XP ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <DuoCard isDark={isDark} glassEdge={colors.glassEdge} pad={20}>
            <Text style={styles.goalLabel}><Text>DAILY GOAL</Text></Text>
            <View style={{ height: 14 }} />
            <QubiGoalRing progress={progress} xp={todayXp} goal={dailyGoalXp} />
            <View style={{ height: 14 }} />
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
              <View style={[styles.miniStat, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC', borderColor: colors.glassEdge }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 14, color: colors.ink }}><Text>{`${verifiedToday}/${habits.length}`}</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize: 11, color: colors.muted }}><Text>done</Text></Text>
              </View>
              <View style={[styles.miniStat, { backgroundColor: withAlpha(AppColors.primary, 0.1), borderColor: withAlpha(AppColors.primary, 0.18) }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 14, color: AppColors.primary }}><Text>{`${Math.max(0, dailyGoalXp - todayXp)} XP`}</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize: 11, color: AppColors.primary }}><Text>to go</Text></Text>
              </View>
            </View>
          </DuoCard>
        </View>

        {/* ── Bonus Quest cards ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 14, gap: 10 }}>
          <DuoCard isDark={isDark} glassEdge={colors.glassEdge} pad={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: withAlpha(AppColors.sky, 0.14), borderWidth: 2, borderColor: isDark ? colors.glassEdge : '#00000022', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="heart" size={18} color={AppColors.sky} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 13, color: colors.ink }}><Text>Bonus Quest • HealthKit</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize: 12, color: colors.muted }}><Text>Walk 2,000 steps → +30 XP</Text></Text>
              </View>
              <View style={styles.xpPillOrange}><Text style={styles.xpPillOrangeText}><Text>+30 XP</Text></Text></View>
            </View>
          </DuoCard>
          <DuoCard isDark={isDark} glassEdge={colors.glassEdge} pad={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: withAlpha(AppColors.primary, 0.12), borderWidth: 2, borderColor: isDark ? colors.glassEdge : '#00000022', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="calendar-outline" size={18} color={AppColors.primary} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 13, color: colors.ink }}><Text>Free Window • 45m at 2pm</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize: 12, color: colors.muted }}><Text>Suggested: 20-min Quick Workout +40 XP</Text></Text>
              </View>
              <Pressable onTap={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); nav.toast('Quest scheduled'); }} scale={0.97}>
                <View style={styles.schedulePill}><Text style={styles.schedulePillText}><Text>Schedule</Text></Text></View>
              </Pressable>
            </View>
          </DuoCard>
        </View>

        {/* ── Today's Quests — winding roadmap ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}><Text>Today&apos;s Quests</Text></Text>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          {habits.length === 0 ? (
            <DuoCard isDark={isDark} glassEdge={colors.glassEdge} pad={20}>
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <QubiMascot size={64} celebrating />
                <View style={{ height: 10 }} />
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 16, color: colors.ink }}><Text>No Quests Yet!</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize: 13, color: colors.muted }}><Text>Ask Qubi to build your routine</Text></Text>
              </View>
            </DuoCard>
          ) : (
            <QuestPath
              habits={habits}
              statusOf={statusOf}
              onStart={(habit) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                nav.showProof(habit);
              }}
            />
          )}
        </View>

        {/* ── Daily Goal bar — chunky Duolingo progress ── */}
        {habits.length > 0 ? (
          <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
            <DuoCard isDark={isDark} glassEdge={colors.glassEdge}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 15, color: colors.ink }}><Text>Daily Goal</Text></Text>
                <View style={styles.flex1} />
                <View style={styles.goalChip}><Text style={styles.goalChipText}><Text>{`+${QUEST_XP} XP per quest`}</Text></Text></View>
              </View>
              <View style={{ height: 16 }} />
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
                <View style={[styles.barGloss, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <View style={{ height: 8 }} />
              <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize: 11, color: colors.muted }}><Text>{`${todayXp} / ${dailyGoalXp} XP earned today`}</Text></Text>
            </DuoCard>
          </View>
        ) : null}

        {/* ── This Week — XP bars ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <DuoCard isDark={isDark} glassEdge={colors.glassEdge}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 15, color: colors.ink }}><Text>This Week</Text></Text>
              <View style={styles.flex1} />
              <View style={styles.verifiedChip}><Text style={styles.verifiedChipText}><Text>{`${completedCount} verified`}</Text></Text></View>
            </View>
            <View style={{ height: 14 }} />
            <BarChartWidget values={weeklyBars} labels={WEEK_LABELS} activeIndex={todayIndex} height={150} />
          </DuoCard>
        </View>
      </ScrollView>
    </View>
  );
}

/* ── Legacy task card (kept for API compat, no longer rendered) ───────────── */

function ChunkyTaskCard({ habit, status, onFloating, isFloating }: { habit: Habit; status: QuestStatus; onFloating: () => void; isFloating: boolean }) {
  const { colors, isDark } = useTheme();
  const nav = useNav();
  const verified = status === QuestStatus.verified;
  const wasVerified = useRef(verified);
  const bgFlash = useSharedValue(0);

  const nodeScale = useSharedValue(1);
  const nodeStyle = useAnimatedStyle(() => ({ transform: [{ scale: nodeScale.value }] }));

  useEffect(() => {
    if (verified && !wasVerified.current) {
      bgFlash.value = withTiming(1, { duration: 150 }, () => {
        bgFlash.value = withTiming(0, { duration: 800 });
      });
      nodeScale.value = withSpring(1.28, { damping: 9, stiffness: 220 }, () => {
        nodeScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
    }
    wasVerified.current = verified;
  }, [verified, bgFlash, nodeScale]);

  const scale = useSharedValue(1);
  const bgStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const cardBgStyle = useAnimatedStyle(() => {
    const defaultColor = verified ? (isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5') : colors.card;
    return {
      backgroundColor: bgFlash.value > 0
        ? interpolateColor(bgFlash.value, [0, 1], [defaultColor, '#10B981'])
        : defaultColor,
    };
  });

  const handlePress = () => {
    if (verified) { nav.toast(`${habit.name} already verified`); return; }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onFloating();
    nav.showProof(habit);
  };
  const emoji = CATEGORY_EMOJI[habit.category] ?? '✅';
  void emoji;
  return (
    <Animated.View style={bgStyle}>
      <Pressable onTap={handlePress} scale={1}>
        <Animated.View style={[styles.taskCard, verified ? { borderColor: withAlpha(AppColors.success, 0.22), borderWidth: 1.5 } : { borderColor: colors.glassEdge, borderWidth: 1 }, cardBgStyle]}>
          <FloatingXp visible={isFloating} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.flex1}>
              <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor('w800'), fontSize: 15, letterSpacing: -0.2, color: verified ? AppColors.success : colors.ink, textDecorationLine: verified ? 'line-through' : 'none' }}><Text>{habit.name}</Text></Text>
            </View>
            <Animated.View style={nodeStyle}>
              <View style={{ backgroundColor: verified ? withAlpha(AppColors.success, 0.14) : withAlpha(AppColors.primary, 0.12), paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 11, color: verified ? AppColors.success : AppColors.primary }}><Text>+50 XP</Text></Text>
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

void ChunkyTaskCard;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },

  /* Header extras */
  friendsLauncher: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 2, height: 2 }, elevation: 3 },
  badge: { position: 'absolute', top: -5, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  badgeText: { color: '#FFF', fontSize: 10, fontFamily: fontFamilyFor('w800') },

  /* Streak hero — Duolingo widget card */
  streakHero: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 24, padding: 18, borderWidth: 2.5, borderColor: '#000000',
    shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 4, height: 4 }, elevation: 5,
  },
  streakHeroFire: { backgroundColor: '#F97316' },
  streakHeroBlue: { backgroundColor: '#1CB0F6' },
  streakHeroPurple: { backgroundColor: '#8B5CF6' },
  streakHeroRisk: { backgroundColor: '#B91C1C' },
  streakHeroLeft: { flex: 1 },
  streakHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  streakHeadDays: { fontSize: 26, fontFamily: fontFamilyFor('w900'), color: '#FFFFFF', letterSpacing: -0.8 },
  streakHeadStatus: { fontSize: 12.5, fontFamily: fontFamilyFor('w600'), color: 'rgba(255,255,255,0.92)', marginTop: 3 },
  streakHeroMascot: { marginLeft: 10 },

  /* Week chain */
  chainRow: { flexDirection: 'row' },
  chainCell: { alignItems: 'center' },
  chainDay: { fontSize: 10.5, fontFamily: fontFamilyFor('w700'), color: 'rgba(255,255,255,0.75)', marginBottom: 5 },
  chainDayDone: { color: '#FFFFFF' },
  chainDot: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.32)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  chainDotDone: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  chainDotToday: { borderColor: '#FFFFFF', borderStyle: 'dashed' },
  chainLink: { position: 'absolute', top: 30, left: '50%', marginLeft: 5, width: 12, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  chainLinkDone: { backgroundColor: 'rgba(255,255,255,0.75)' },

  /* Daily goal */
  goalLabel: { fontFamily: fontFamilyFor('w800'), fontSize: 13, letterSpacing: 1.4, color: colorsSafe().muted, textAlign: 'center' },
  ringCenter: { alignItems: 'center' },
  ringXp: { fontFamily: fontFamilyFor('w800'), fontSize: 26, letterSpacing: -1 },
  ringGoal: { fontFamily: fontFamilyFor('w700'), fontSize: 11, letterSpacing: 1 },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },

  /* Pills & chips */
  xpPillOrange: { backgroundColor: AppColors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 2, borderColor: isDarkSafe() ? 'transparent' : '#000000' },
  xpPillOrangeText: { fontFamily: fontFamilyFor('w800'), fontSize: 11, color: '#FFF' },
  schedulePill: { backgroundColor: AppColors.ink, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  schedulePillText: { fontFamily: fontFamilyFor('w700'), fontSize: 11, color: '#FFF' },
  goalChip: { backgroundColor: withAlpha(AppColors.pathGreen, 0.14), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  goalChipText: { fontFamily: fontFamilyFor('w800'), fontSize: 11, color: AppColors.pathGreenDeep },
  verifiedChip: { backgroundColor: withAlpha(AppColors.success, 0.12), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  verifiedChipText: { fontFamily: fontFamilyFor('w700'), fontSize: 11, color: AppColors.success },

  /* Progress bar */
  barTrack: { width: '100%', height: 18, borderRadius: 9, backgroundColor: '#E2E8F0', borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: AppColors.primary, borderRadius: 7, borderBottomWidth: 3, borderBottomColor: '#C2410C' },
  barGloss: { position: 'absolute', top: 3, height: 3, marginLeft: 8, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 99 },

  /* Sections */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontFamily: fontFamilyFor('w800'), letterSpacing: -0.3 },

  /* Chunky card + button primitives */
  duoCard: {
    borderRadius: 22, borderWidth: 2.5,
    shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 4,
  },
  chunkyBtnShadow: { borderRadius: 16, overflow: 'hidden' },
  chunkyBtnFront: { height: 50, borderRadius: 16, marginBottom: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  chunkyBtnText: { fontFamily: fontFamilyFor('w800'), fontSize: 15, letterSpacing: -0.2 },

  /* Legacy task card */
  taskCard: { borderRadius: 24, padding: 14, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

/** Legacy pill button (kept for API compat — used by TasksPage empty state) */
export function PrimaryPillButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onTap={onPress} scale={0.97}>
      <View style={{ backgroundColor: AppColors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, borderWidth: 2, borderColor: '#000000', alignItems: 'center', shadowColor: '#000', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 2, height: 2 }, elevation: 3 }}>
        <Text style={{ fontFamily: fontFamilyFor('w800'), color: '#FFF' }}><Text>{label}</Text></Text>
      </View>
    </Pressable>
  );
}

/** Tiny helpers so StyleSheet.create can reference theme constants safely. */
function colorsSafe() { return { muted: AppColors.muted }; }
function isDarkSafe() { return false; }

import { useState, useEffect, useMemo, useRef } from 'react';
import { Pressable as RnPressable, Platform, StyleSheet, Text, View, ScrollView } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming, runOnJS, interpolateColor, useAnimatedProps } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { AppColors, withAlpha } from '../theme/colors';
import { AppSpacing, Shadow } from '../theme/spacing';
import { fontFamilyFor } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { QubiMascot } from '../components/QubiMascot';
import { BarChartWidget } from '../components/BarChartWidget';
import { SquircleCard } from '../components/SquircleCard';
import { selectCompletedCount, selectHabits, selectStatusOf, selectTodayIndex, selectWeeklyXpBars, useAppStore } from '../state/appStore';
import { QuestStatus, type Habit } from '../types/models';
import { useNav } from './navContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QubiHeaderLogo } from '../components/ui/QubiHeaderLogo';
import { QuestPath } from '../components/QuestPath';
import { QuestCompleteOverlay } from '../components/QuestCompleteOverlay';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SupabaseServiceInstance } from '../services/supabase';

const WEEK_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const CATEGORY_COLORS: Record<string,string> = { Fitness:'#F97316', Intellect:'#0EA5E9', Discipline:'#10B981', Wellness:'#0EA5E9', Learning:'#0EA5E9', Chores:'#64748B', Focus:'#0EA5E9' };
const CATEGORY_EMOJI: Record<string,string> = { Fitness:'🏋️', Intellect:'🧠', Discipline:'🧘', Wellness:'🧘', Learning:'📚', Chores:'🧹', Focus:'🧘' };
const QUEST_XP = 50;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function QubiGoalRing({ progress, xp, goal, size=200 }: { progress:number; xp:number; goal:number; size?:number }) {
  const { isDark } = useTheme();
  const r = (size - 16)/2;
  const c = 2*Math.PI*r;
  const clamped = Math.max(0, Math.min(1, progress));
  const bg = isDark ? '#2A354B' : '#F1F5F9';
  
  const dashOffset = useSharedValue(c);
  useEffect(() => {
    dashOffset.value = withTiming(c * (1 - clamped), { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [clamped, c, dashOffset]);
  
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const isHigh = clamped > 0.8;

  return (
    <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
      {isHigh && (
        <View style={{ position: 'absolute', width: size*0.9, height: size*0.9, borderRadius: size*0.45, backgroundColor: withAlpha(AppColors.primary, 0.25), filter: 'blur(20px)' }} />
      )}
      <Svg width={size} height={size} style={{ position:'absolute' }}>
        <Circle cx={size/2} cy={size/2} r={r} stroke={bg} strokeWidth={14} fill="none" />
        <AnimatedCircle cx={size/2} cy={size/2} r={r} stroke={AppColors.primary} strokeWidth={14} fill="none" strokeLinecap="round" strokeDasharray={`${c}`} animatedProps={animatedProps} transform={`rotate(-90 ${size/2} ${size/2})`} />
      </Svg>
      <View style={{ alignItems:'center' }}>
        <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:28, letterSpacing:-1, color: isDark ? '#F8FAFC' : AppColors.ink }}><Text>{`${xp}`}</Text></Text>
        <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize:12, letterSpacing:1, color: isDark ? '#94A3B8' : AppColors.muted }}><Text>{`/ ${goal} XP`}</Text></Text>
        <View style={{ height:4 }} />
        <View style={{ backgroundColor: withAlpha(AppColors.primary,0.12), paddingHorizontal:10, paddingVertical:4, borderRadius:999 }}>
          <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:11, color: AppColors.primary }}><Text>{`${Math.round(clamped*100)}% TODAY`}</Text></Text>
        </View>
      </View>
    </View>
  );
}

function FloatingXp({ visible }: { visible:boolean }) {
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  useEffect(()=>{ if(visible){ y.value=0; opacity.value=1; y.value = withTiming(-42, {duration:650, easing:Easing.out(Easing.cubic)}); opacity.value = withTiming(0, {duration:650}); } },[visible, y, opacity]);
  const style = useAnimatedStyle(()=>({ transform:[{translateY:y.value}], opacity: opacity.value }));
  if(!visible) return null;
  return <Animated.View style={[{ position:'absolute', right:14, top:8, backgroundColor: AppColors.success, paddingHorizontal:8, paddingVertical:4, borderRadius:999 }, style]}><Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:11, color:'#FFFFFF' }}><Text>+50 XP ✨</Text></Text></Animated.View>;
}

export function HomePage() {
  const { isDark, colors } = useTheme();
  const nav = useNav() as any;
  const habits = useAppStore(selectHabits);
  const xp = useAppStore(s=>s.xp);
  const streak = useAppStore(s=>s.streak);
  const targetQuestCount = useAppStore(s=>s.targetQuestCount);
  const completedCount = useAppStore(selectCompletedCount);
  const weeklyBars = useAppStore(selectWeeklyXpBars);
  const todayIndex = selectTodayIndex();
  const statusOf = (id:string)=> selectStatusOf(useAppStore.getState(), id, todayIndex);
  const verifiedToday = habits.filter(h=> statusOf(h.id)===QuestStatus.verified).length;
  const todayXp = verifiedToday*QUEST_XP;
  const dailyGoalXp = Math.max(150, targetQuestCount*50);
  const progress = Math.min(1, todayXp/dailyGoalXp);
  const [pendingCount, setPendingCount] = useState(3);
  const [celebration, setCelebration] = useState<{ name: string } | null>(null);
  const [filter, setFilter] = useState('All');
  const categories = useMemo(()=>['All', ...Array.from(new Set(habits.map(h=>h.category)))], [habits]);
  const filtered = useMemo(()=> filter==='All' ? habits : habits.filter(h=>h.category===filter), [habits, filter]);

  useEffect(()=>{ void (async()=>{ try{ const rows=await SupabaseServiceInstance.getFriendRequests(); setPendingCount(rows.length);}catch{} })(); },[]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({ onScroll:(e)=>{ scrollY.value=e.contentOffset.y; }});
  const headerOpacity = useAnimatedStyle(()=>{ const c=Math.min(1, Math.max(0, scrollY.value/80)); return { opacity:c, backgroundColor:`rgba(255,255,255,${0.38*c})` };});

  // Duolingo reward loop — detect a quest flipping to verified → full-screen celebration
  const prevStatuses = useRef<Record<string, QuestStatus>>({});
  useEffect(() => {
    const next: Record<string, QuestStatus> = {};
    let newly: Habit | null = null;
    for (const h of habits) {
      const st = statusOf(h.id);
      next[h.id] = st;
      if (st === QuestStatus.verified && prevStatuses.current[h.id] != null && prevStatuses.current[h.id] !== QuestStatus.verified) {
        newly = h;
      }
    }
    const firstPass = Object.keys(prevStatuses.current).length === 0;
    prevStatuses.current = next;
    if (!firstPass && newly != null) {
      setCelebration({ name: newly.name });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, completedCount, todayIndex]);

  return (
    <View style={styles.flex}>
      <Animated.View style={[{ position:'absolute', top:0, left:0, right:0, height:56, zIndex:50 }, headerOpacity]}>
        <BlurView style={StyleSheet.absoluteFill} intensity={85} tint="light" blurMethod={Platform.OS==='android'?'dimezisBlurView':undefined} />
      </Animated.View>
      <Animated.ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces onScroll={onScroll} scrollEventThrottle={16}>
        {/* Top Header — QubiHeaderLogo: squircle mascot avatar, 🔥 streak badge, ⭐ total XP badge (spec §3) */}
        <Animated.View entering={FadeInDown.duration(500)} style={{ backgroundColor: 'transparent' }}>
          <QubiHeaderLogo
            streak={streak}
            xp={xp}
            onAvatarPress={()=> { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); nav.openQubi(); }}
            right={
              <RnPressable onPress={()=>{ void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); nav.openFriends?.() ?? nav.toast('Friends');}} style={({pressed})=>[styles.friendsLauncher, { backgroundColor: colors.card, borderColor: colors.glassEdge }, pressed&&{opacity:0.8}]}>
                <Ionicons name="people-outline" size={20} color={colors.ink} />
                {pendingCount>0 ? <View style={styles.badge}><Text style={styles.badgeText}><Text>{`${Math.min(pendingCount,9)}`}</Text></Text></View> : null}
              </RnPressable>
            }
          />
        </Animated.View>

        {/* Daily Goal Ring — bold circular XP */}
        <Animated.View entering={FadeInDown.duration(600).delay(80)} style={{ alignItems:'center', marginTop:12 }}>
          <SquircleCard radius={32} style={{ paddingVertical:24, paddingHorizontal:16, alignItems:'center', width:'92%' }}>
            <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:13, letterSpacing:1.4, color: colors.muted }}><Text>DAILY GOAL</Text></Text>
            <View style={{ height:14 }} />
            <QubiGoalRing progress={progress} xp={todayXp} goal={dailyGoalXp} />
            <View style={{ height:14 }} />
            <View style={{ flexDirection:'row', gap:8 }}>
              <View style={[styles.miniStat, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC', borderColor: colors.glassEdge }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:14, color: colors.ink }}><Text>{`${verifiedToday}/${habits.length}`}</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize:11, color: colors.muted }}><Text>done</Text></Text>
              </View>
              <View style={[styles.miniStat, { backgroundColor: withAlpha(AppColors.primary,0.10), borderColor: withAlpha(AppColors.primary,0.18) }]}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:14, color: AppColors.primary }}><Text>{`${dailyGoalXp - todayXp} XP`}</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize:11, color: AppColors.primary }}><Text>to go</Text></Text>
              </View>
            </View>
          </SquircleCard>
        </Animated.View>

        {/* Bonus Quest cards — glowing borders */}
        <View style={{ paddingHorizontal:24, marginTop:14, gap:10 }}>
          <SquircleCard radius={24} glowing="bonus" style={{ padding:14 }}>
            <View style={{ flexDirection:'row', alignItems:'center' }}>
              <View style={{ width:36, height:36, borderRadius:12, backgroundColor: withAlpha(AppColors.sky,0.14), alignItems:'center', justifyContent:'center' }}>
                <Ionicons name="heart" size={18} color={AppColors.sky} />
              </View>
              <View style={{ width:10 }} />
              <View style={{ flex:1 }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:13, color: colors.ink }}><Text>Bonus Quest • HealthKit</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize:12, color: colors.muted }}><Text>Walk 2,000 steps → +30 XP</Text></Text>
              </View>
              <View style={{ backgroundColor: AppColors.sky, paddingHorizontal:10, paddingVertical:6, borderRadius:999 }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:11, color:'#FFF' }}><Text>+30 XP</Text></Text>
              </View>
            </View>
          </SquircleCard>
          <SquircleCard radius={24} glowing="bonus" style={{ padding:14 }}>
            <View style={{ flexDirection:'row', alignItems:'center' }}>
              <View style={{ width:36, height:36, borderRadius:12, backgroundColor: withAlpha(AppColors.primary,0.12), alignItems:'center', justifyContent:'center' }}>
                <Ionicons name="calendar-outline" size={18} color={AppColors.primary} />
              </View>
              <View style={{ width:10 }} />
              <View style={{ flex:1 }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:13, color: colors.ink }}><Text>Free Window • 45m at 2pm</Text></Text>
                <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize:12, color: colors.muted }}><Text>Suggested: 20-min Quick Workout +40 XP</Text></Text>
              </View>
              <Pressable onTap={()=>{ void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); nav.toast('Quest scheduled');}} scale={0.97}>
                <View style={{ backgroundColor: AppColors.ink, paddingHorizontal:12, paddingVertical:8, borderRadius:999 }}>
                  <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize:11, color:'#FFF' }}><Text>Schedule</Text></Text>
                </View>
              </Pressable>
            </View>
          </SquircleCard>
        </View>

        {/* Today's Quests */}
        <View style={[styles.sectionHeader, { marginTop:22 }]}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}><Text>Today&apos;s Quests</Text></Text>
          <View style={styles.flex1} />
          <View style={{ flexDirection:'row', gap:6 }}>
            {categories.slice(0,3).map(cat=>(
              <RnPressable key={cat} onPress={()=>{ void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); setFilter(cat);}} style={[styles.filterPill, { backgroundColor: filter===cat ? AppColors.ink : colors.card, borderColor: colors.glassEdge }]}>
                <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize:11, color: filter===cat ? '#FFF' : colors.muted }}><Text>{cat}</Text></Text>
              </RnPressable>
            ))}
          </View>
        </View>

        <View style={styles.questList}>
          {filtered.length===0 ? (
            <SquircleCard style={{ alignItems:'center', paddingVertical:28 }}>
              <QubiMascot size={64} celebrating />
              <View style={{ height:10 }} />
              <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:16, color: colors.ink }}><Text>No Quests Yet!</Text></Text>
              <Text style={{ fontFamily: fontFamilyFor('w500'), fontSize:13, color: colors.muted }}><Text>Ask Qubi to build your routine</Text></Text>
            </SquircleCard>
          ) : (
            /* Duolingo-style winding quest roadmap */
            <Animated.View entering={FadeInDown.duration(400).delay(150)}>
              <QuestPath
                habits={filtered}
                statusOf={statusOf}
                onStart={(habit)=>{
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(()=>{});
                  nav.showProof(habit);
                }}
              />
            </Animated.View>
          )}
        </View>

        {/* Daily Goal — Duolingo daily-quests pattern with chunky progress bar */}
        {habits.length > 0 ? (
          <View style={{ marginHorizontal:24, marginTop:14 }}>
            <SquircleCard radius={24} style={{ padding:16 }}>
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:15, color: colors.ink }}><Text>Daily Goal</Text></Text>
                <View style={styles.flex1} />
                <View style={{ backgroundColor: withAlpha(AppColors.pathGreen,0.14), paddingHorizontal:10, paddingVertical:6, borderRadius:999 }}>
                  <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:11, color: AppColors.pathGreenDeep }}><Text>{`+${QUEST_XP} XP per quest`}</Text></Text>
                </View>
              </View>
              <View style={{ height:22 }} />
              <ProgressBar progress={progress} showStar />
              <View style={{ height:8 }} />
              <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize:11, color: colors.muted }}><Text>{`${todayXp} / ${dailyGoalXp} XP earned today`}</Text></Text>
            </SquircleCard>
          </View>
        ) : null}

        <View style={{ marginHorizontal:24, marginTop:14 }}>
          <SquircleCard radius={24} style={{ padding:16 }}>
            <View style={{ flexDirection:'row', alignItems:'center' }}>
              <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:15, color: colors.ink }}><Text>This Week</Text></Text>
              <View style={styles.flex1} />
              <View style={{ backgroundColor: withAlpha(AppColors.success,0.12), paddingHorizontal:10, paddingVertical:6, borderRadius:999 }}>
                <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize:11, color: AppColors.success }}><Text>{`${completedCount} verified`}</Text></Text>
              </View>
            </View>
            <View style={{ height:14 }} />
            <BarChartWidget values={weeklyBars} labels={WEEK_LABELS} activeIndex={todayIndex} height={150} />
          </SquircleCard>
        </View>
        <View style={{ height:130 }} />
      </Animated.ScrollView>
      {/* Duolingo celebration layer — confetti + XP roll-up on quest completion */}
      {celebration ? (
        <QuestCompleteOverlay
          visible
          questName={celebration.name}
          xp={QUEST_XP}
          onDone={() => setCelebration(null)}
        />
      ) : null}
    </View>
  );
}

function ChunkyTaskCard({ habit, status, onFloating, isFloating }: { habit:Habit; status:QuestStatus; onFloating:()=>void; isFloating:boolean }) {
  const { colors, isDark } = useTheme();
  const nav = useNav();
  const verified = status===QuestStatus.verified;
  const wasVerified = useRef(verified);
  const bgFlash = useSharedValue(0);

  const nodeScale = useSharedValue(1);
  const nodeStyle = useAnimatedStyle(() => ({ transform: [{ scale: nodeScale.value }] }));

  useEffect(() => {
    if (verified && !wasVerified.current) {
      bgFlash.value = withTiming(1, { duration: 150 }, () => {
        bgFlash.value = withTiming(0, { duration: 800 });
      });
      // Quest-node completion pop — Duolingo path bounce
      nodeScale.value = withSpring(1.28, { damping: 9, stiffness: 220 }, () => {
        nodeScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
    }
    wasVerified.current = verified;
  }, [verified, bgFlash, nodeScale]);

  const scale = useSharedValue(1);
  const bgStyle = useAnimatedStyle(()=>({ transform:[{scale: scale.value}] }));
  
  const cardBgStyle = useAnimatedStyle(() => {
    const defaultColor = verified ? (isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5') : colors.card;
    return {
      backgroundColor: bgFlash.value > 0 
        ? interpolateColor(bgFlash.value, [0, 1], [defaultColor, '#10B981'])
        : defaultColor
    };
  });

  const handlePress = ()=>{
    if(verified){ nav.toast(`${habit.name} already verified`); return; }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(()=>{});
    scale.value = withSpring(0.96, {damping:14, stiffness:360});
    setTimeout(()=>{ scale.value = withSpring(1,{damping:14,stiffness:360}); }, 120);
    onFloating();
    nav.showProof(habit);
  };
  const emoji = CATEGORY_EMOJI[habit.category] ?? '✅';
  const accent = CATEGORY_COLORS[habit.category] ?? AppColors.primary;
  return (
    <View style={{ flexDirection:'row' }}>
      {/* Quest-node rail — Duolingo unit-path style: 3D node + connector line */}
      <View style={styles.questRail}>
        <Animated.View
          style={[
            styles.questNode,
            nodeStyle,
            verified
              ? { backgroundColor: AppColors.success, borderColor: AppColors.success, borderBottomColor: '#047857' }
              : { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderBottomColor: '#CBD5E1' },
          ]}
        >
          {verified ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : <Text style={{ fontSize: 18 }}><Text>{emoji}</Text></Text>}
        </Animated.View>
        <View style={styles.questConnector} />
      </View>
      <View style={{ flex:1 }}>
    <Animated.View style={bgStyle}>
      <Pressable onTap={handlePress} scale={1}>
        <Animated.View style={[styles.taskCard, verified ? { borderColor: withAlpha(AppColors.success,0.22), borderWidth:1.5 } : { borderColor: colors.glassEdge, borderWidth:1 }, cardBgStyle]}>
          <FloatingXp visible={isFloating} />
          <View style={{ flexDirection:'row', alignItems:'center' }}>
            <View style={[styles.checkCircle, verified ? { backgroundColor: AppColors.success, borderColor: AppColors.success } : { backgroundColor:'#FFFFFF', borderColor: '#E2E8F0', borderWidth:1.5 }]}>
              {verified ? <Ionicons name="checkmark" size={16} color="#FFF" /> : <View style={{ width:8, height:8, borderRadius:4, backgroundColor: withAlpha(accent,0.22) }} />}
            </View>
            <View style={{ width:12 }} />
            <View style={{ flex:1 }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                <View style={{ backgroundColor: withAlpha(accent,0.12), paddingHorizontal:8, paddingVertical:4, borderRadius:999, flexDirection:'row', alignItems:'center' }}>
                  <Text style={{ fontSize:11 }}><Text>{emoji}</Text></Text>
                  <View style={{ width:4 }} />
                  <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize:10, color: accent }}><Text>{habit.category}</Text></Text>
                </View>
                <Text style={{ fontFamily: fontFamilyFor('w600'), fontSize:11, color: colors.muted }}><Text>{`${habit.time} • 15 min`}</Text></Text>
              </View>
              <View style={{ height:6 }} />
              <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor('w800'), fontSize:15, letterSpacing:-0.2, color: verified ? AppColors.success : colors.ink, textDecorationLine: verified?'line-through':'none' }}><Text>{habit.name}</Text></Text>
            </View>
            <View style={{ backgroundColor: verified ? withAlpha(AppColors.success,0.14) : withAlpha(AppColors.primary,0.12), paddingHorizontal:8, paddingVertical:6, borderRadius:999 }}>
              <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize:11, color: verified ? AppColors.success : AppColors.primary }}><Text>+50 XP</Text></Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex:{ flex:1 },
  flex1:{ flex:1 },
  scrollContent:{ paddingBottom:0 },
  header:{ flexDirection:'row', alignItems:'center', paddingHorizontal:24, paddingTop:10, gap:8 },
  friendsLauncher:{ width:42, height:42, borderRadius:21, borderWidth:1, alignItems:'center', justifyContent:'center', shadowColor:'#0F172A', shadowOpacity:0.06, shadowRadius:10, shadowOffset:{width:0,height:4}, elevation:3 },
  badge:{ position:'absolute', top:-5, right:-4, minWidth:18, height:18, borderRadius:9, backgroundColor:'#EF4444', paddingHorizontal:4, alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#FFF' },
  badgeText:{ color:'#FFF', fontSize:10, fontFamily: fontFamilyFor('w800') },
  questRail:{ width:44, alignItems:'center' },
  questNode:{ width:40, height:40, borderRadius:14, borderWidth:2, borderBottomWidth:4, alignItems:'center', justifyContent:'center', shadowColor:'#0F172A', shadowOpacity:0.06, shadowRadius:8, shadowOffset:{width:0,height:3}, elevation:2 },
  questConnector:{ flex:1, width:4, borderRadius:2, marginTop:6, minHeight:12, backgroundColor:'#FDE8D8' },
  sectionHeader:{ flexDirection:'row', alignItems:'center', paddingHorizontal:24, marginBottom:10 },
  sectionTitle:{ fontSize:18, fontFamily: fontFamilyFor('w800'), letterSpacing:-0.3 },
  filterPill:{ paddingHorizontal:10, paddingVertical:7, borderRadius:999, borderWidth:1 },
  questList:{ paddingHorizontal:24, marginBottom:24 },
  taskCard:{ borderRadius:24, padding:14, shadowColor:'#0F172A', shadowOpacity:0.04, shadowRadius:12, shadowOffset:{width:0,height:4}, elevation:2 },
  checkCircle:{ width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center' },
  miniStat:{ flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:1 },
});

export function PrimaryPillButton({ label, onPress }: { label: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onTap={onPress} scale={0.97}>
      <View style={{ backgroundColor: AppColors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, borderBottomWidth: 3, borderColor: '#D45A07', alignItems:'center' }}>
        <Text style={{ fontFamily: fontFamilyFor('w800'), color: '#FFF' }}><Text>{label}</Text></Text>
      </View>
    </Pressable>
  );
}

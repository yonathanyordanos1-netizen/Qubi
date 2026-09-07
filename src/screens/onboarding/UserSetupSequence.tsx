/**
 * Intent-focused onboarding questionnaire: 4 quick steps capturing the user's
 * core objective, main blocker, verification preference and daily commitment,
 * followed by a pledge summary. Selections persist to the store + responses
 * (which sync to the user's Supabase profile after auth).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/ThemeProvider';
import { AppColors, withAlpha } from '../../theme/colors';
import { body, fontFamilyFor, label } from '../../theme/typography';
import { Pressable } from '../../components/Pressable';
import { StrokeIcon } from '../../components/AppIcons';
import { QubiMascot } from '../../components/QubiMascot';
import { useAppStore } from '../../state/appStore';
import { useGateStore } from '../../state/gateStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WIDTH = Dimensions.get('window').width;
const PROFILE_KEY = 'user_onboarding_profile';

/** ── Data ─────────────────────────────────────────────────────────────── */

const OBJECTIVES = [
  { id: 'morning', name: 'Build Morning Consistency', note: 'Own the first hour of your day', icon: 'sun' as const },
  { id: 'productivity', name: 'Boost Productivity', note: 'Deep work and fewer distractions', icon: 'zap' as const },
  { id: 'fitness', name: 'Fitness & Health', note: 'Move daily and eat with intent', icon: 'dumbbell' as const },
  { id: 'sleep', name: 'Fix Sleep Schedule', note: 'Consistent wind-down and lights-out', icon: 'moonStar' as const },
] as const;

const BLOCKERS = [
  { id: 'procrastination', name: 'Procrastination', note: 'I delay starting', icon: 'clock' as const },
  { id: 'accountability', name: 'Lack of Accountability', note: 'No one notices when I skip', icon: 'users' as const },
  { id: 'overwhelm', name: 'Overwhelming Routines', note: 'Plans get too big to follow', icon: 'list' as const },
  { id: 'motivation', name: 'Losing Motivation', note: 'I start strong then fade', icon: 'flame' as const },
] as const;

const VERIFICATION = [
  { id: 'photo', name: 'AI Photo Proof', note: 'High accountability · camera verified', icon: 'camera' as const },
  { id: 'manual', name: 'Manual Check-in', note: 'Flexible · self-reported', icon: 'checkCircle' as const },
  { id: 'mixed', name: 'Mixed', note: 'Photo for key quests only', icon: 'sliders' as const },
] as const;

const COMMITMENTS = [
  { id: 'light', name: 'Light', range: '1–2 quests / day', target: 2, icon: 'leaf' as const },
  { id: 'moderate', name: 'Moderate', range: '3–4 quests / day', target: 3, icon: 'zap' as const },
  { id: 'intense', name: 'Intense', range: '5+ quests / day', target: 5, icon: 'flame' as const },
] as const;

interface SetupState {
  objective: string | null;
  blocker: string | null;
  verification: string;
  commitment: string;
}

export interface SetupProfile {
  coreObjective: string;
  mainBlocker: string;
  verification: string;
  commitment: string;
  pledgedAt: string;
}

/** ── Reusable pieces ──────────────────────────────────────────────────── */

function PageShell({ step, question, children }: { step: string; question: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.page}>
      <Text style={{ ...label({ color: AppColors.rewardInkMid }), letterSpacing: 2.2, fontWeight: '800' }}>{step}</Text>
      <View style={{ height: 10 }} />
      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontFamily: fontFamilyFor('w800'), fontSize: 24, lineHeight: 30, letterSpacing: -0.7, color: colors.ink }}>
        {question}
      </Text>
      <View style={{ height: 22 }} />
      {children}
    </View>
  );
}

function ChoiceCard({
  selected,
  onTap,
  children,
}: {
  selected: boolean;
  onTap: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onTap={onTap} scale={0.98}>
      <View
        style={[
          styles.choiceCard,
          {
            backgroundColor: selected ? withAlpha(AppColors.rewardBlue, 0.08) : colors.surfaceContainer,
            borderColor: selected ? AppColors.rewardBlue : withAlpha(colors.ink, 0.08),
          },
        ]}
      >
        {children}
        {selected ? (
          <View style={[styles.checkBadge, { backgroundColor: AppColors.primary }]}>
            <StrokeIcon name="check" size={13} color="#fff" strokeWidth={3} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function OptionRow({
  selected,
  onTap,
  icon,
  name,
  note,
}: {
  selected: boolean;
  onTap: () => void;
  icon: Parameters<typeof StrokeIcon>[0]['name'];
  name: string;
  note?: string;
}) {
  const { colors } = useTheme();
  return (
    <ChoiceCard selected={selected} onTap={onTap}>
      <View style={styles.rowCenter}>
        <View style={[styles.iconSquare, { backgroundColor: withAlpha(AppColors.primary, selected ? 0.14 : 0.07) }]}>
          <StrokeIcon name={icon} size={19} color={AppColors.primary} strokeWidth={2.3} />
        </View>
        <View style={styles.flex1}>
          <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor('w700'), fontSize: 15.5, lineHeight: 20, color: colors.ink }}>
            {name}
          </Text>
          {note != null ? (
            <Text numberOfLines={1} style={{ ...body({ color: colors.muted }), fontSize: 12.5, lineHeight: 16 }}>
              {note}
            </Text>
          ) : null}
        </View>
      </View>
    </ChoiceCard>
  );
}

/** ── Screen ───────────────────────────────────────────────────────────── */

export default function UserSetupSequence() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const finishOnboarding = useAppStore((s) => s.finishOnboarding);
  const completeWalkthrough = useGateStore((s) => s.completeWalkthrough);
  const displayName = useAppStore((s) => s.displayName);
  const firstName = displayName.split(' ')[0] ?? displayName;

  const [index, setIndex] = useState(0);
  const [st, setSt] = useState<SetupState>({
    objective: null,
    blocker: null,
    verification: 'photo',
    commitment: 'moderate',
  });
  const scrollRef = useRef<ScrollView>(null);
  const bar = useSharedValue(1 / PAGES);

  const chosenObjective = OBJECTIVES.find((o) => o.id === st?.objective) ?? null;
  const chosenBlocker = BLOCKERS.find((b) => b.id === st?.blocker) ?? null;
  const chosenVerification = VERIFICATION.find((v) => v.id === st?.verification) ?? VERIFICATION[0];
  const chosenCommitment = COMMITMENTS.find((c) => c.id === st?.commitment) ?? COMMITMENTS[1];

  useEffect(() => {
    bar.value = withTiming((index + 1) / PAGES, { duration: 300 });
  }, [index, bar]);
  const barStyle = useAnimatedStyle(() => ({ flex: bar.value }), [bar]);

  const pageReady = (i: number): boolean => {
    switch (i) {
      case 0: return st.objective != null;
      case 1: return st.blocker != null;
      default: return true;
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / WIDTH);
    if (i !== index && i >= 0 && i < PAGES) setIndex(i);
  };

  const next = () => {
    if (!pageReady(index)) return;
    const target = Math.min(index + 1, PAGES - 1);
    setIndex(target);
    scrollRef.current?.scrollTo({ x: target * WIDTH, animated: true });
  };

  const pledge = async () => {
    const objective = chosenObjective?.name ?? 'General consistency';
    const blocker = chosenBlocker?.name ?? 'Motivation';
    const profile: SetupProfile = {
      coreObjective: objective,
      mainBlocker: blocker,
      verification: chosenVerification.id,
      commitment: chosenCommitment.id,
      pledgedAt: new Date().toISOString(),
    };
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}

    // Persist selections into responses (synced to the auth user's profile)
    // plus the structured setup-profile fields.
    const app = useAppStore.getState();
    app.saveResponse('core_objective', objective);
    app.saveResponse('main_blocker', blocker);
    app.applySetupProfile({
      focusAreas: [],
      dailyPace: chosenCommitment.id,
      targetQuestCount: chosenCommitment.target,
      proofMethods: chosenVerification.id === 'mixed' ? ['photo', 'checklist'] : [chosenVerification.id],
      baselineRank: 'novice',
      briefingTime: null,
    });
    completeWalkthrough();
    finishOnboarding();
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.canvas }]}>
      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <View style={[styles.progressTrack, { backgroundColor: withAlpha(colors.ink, 0.08) }]}>
          <Animated.View style={barStyle}>
            <View style={[styles.progressFill, { backgroundColor: AppColors.rewardBlue }]} />
          </Animated.View>
        </View>
        <Text style={{ ...label({ color: colors.muted }), marginLeft: 12 }}>
          {index + 1}/{PAGES}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate={"fast"} 
        snapToInterval={WIDTH}
        snapToAlignment={"start"}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        onMomentumScrollEnd={onScroll}
        style={styles.flex}
      >
        {/* PAGE 1 · Core objective */}
        <PageShell step="YOUR GOAL" question="What brings you to Qubi?">
          {OBJECTIVES.map((o) => (
            <OptionRow
              key={o.id}
              selected={st.objective === o.id}
              onTap={() => setSt((p) => ({ ...p, objective: o.id }))}
              icon={o.icon}
              name={o.name}
              note={o.note}
            />
          ))}
        </PageShell>

        {/* PAGE 2 · Blocker */}
        <PageShell step="HONEST CHECK" question="What usually holds you back?">
          {BLOCKERS.map((b) => (
            <OptionRow
              key={b.id}
              selected={st.blocker === b.id}
              onTap={() => setSt((p) => ({ ...p, blocker: b.id }))}
              icon={b.icon}
              name={b.name}
              note={b.note}
            />
          ))}
        </PageShell>

        {/* PAGE 3 · Verification preference */}
        <PageShell step="ACCOUNTABILITY" question="How do you want to stay accountable?">
          {VERIFICATION.map((v) => (
            <OptionRow
              key={v.id}
              selected={st.verification === v.id}
              onTap={() => setSt((p) => ({ ...p, verification: v.id }))}
              icon={v.icon}
              name={v.name}
              note={v.note}
            />
          ))}
        </PageShell>

        {/* PAGE 4 · Commitment */}
        <PageShell step="DAILY COMMITMENT" question="How much can you take on each day?">
          {COMMITMENTS.map((c) => (
            <OptionRow
              key={c.id}
              selected={st.commitment === c.id}
              onTap={() => setSt((p) => ({ ...p, commitment: c.id }))}
              icon={c.icon}
              name={`${c.name} (${c.range})`}
            />
          ))}
        </PageShell>

        {/* PAGE 5 · Summary & pledge */}
        <PageShell step="ALL SET" question="Your Quest Profile is Ready!">
          <ScrollView showsVerticalScrollIndicator={false} style={styles.flex}>
            <View style={styles.heroWrap}>
              <LinearGradient
                colors={[AppColors.primary, '#333333']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroAvatarRing}
              >
                <View style={[styles.heroAvatarInner, { backgroundColor: colors.surfaceContainer }]}>
                  <Text style={[styles.heroInitials, { color: AppColors.primary }]}>
                    {(displayName.trim()[0] ?? 'Q').toUpperCase()}
                  </Text>
                  <QubiMascot size={30} bob={false} />
                </View>
              </LinearGradient>
              <View style={{ height: 10 }} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontFamily: fontFamilyFor('w900'), fontSize: 19, lineHeight: 25, letterSpacing: -0.5, color: colors.ink }}>
                {firstName}, you&apos;re in.
              </Text>
              <View style={styles.rankBadge}>
                <StrokeIcon name={chosenVerification.icon} size={13} color="#185FA5" strokeWidth={2.4} />
                <View style={{ width: 5 }} />
                <Text style={{ ...label({ color: '#185FA5' }), fontWeight: '800', fontSize: 10.5 }}>
                  LEVEL 1 · NOVICE EXPLORER
                </Text>
              </View>
            </View>

            <View style={{ height: 18 }} />

            <View style={styles.gridWrap}>
              {([
                { icon: 'target', k: 'Objective', v: chosenObjective?.name ?? '\u2014', accent: AppColors.primary },
                { icon: 'shield', k: 'Blocker to beat', v: chosenBlocker?.name ?? '\u2014', accent: '#6B6B6B' },
                { icon: chosenVerification.icon, k: 'Verification', v: chosenVerification.name, accent: AppColors.rewardBlue },
                { icon: chosenCommitment.icon, k: 'Daily pace', v: `${chosenCommitment.name} · ${chosenCommitment.target}/day`, accent: '#F59E0B' },
              ] as Array<{ icon: Parameters<typeof StrokeIcon>[0]['name']; k: string; v: string; accent: string }>).map((cellDef) => (
                <View
                  key={cellDef.k}
                  style={[styles.gridCell, { backgroundColor: colors.surfaceContainer, borderColor: withAlpha(colors.ink, 0.08) }]}
                >
                  <View style={[styles.gridIconTile, { backgroundColor: withAlpha(cellDef.accent, 0.13) }]}>
                    <StrokeIcon name={cellDef.icon} size={17} color={cellDef.accent} strokeWidth={2.4} />
                  </View>
                  <View style={{ height: 8 }} />
                  <Text numberOfLines={1} style={{ ...body({ color: colors.muted }), fontSize: 11, lineHeight: 15 }}>
                    {cellDef.k}
                  </Text>
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={{
                      fontFamily: fontFamilyFor('w700'),
                      fontSize: 13,
                      lineHeight: 18,
                      color: colors.ink,
                      marginTop: 2,
                    }}
                  >
                    {cellDef.v}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ height: 16 }} />
          </ScrollView>
        </PageShell>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.ctaWrap, { paddingBottom: Math.max(26, insets.bottom + 12) }]}>
        {index < PAGES - 1 ? (
          <>
            {!pageReady(index) ? (
              <Text style={{ ...body({ color: colors.muted }), fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginBottom: 10 }}>
                Make a choice to continue
              </Text>
            ) : null}
            <Pressable onTap={next} scale={0.97}>
              <LinearGradient
                colors={pageReady(index) ? [AppColors.primary, AppColors.primaryDeep] : ['#9CA3AF', '#9CA3AF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 15.5, lineHeight: 20, letterSpacing: -0.2, color: '#fff' }}>Continue</Text>
                <View style={{ width: 8 }} />
                <StrokeIcon name="chevronRight" size={16} color="#fff" strokeWidth={2.6} />
              </LinearGradient>
            </Pressable>
          </>
        ) : (
          <Pressable onTap={() => void pledge()} scale={0.97}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              <StrokeIcon name="shield" size={17} color="#fff" strokeWidth={2.4} />
              <View style={{ width: 9 }} />
              <Text style={{ fontFamily: fontFamilyFor('w800'), fontWeight: '800', fontSize: 15, letterSpacing: -0.2, color: '#fff' }}>
                I Pledge to Complete My Quests
              </Text>
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const PAGES = 5;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1, minWidth: 0 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden', flex: 1, flexDirection: 'row' },
  progressFill: { height: 6, borderRadius: 999, flex: 1 },
  page: { width: WIDTH, flex: 1, paddingHorizontal: 28 },

  choiceCard: {
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconSquare: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Summary */
  heroWrap: { alignItems: 'center', paddingTop: 2 },
  heroAvatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  heroAvatarInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInitials: {
    fontFamily: fontFamilyFor('w900'),
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(24, 95, 165, 0.1)',
    borderColor: 'rgba(24, 95, 165, 0.4)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: {
    width: (WIDTH - 56 - 10) / 2,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  gridIconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ctaWrap: { paddingHorizontal: 24 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
    paddingVertical: 16,
    shadowColor: AppColors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});

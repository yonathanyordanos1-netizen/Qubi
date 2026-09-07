/**
 * Ranks tab — your rank card with tier progress, the full tier ladder,
 * a live activity toast and the merged league leaderboard.
 * Port of lib/pages/ranks_page.dart.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { StrokeIcon } from '../components/AppIcons';
import { LiveActivityToast } from '../components/LiveActivityToast';
import {
  RankTier,
  RANK_TIERS,
  rankColor,
  rankEmoji,
  rankGradient,
  rankLabel,
  rangeLabel,
  nextTier,
  tierForXp,
  tierProgress,
  xpToNextTier,
} from '../services/rankService';
import {
  mergedLeaderboard,
  selectRecentActivity,
  useStatsStore,
} from '../state/statsStore';
import { selectInitials, useAppStore } from '../state/appStore';
import { leagueTierEnum, type LeagueEntry } from '../types/models';

const MEDAL_COLORS = [AppColors.gold, AppColors.silver, AppColors.bronze];

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function RanksPage() {
  const { isDark, colors } = useTheme();
  const [tab, setTab] = useState<'leaderboard' | 'rank'>('leaderboard');

  const userXp = useAppStore((s) => s.xp);
  const userStreak = useAppStore((s) => s.streak);
  const displayName = useAppStore((s) => s.displayName);
  const initials = useAppStore(selectInitials);

  const activity = useStatsStore(selectRecentActivity);
  const statsState = useStatsStore((s) => s);

  const completions = userXp > 0 ? 1 : 0;
  const userTier = tierForXp(userXp, completions);
  const userTierIdx = RANK_TIERS.findIndex((t) => t.tier === userTier);
  const tierColor = rankColor(userTier);
  const next = nextTier(userTier);
  const progress = tierProgress(userXp, completions);
  const toNext = xpToNextTier(userXp, completions);

  const league = mergedLeaderboard(statsState, {
    displayName,
    initials,
    realXp: userXp,
    realStreak: userStreak,
  });

  const switchTab = (t: 'leaderboard' | 'rank') => {
    if (t === tab) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTab(t);
  };

  const segmentedBg = isDark ? '#1E1814' : '#FDF1E7';
  const segmentedBorder = isDark ? 'rgba(255,255,255,0.08)' : '#F5E9DA';
  const segmentActiveBg = isDark ? '#2E241C' : '#FFFFFF';

  return (
    <View style={styles.flex}>
      {/* ── Top nav: Leaderboard | Rank — pinned above the safe content ── */}
      <View style={styles.topNav}>
        <View style={[styles.segmented, { backgroundColor: segmentedBg, borderColor: segmentedBorder }]}>
          {(['leaderboard', 'rank'] as const).map((t) => {
            const selected = tab === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => switchTab(t)}
                activeOpacity={0.85}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={t === 'leaderboard' ? 'Leaderboard' : 'Rank'}
                style={[
                  styles.segment,
                  selected && {
                    backgroundColor: segmentActiveBg,
                    shadowColor: '#0F172A',
                    shadowOpacity: isDark ? 0.18 : 0.08,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 3,
                  },
                ]}
              >
                <Text style={[styles.segmentText, { color: selected ? colors.ink : colors.muted }]}>
                  {t === 'leaderboard' ? 'Leaderboard' : 'Rank'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {tab === 'rank' ? (
          <Animated.View key="rank" entering={FadeInDown.duration(300)}>
      {/* ── Your rank card ── */}
      <Animated.View entering={FadeInDown.duration(500)}>
        <View
          style={[
            styles.rankCard,
            {
              backgroundColor: isDark ? colors.glassBacking : colors.card,
              borderColor: withAlpha(tierColor, 0.25),
              shadowColor: tierColor,
            },
          ]}
        >
          <View style={styles.row}>
            <LinearGradient colors={rankGradient(userTier)} style={styles.tierBadge}>
              <Text style={{ fontSize: 28 }}>{rankEmoji(userTier)}</Text>
            </LinearGradient>
            <View style={{ width: 14 }} />
            <View style={styles.flex1}>
              <Text style={[styles.tierLabel, { color: tierColor }]}>{rankLabel(userTier)}</Text>
              <View style={{ height: 4 }} />
              <Text style={[styles.xpLabel, { color: colors.muted }]}>{userXp} XP</Text>
            </View>
          </View>
          <View style={{ height: 18 }} />
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tierColor }]} />
          </View>
          <View style={{ height: 10 }} />
          <Text style={[styles.toNext, { color: colors.muted }]}>
            {next != null ? `${toNext} XP to ${rankEmoji(next)} ${rankLabel(next)}` : 'Max Rank!'}
          </Text>
        </View>
      </Animated.View>

      {/* ── Live activity toast ── */}
      {activity.length > 0 && (
        <Animated.View entering={FadeInDown.duration(300)} style={{ marginBottom: 12 }}>
          <LiveActivityToast events={activity} />
        </Animated.View>
      )}

      {/* ── All ranks ladder ── */}
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>All Ranks</Text>
      {RANK_TIERS.map((data, i) => {
        const isCurrentTier = data.tier === userTier;
        const passed = userTierIdx > i || isCurrentTier;
        const rowColor = rankColor(data.tier);
        return (
          <View
            key={data.tier}
            style={[
              styles.tierRow,
              {
                backgroundColor: isCurrentTier
                  ? withAlpha(rowColor, 0.06)
                  : isDark
                    ? colors.glassBacking
                    : colors.card,
                borderColor: isCurrentTier ? withAlpha(rowColor, 0.4) : colors.border,
                borderWidth: isCurrentTier ? 1.5 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 22 }}>{rankEmoji(data.tier)}</Text>
            <View style={{ width: 12 }} />
            <View style={styles.flex1}>
              <Text
                style={[
                  styles.tierRowLabel,
                  { color: isCurrentTier ? rowColor : colors.ink },
                ]}
              >
                {rankLabel(data.tier)}
              </Text>
              <View style={{ height: 2 }} />
              <Text style={[styles.tierRowRange, { color: colors.muted }]}>{rangeLabel(data)}</Text>
            </View>
            {passed && (
              <StrokeIcon
                name="checkCircle"
                size={20}
                color={isCurrentTier ? rowColor : AppColors.success}
                strokeWidth={2.2}
              />
            )}
          </View>
        );
      })}
      <View style={{ height: 16 }} />
          </Animated.View>
        ) : (
          <Animated.View key="leaderboard" entering={FadeInDown.duration(300)}>
      {/* ── Leaderboard header ── */}
      <View style={styles.leaderHeader}>
        <Text style={[styles.sectionTitle, { color: colors.ink, paddingLeft: 0 }]}>Leaderboard</Text>
        <View style={styles.flex1} />
        <Text style={[styles.playerCount, { color: colors.muted }]}>{league.length} players</Text>
      </View>

      {/* ── Leader rows ── */}
      {league.map((entry) => (
        <LeaderRow key={`${entry.name}_${entry.rank}`} entry={entry} />
      ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Leaderboard row ─────────────────────────────────────────────────────────

function LeaderRow({ entry }: { entry: LeagueEntry }) {
  const { isDark, colors } = useTheme();
  const tierEnum = leagueTierEnum(entry);
  const tierDot = rankColor(tierEnum);
  const isMe = entry.isMe;

  return (
    <View
      style={[
        styles.leaderRow,
        {
          backgroundColor: isMe ? withAlpha(AppColors.primary, 0.06) : isDark ? colors.glassBacking : colors.card,
          borderColor: isMe ? withAlpha(AppColors.primary, 0.3) : colors.border,
        },
      ]}
    >
      <View style={styles.rankBox}>
        <Text
          style={[
            styles.rankNum,
            {
              color:
                entry.rank <= 3 ? MEDAL_COLORS[entry.rank - 1] : colors.muted,
            },
          ]}
        >
          {entry.rank}
        </Text>
      </View>
      <View style={{ width: 8 }} />
      <Text style={{ fontSize: 16 }}>{rankEmoji(tierEnum)}</Text>
      <View style={{ width: 4 }} />
      <View style={[styles.tierDot, { backgroundColor: tierDot, shadowColor: tierDot }]} />
      <View style={{ width: 10 }} />
      {isMe ? (
        <LinearGradient colors={[AppColors.primary, AppColors.primaryDeep]} style={styles.avatar}>
          <Text style={[styles.avatarText, { color: '#FFFFFF' }]}>{entry.initials}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.avatar, { backgroundColor: withAlpha(tierDot, 0.1) }]}>
          <Text style={[styles.avatarText, { color: tierDot }]}>{entry.initials}</Text>
        </View>
      )}
      <View style={{ width: 12 }} />
      <View style={styles.flex1}>
        <View style={styles.row}>
          <Text numberOfLines={1} style={[styles.leaderName, { flexShrink: 1, color: isMe ? AppColors.primary : colors.ink }]}>
            {entry.name}
          </Text>
          {isMe && (
            <>
              <View style={{ width: 6 }} />
              <View style={styles.youPill}>
                <Text style={styles.youPillText}>You</Text>
              </View>
            </>
          )}
        </View>
        <View style={{ height: 3 }} />
        <View style={styles.row}>
          <StrokeIcon name="flame" size={11} color={tierDot} />
          <View style={{ width: 3 }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>{entry.streak}-day streak</Text>
        </View>
      </View>
      <View style={{ width: 8 }} />
      <View
        style={[
          styles.xpPill,
          {
            backgroundColor: isMe
              ? withAlpha(AppColors.primary, 0.1)
              : isDark
                ? colors.surfaceContainer
                : colors.surfaceLow,
          },
        ]}
      >
        <Text numberOfLines={1} style={[styles.xpPillText, { color: isMe ? AppColors.primary : colors.ink }]}>
          {fmt(entry.xp)} XP
        </Text>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 130 },

  topNav: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: 999, borderWidth: 1, gap: 4, height: 44 },
  segment: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontFamily: fontFamilyFor('w700'), lineHeight: 16, letterSpacing: 0.1 },

  rankCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tierBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  tierLabel: { fontSize: 22, fontWeight: '800', fontFamily: fontFamilyFor('w800'), letterSpacing: -0.5, lineHeight: 22 * 1.1 },
  xpLabel: { fontSize: 14, fontWeight: '700', fontFamily: fontFamilyFor('w700') },

  progressTrack: {
    height: 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  progressFill: { height: 10, borderRadius: 8 },
  toNext: { fontSize: 12.5, fontWeight: '600', fontFamily: fontFamilyFor('w600') },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
    paddingLeft: 4,
    marginBottom: 12,
  },

  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  tierRowLabel: { fontSize: 14, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
  tierRowRange: { fontSize: 11.5, fontWeight: '600', fontFamily: fontFamilyFor('w600') },

  leaderHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingTop: 4, marginBottom: 12 },
  playerCount: { fontSize: 12, fontWeight: '600', fontFamily: fontFamilyFor('w600') },

  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  rankBox: { width: 26, alignItems: 'center' },
  rankNum: { fontSize: 14, fontWeight: '800', fontFamily: fontFamilyFor('w800'), textAlign: 'center' },
  tierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', fontFamily: fontFamilyFor('w800') },
  leaderName: { fontSize: 13.5, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
  youPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: withAlpha(AppColors.primary, 0.12),
  },
  youPillText: { fontSize: 10, fontWeight: '700', fontFamily: fontFamilyFor('w700'), color: AppColors.primary },
  xpPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, maxWidth: 92 },
  xpPillText: { fontSize: 13, fontWeight: '800', fontFamily: fontFamilyFor('w800') },
});

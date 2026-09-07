import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable as RnPressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { LiquidGlassCard } from './LiquidGlass';
import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { Pressable } from './Pressable';
import {
  getHealthMetrics,
  requestHealthPermissions,
  type HealthMetrics,
  type WorkoutSession,
} from '../services/healthService';

function workoutIcon(type: WorkoutSession['type']): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'running': return 'walk';
    case 'cycling': return 'bicycle';
    case 'gym': return 'barbell';
    case 'yoga': return 'leaf';
    case 'swimming': return 'water';
    case 'hiking': return 'map';
    default: return 'fitness';
  }
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function WorkoutStatsCard() {
  const { isDark, colors } = useTheme();
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [permDenied, setPermDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const perm = await requestHealthPermissions();
      if (perm === 'denied') {
        setPermDenied(true);
        setMetrics(await getHealthMetrics());
      } else if (perm === 'unavailable') {
        // simulator/web mock
        setMetrics(await getHealthMetrics());
      } else {
        setPermDenied(false);
        setMetrics(await getHealthMetrics());
      }
    } catch {
      setMetrics(await getHealthMetrics().catch(() => null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <LiquidGlassCard padding={16}>
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <ActivityIndicator color={AppColors.primary} />
          <View style={{ height: 8 }} />
          <Text style={{ color: colors.muted, fontFamily: fontFamilyFor('w600'), fontSize: 12 }}>Loading fitness stats…</Text>
        </View>
      </LiquidGlassCard>
    );
  }

  if (!metrics) {
    return (
      <LiquidGlassCard padding={16}>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Ionicons name="fitness-outline" size={28} color={colors.muted} />
          <View style={{ height: 8 }} />
          <Text style={{ color: colors.muted, fontFamily: fontFamilyFor('w600'), fontSize: 13 }}>Fitness data unavailable</Text>
          <View style={{ height: 10 }} />
          <Pressable onTap={() => void load()} scale={0.97}>
            <View style={[styles.retryBtn, { borderColor: colors.border }]}>
              <Text style={[styles.retryText, { color: colors.ink }]}>Retry</Text>
            </View>
          </Pressable>
        </View>
      </LiquidGlassCard>
    );
  }

  const hasWorkouts = metrics.workoutsToday.length > 0;

  return (
    <View style={styles.outer}>
      {/* Subtle gradient + blur for liquid glass hero */}
      <LinearGradient
        colors={isDark ? ['#1C1C1E', '#161616'] : ['#FFFFFF', '#F8F9FA']}
        style={StyleSheet.absoluteFill}
      />
      <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[styles.card, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', backgroundColor: isDark ? 'rgba(22,22,22,0.65)' : 'rgba(255,255,255,0.78)' }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={[styles.headerIcon, { backgroundColor: withAlpha('#FF6B1A', 0.14) }]}>
            <Ionicons name="fitness" size={18} color="#FF6B1A" />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.ink }]}>Workout Activity</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{hasWorkouts ? `${metrics.workoutsToday.length} workout${metrics.workoutsToday.length > 1 ? 's' : ''} today` : 'No workouts yet today'}</Text>
          </View>
          <View style={[styles.xpPill, { backgroundColor: withAlpha(AppColors.primary, 0.1), borderColor: withAlpha(AppColors.primary, 0.2) }]}>
            <Ionicons name="flash" size={12} color={AppColors.primary} />
            <View style={{ width: 4 }} />
            <Text style={[styles.xpText, { color: AppColors.primary }]}>+{metrics.xpFromFitness} XP</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <Stat label="Steps" value={`${metrics.stepsToday.toLocaleString()}`} icon="footsteps" color="#378ADD" />
          <View style={styles.divider} />
          <Stat label="Calories" value={`${metrics.activeCaloriesToday}`} unit="kcal" icon="flame" color="#FF6B1A" />
          <View style={styles.divider} />
          <Stat label="Workouts" value={`${metrics.workoutsToday.length}`} icon="barbell" color="#10B981" />
        </View>

        {permDenied ? (
          <View style={[styles.deniedBanner, { backgroundColor: withAlpha('#F59E0B', 0.1), borderColor: withAlpha('#F59E0B', 0.3) }]}>
            <Ionicons name="warning-outline" size={14} color="#D97706" />
            <View style={{ width: 6 }} />
            <Text style={[styles.deniedText, { color: '#92400E' }]}>Health access limited — showing estimates.</Text>
          </View>
        ) : null}

        {/* Workout list */}
        {hasWorkouts ? (
          <View style={{ marginTop: 14 }}>
            {metrics.workoutsToday.map((w) => (
              <View
                key={w.id}
                style={[
                  styles.workoutRow,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                ]}
              >
                <View style={[styles.workoutIcon, { backgroundColor: withAlpha('#FF6B1A', 0.14) }]}>
                  <Ionicons name={workoutIcon(w.type)} size={16} color="#FF6B1A" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.workoutType, { color: colors.ink }]}>{w.type.charAt(0).toUpperCase() + w.type.slice(1)}</Text>
                  <Text style={[styles.workoutMeta, { color: colors.muted }]}>
                    {fmtDuration(w.durationMinutes)} · {w.calories} kcal{w.distanceMeters ? ` · ${(w.distanceMeters / 1000).toFixed(1)} km` : ''}
                  </Text>
                </View>
                <View style={[styles.workoutXp, { backgroundColor: AppColors.primary }]}>
                  <Text style={styles.workoutXpText}>+50 XP</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyState, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
            <Ionicons name="walk-outline" size={20} color={colors.muted} />
            <View style={{ width: 8 }} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Log a workout in Health to earn XP</Text>
          </View>
        )}

        {/* Refresh */}
        <RnPressable
          onPress={() => void load()}
          style={({ pressed }) => [styles.refreshRow, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="refresh" size={13} color={colors.muted} />
          <View style={{ width: 6 }} />
          <Text style={[styles.refreshText, { color: colors.muted }]}>Refresh fitness stats</Text>
        </RnPressable>
      </View>
    </View>
  );
}

function Stat({ label, value, unit, icon, color }: { label: string; value: string; unit?: string; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: withAlpha(color, 0.12) }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={{ height: 6 }} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={[styles.statValue, { color: colors.ink }]}>{value}</Text>
        {unit ? <Text style={[styles.statUnit, { color: colors.muted }]}>{unit}</Text> : null}
      </View>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: 24,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', fontFamily: fontFamilyFor('w800') },
  subtitle: { fontSize: 12, fontFamily: fontFamilyFor('w600'), marginTop: 1 },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  xpText: { fontSize: 12, fontWeight: '800', fontFamily: fontFamilyFor('w800') },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    alignItems: 'stretch',
  },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', fontFamily: fontFamilyFor('w800'), letterSpacing: -0.5 },
  statUnit: { fontSize: 11, fontFamily: fontFamilyFor('w600') },
  statLabel: { fontSize: 11, fontFamily: fontFamilyFor('w600'), marginTop: 2 },
  divider: { width: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginHorizontal: 8 },
  deniedBanner: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  deniedText: { fontSize: 11, fontFamily: fontFamilyFor('w600'), flex: 1 },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  workoutIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  workoutType: { fontSize: 13, fontWeight: '700', fontFamily: fontFamilyFor('w700'), textTransform: 'capitalize' },
  workoutMeta: { fontSize: 11, fontFamily: fontFamilyFor('w600'), marginTop: 1 },
  workoutXp: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  workoutXpText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', fontFamily: fontFamilyFor('w800') },
  emptyState: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 12, fontFamily: fontFamilyFor('w600') },
  refreshRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  refreshText: { fontSize: 11, fontFamily: fontFamilyFor('w600') },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  retryText: { fontSize: 13, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
});

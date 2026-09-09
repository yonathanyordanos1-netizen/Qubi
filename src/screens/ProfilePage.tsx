/**
 * Profile tab — avatar hero, stat pills, weekly XP chart, badges,
 * account status, about rows and edit-profile / sign-out actions.
 * Restyled to the Duolingo-style Qubi theme: cream canvas, chunky white
 * cards with 2px ink borders + hard offset shadows, orange accents.
 * Port of lib/pages/profile_page.dart.
 */

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable as RnPressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrossModal } from '../components/CrossModal';
import { LinearGradient } from 'expo-linear-gradient';

import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { Pressable } from '../components/Pressable';
import { GoogleLogo, StrokeIcon } from '../components/AppIcons';
import { WorkoutStatsCard } from '../components/WorkoutStatsCard';
import { BarChartWidget } from '../components/BarChartWidget';
import {
  avatarColors,
  selectBadges,
  selectCompletedCount,
  selectInitials,
  selectMemberSinceLabel,
  selectWeeklyRate,
  selectWeeklyXpBars,
  useAppStore,
} from '../state/appStore';
import { selectIsDemo, selectIsSignedIn } from '../state/appStore';
import {
  rankEmoji,
  rankColor,
  rankLabel,
  tierForXp,
} from '../services/rankService';
import { selectTodayIndex } from '../state/appStore';
import { useNav } from './navContext';
import { supabase, SupabaseServiceInstance } from '../services/supabase';
import { clearOnboarding } from '../state/appStore';
import { useGateStore } from '../state/gateStore';
import { useSettingsStore } from '../state/settingsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function ProfilePage() {
  const { isDark, colors } = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();

  const displayName = useAppStore((s) => s.displayName);
  const username = useAppStore((s) => s.username);
  const email = useAppStore((s) => s.email);
  const avatar = useAppStore((s) => s.avatar);
  const xp = useAppStore((s) => s.xp);
  const streak = useAppStore((s) => s.streak);
  const initials = useAppStore(selectInitials);
  const completedCount = useAppStore(selectCompletedCount);
  const weeklyRate = useAppStore(selectWeeklyRate);
  const weeklyBars = useAppStore(selectWeeklyXpBars);
  const memberSince = useAppStore(selectMemberSinceLabel);
  const badges = useAppStore(selectBadges);
  const age = useAppStore((s) => s.age);
  const focusAreas = useAppStore((s) => s.focusAreas);
  const dailyPace = useAppStore((s) => s.dailyPace);
  const targetQuestCount = useAppStore((s) => s.targetQuestCount);
  const baselineRank = useAppStore((s) => s.baselineRank);
  const isSignedIn = selectIsSignedIn();
  const isDemo = selectIsDemo();

  const todayIndex = selectTodayIndex();
  const [editOpen, setEditOpen] = useState(false);

  const palette = avatarColors(avatar);

  // Rank + level math
  const tier = tierForXp(xp, completedCount);
  const tierCol = rankColor(tier);
  const level = 1 + Math.floor(xp / 500);
  const intoLevel = xp - (level - 1) * 500;
  const toNextLevel = level * 500 - xp;

  const earnedBadges = badges.filter((b) => b.earned).length;
  const accent = isSignedIn ? AppColors.success : isDemo ? AppColors.gold : colors.muted;
  const providerLabel = isSignedIn
    ? 'Signed in · progress synced'
    : isDemo
      ? 'Private progress · sign in to sync'
      : 'Not signed in';

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: isDark ? colors.canvas : '#FFF7ED' }]}
      contentContainerStyle={{ paddingBottom: 150, paddingTop: insets.top + 8 }}
      showsVerticalScrollIndicator={false}
      bounces
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.ink }]}>Profile</Text>
        <View style={styles.flex1} />
        <Pressable scale={0.94} onTap={nav.openSettings}>
          <View style={styles.settingsBtn}>
            <StrokeIcon name="settings" size={20} color={AppColors.ink} strokeWidth={2} />
          </View>
        </Pressable>
      </View>

      {/* ── Hero ── */}
      <View style={styles.padX}>
        <View style={styles.heroCard}>
          <View style={{ alignItems: 'center' }}>
            <View>
              <LinearGradient colors={palette} style={styles.avatarTile}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </LinearGradient>
              <View style={styles.verifiedDot}>
                <StrokeIcon name="check" size={12} color="#FFFFFF" strokeWidth={3} />
              </View>
            </View>
            <View style={{ height: 14 }} />
            <Text style={[styles.nameText, { color: colors.ink }]}>{displayName}</Text>
            <View style={{ height: 4 }} />
            <Text style={[styles.handleText, { color: colors.muted }]}>@{username}</Text>
            {email.length > 0 && (
              <>
                <View style={{ height: 2 }} />
                <Text style={{ fontSize: 12.5, color: colors.muted }}>{email}</Text>
              </>
            )}
            <View style={{ height: 12 }} />
            <View style={styles.row}>
              <MetaChip color={AppColors.gold} text={memberSince} dark={isDark} />
              <View style={{ width: 8 }} />
              <MetaChip color={AppColors.sky} text="🥈 Silver" dark={isDark} />
            </View>
            {age != null ? (
              <>
                <View style={{ height: 6 }} />
                <MetaChip color={colors.muted} text={`${age} yrs`} dark={isDark} />
              </>
            ) : null}
            <View style={{ height: 10 }} />
            {/* Rank badge */}
            <View style={[styles.rankPill, { borderColor: tierCol }]}>
              <Text style={{ fontSize: 15 }}>{rankEmoji(tier)}</Text>
              <View style={{ width: 6 }} />
              <Text style={[styles.rankPillText, { color: tierCol }]}>{rankLabel(tier)}</Text>
            </View>
            <View style={{ height: 16 }} />
            {/* Total XP block */}
            <View style={[styles.xpBlock, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED' }]}>
              <View style={styles.row}>
                <Text style={styles.xpBlockLabel}>TOTAL XP</Text>
                <View style={styles.flex1} />
                <Text style={[styles.xpBlockValue, { color: colors.ink }]}>
                  {xp} / {level * 500}
                </Text>
              </View>
              <View style={{ height: 8 }} />
              <View style={styles.levelTrack}>
                <View
                  style={{
                    width: `${Math.round(Math.min(1, Math.max(0, intoLevel / 500)) * 100)}%`,
                    height: 8,
                    backgroundColor: AppColors.primary,
                    borderRadius: 8,
                  }}
                />
              </View>
              <View style={{ height: 6 }} />
              <Text style={[styles.toNextLevel, { color: colors.muted }]}>
                {toNextLevel} XP to Level {level + 1}
              </Text>
            </View>
            <View style={{ height: 14 }} />
            <View style={PRIMARY_GLOW}>
              <Pressable scale={0.98} onTap={() => setEditOpen(true)}>
                <LinearGradient colors={[AppColors.primary, AppColors.primaryDeep]} style={styles.editButton}>
                  <StrokeIcon name="edit" size={16} color="#FFFFFF" strokeWidth={2} />
                  <View style={{ width: 6 }} />
                  <Text style={styles.editButtonText}>Edit Profile</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* ── Workout Activity (HealthKit) ── */}
      <View style={{ paddingTop: 14, paddingHorizontal: 16 }}>
        <WorkoutStatsCard />
      </View>

      {/* ── Stat pills — 2x2 grid of chunky cards ── */}
      <View style={styles.statGrid2x2}>
        <View style={styles.statGridRow}>
          <View style={{ flex: 1 }}><StatPill icon="flame" value={`${streak}`} label="Day Streak" accent={AppColors.primary} dark={isDark} /></View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}><StatPill icon="zap" value={fmt(xp)} label="Total XP" accent={AppColors.sky} dark={isDark} /></View>
        </View>
        <View style={{ height: 10 }} />
        <View style={styles.statGridRow}>
          <View style={{ flex: 1 }}><StatPill icon="check" value={`${weeklyRate}%`} label="Verify Rate" accent={AppColors.success} dark={isDark} /></View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}><StatPill icon="trophy" value={`Lv ${level}`} label="Level" accent="#F59E0B" dark={isDark} /></View>
        </View>
      </View>

      {/* ── Quest setup (from onboarding) ── */}
      {focusAreas.length > 0 || dailyPace != null || baselineRank != null ? (
        <View style={styles.sectionSpacing}>
          <View style={[styles.plainCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? colors.glassEdge : '#000000' }]}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Your Quest Profile</Text>
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {baselineRank != null ? (
                <MetaChip color="#F59E0B" text={`Baseline · ${baselineRank}`} dark={isDark} />
              ) : null}
              {dailyPace != null ? (
                <MetaChip color="#378ADD" text={`Pace · ${dailyPace} (${targetQuestCount}/day)`} dark={isDark} />
              ) : null}
              {focusAreas.map((f) => (
                <MetaChip key={f} color={AppColors.sky} text={f} dark={isDark} />
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {/* ── Weekly XP ── */}
      <View style={styles.sectionSpacing}>
        <View style={[styles.plainCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? colors.glassEdge : '#000000' }]}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Weekly XP</Text>
            <View style={styles.flex1} />
            <View style={styles.verifiedPill}>
              <Text style={styles.verifiedPillText}>{completedCount} verified</Text>
            </View>
          </View>
          <View style={{ height: 18 }} />
          <BarChartWidget values={weeklyBars} labels={WEEK_LABELS} activeIndex={todayIndex} height={180} />
        </View>
      </View>

      {/* ── Badges ── */}
      <View style={styles.sectionSpacing}>
        <View style={[styles.plainCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? colors.glassEdge : '#000000' }]}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Badges</Text>
            <View style={styles.flex1} />
            <Text style={[styles.badgeCountText, { color: colors.muted }]}>
              {earnedBadges}/{badges.length} earned
            </Text>
          </View>
          <View style={{ height: 14 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {badges.map((badge) => (
              <View
                key={badge.name}
                style={[
                  styles.badgeChip,
                  {
                    backgroundColor: badge.earned
                      ? withAlpha(AppColors.primary, 0.1)
                      : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : '#FFF7ED',
                    borderColor: badge.earned ? AppColors.primary : isDark ? colors.glassEdge : '#00000022',
                  },
                ]}
              >
                <Text style={{ fontSize: 14 }}>{badge.emoji}</Text>
                <View style={{ width: 6 }} />
                <Text
                  style={[
                    styles.badgeChipText,
                    { color: badge.earned ? AppColors.primaryDeep : colors.muted },
                  ]}
                >
                  {badge.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── Account card ── */}
      <View style={styles.sectionSpacing}>
        <View style={[styles.plainCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? colors.glassEdge : '#000000' }]}>
          <View style={styles.row}>
            <View
              style={[
                styles.providerTile,
                {
                  backgroundColor: isSignedIn ? withAlpha(AppColors.success, 0.1) : isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED',
                  borderColor: isDark ? colors.glassEdge : '#00000022',
                },
              ]}
            >
              {isSignedIn ? (
                <GoogleLogo size={22} />
              ) : (
                <StrokeIcon name={isDemo ? 'shield' : 'user'} size={20} color={accent} />
              )}
            </View>
            <View style={{ width: 12 }} />
            <View style={styles.flex1}>
              <Text numberOfLines={1} style={[styles.accountTitle, { color: colors.ink }]}>
                {isSignedIn && email.length > 0 ? email : displayName}
              </Text>
              <View style={{ height: 2 }} />
              <Text numberOfLines={1} style={[styles.accountSubtitle, { color: colors.muted }]}>
                {providerLabel}
              </Text>
            </View>
            <View style={{ width: 8 }} />
            <View style={[styles.statusDot, { backgroundColor: accent, shadowColor: accent }]} />
          </View>
        </View>
      </View>

      {/* ── About card ── */}
      <View style={styles.sectionSpacing}>
        <View style={[styles.plainCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? colors.glassEdge : '#000000' }]}>
          <AboutRow icon="info" label="App Version" value="1.2.0" ink={colors.ink} muted={colors.muted} />
          <RnPressable onPress={() => { useAppStore.getState().resetOnboardingForReplay(); nav.toast('Onboarding replay armed'); }}>
            <AboutRow
              icon="replay"
              label="Replay Onboarding"
              value="Walk through the guide again"
              ink={colors.ink}
              muted={colors.muted}
            />
          </RnPressable>
          <View style={{ height: 4 }} />
          <Pressable scale={0.98} onTap={confirmSignOut}>
            <View style={styles.signOutBtn}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <EditProfileSheet visible={editOpen} onClose={() => setEditOpen(false)} initialName={displayName} initialUsername={username} />
    </ScrollView>
  );

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your local progress is saved. Sign in again anytime to re-sync.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              try {
                if (supabase != null) await supabase.auth.signOut({ scope: 'global' });
              } catch (e) {
                console.warn('[signOut] supabase signOut failed', e);
              }
              await SupabaseServiceInstance.signOut();
              await useAppStore.getState().signOut();
              await clearOnboarding();
              await AsyncStorage.clear().catch(() => {});
              useGateStore.getState().resetGates();
              await useGateStore.getState().hydrate().catch(() => {});
              await useSettingsStore.getState().hydrate().catch(() => {});
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const router = require('expo-router').router as { replace: (p: string) => void } | undefined;
                router?.replace('/auth/login');
              } catch {}
              nav.toast('Signed out');
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert('Sign out failed', msg || 'Check your connection and try again.');
            }
          })(),
      },
    ]);
  }
}

// ── Small pieces ────────────────────────────────────────────────────────────

function MetaChip({ color, text, dark }: { color: string; text: string; dark: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: withAlpha(color, dark ? 0.16 : 0.1),
        borderWidth: 2,
        borderColor: dark ? 'transparent' : '#00000022',
      }}
    >
      <Text style={{ fontSize: 11.5, fontFamily: fontFamilyFor('w800'), color }}>
        {text}
      </Text>
    </View>
  );
}

function StatPill({
  icon,
  value,
  label,
  accent,
  dark,
}: {
  icon: string;
  value: string;
  label: string;
  accent: string;
  dark: boolean;
}) {
  return (
    <View style={[styles.statPill, { backgroundColor: dark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: dark ? 'rgba(255,255,255,0.1)' : '#000000' }]}>
      <View style={[styles.statPillIcon, { backgroundColor: withAlpha(accent, 0.12), borderColor: withAlpha(accent, 0.3) }]}>
        <StrokeIcon name={icon} size={14} color={accent} strokeWidth={1.8} />
      </View>
      <View style={{ height: 8 }} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.statPillValue, { color: AppColors.ink }]}>
        <Text>{value}</Text>
      </Text>
      <View style={{ height: 2 }} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.statPillLabel, { color: AppColors.muted }]}>
        <Text>{label}</Text>
      </Text>
    </View>
  );
}

function AboutRow({
  icon,
  label,
  value,
  ink,
  muted,
}: {
  icon: string;
  label: string;
  value: string;
  ink: string;
  muted: string;
}) {
  return (
    <View style={[styles.row, { marginBottom: 14 }]}>
      <StrokeIcon name={icon} size={18} color={AppColors.primary} />
      <View style={{ width: 12 }} />
      <Text style={[styles.aboutLabel, { flexShrink: 1, color: muted }]}>{label}</Text>
      <View style={styles.flex1} />
      <Text numberOfLines={2} style={[styles.aboutValue, { maxWidth: '52%', textAlign: 'right', color: ink }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Edit profile sheet ──────────────────────────────────────────────────────

function EditProfileSheet({
  visible,
  onClose,
  initialName,
  initialUsername,
}: {
  visible: boolean;
  onClose: () => void;
  initialName: string;
  initialUsername: string;
}) {
  const { colors, isDark } = useTheme();
  const nav = useNav();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const error = await useAppStore.getState().setProfile({ name, username });
    setBusy(false);
    if (error != null) {
      nav.toast(error);
      return;
    }
    onClose();
  };

  return (
    <CrossModal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={styles.flex1}
      >
        <View style={[styles.flex1, { justifyContent: 'flex-end' }]}>
          <RnPressable onPress={onClose} style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          </RnPressable>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 28 }}
          >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: isDark ? 'rgba(30,24,20,0.98)' : '#FFFFFF',
                borderColor: '#000000',
                borderWidth: 2.5,
                borderRadius: 24,
                shadowColor: '#000000',
                shadowOpacity: 1,
                shadowRadius: 0,
                shadowOffset: { width: 4, height: 4 },
                elevation: 0,
              },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: colors.ink, textAlign: 'center', alignSelf: 'stretch' }]}>Edit Profile</Text>
            <View style={{ height: 16 }} />
            <SheetField icon="user" hint="Full Name" value={name} onChange={setName} dark={isDark} />
            <View style={{ height: 12 }} />
            <SheetField icon="sparkle" hint="Username" value={username} onChange={setUsername} autoCapitalize="none" dark={isDark} />
            <View style={{ height: 6 }} />
            <Text style={[styles.sheetHint, { color: colors.muted }]}>
              3–16 chars · letters, numbers, _ — usernames are unique to you.
            </Text>
            <View style={{ height: 20 }} />
            <Pressable scale={0.98} onTap={() => void save()}>
              <LinearGradient colors={[AppColors.primary, AppColors.primaryDeep]} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>{busy ? 'Saving…' : 'Save Changes'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </CrossModal>
  );
}

function SheetField({
  icon,
  hint,
  value,
  onChange,
  autoCapitalize,
  dark,
}: {
  icon: string;
  hint: string;
  value: string;
  onChange: (t: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  dark: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: dark ? 'rgba(255,255,255,0.06)' : '#FFF7ED',
        borderRadius: 14,
        borderWidth: 2,
        borderColor: dark ? colors.glassEdge : '#00000022',
        paddingHorizontal: 12,
      }}
    >
      <StrokeIcon name={icon} size={18} color={AppColors.primary} />
      <View style={{ width: 10 }} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={hint}
        placeholderTextColor={colors.muted}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={[styles.sheetInput, { color: colors.ink }]}
      />
    </View>
  );
}

const PRIMARY_GLOW = {
  shadowColor: AppColors.primary,
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.3,
  shadowRadius: 14,
  elevation: 8,
  borderRadius: 999,
  alignSelf: 'stretch',
} as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  padX: { paddingHorizontal: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontFamily: fontFamilyFor('w900'), letterSpacing: -0.5 },
  settingsBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
    elevation: 3,
  },

  heroCard: {
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 5,
  },
  avatarTile: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  avatarInitials: { color: '#FFFFFF', fontSize: 28, fontFamily: fontFamilyFor('w800') },
  verifiedDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AppColors.success,
    borderWidth: 2.5,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: { fontSize: 22, fontFamily: fontFamilyFor('w900'), letterSpacing: -0.5 },
  handleText: { fontSize: 13.5, fontFamily: fontFamilyFor('w600') },

  rankPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  rankPillText: { fontSize: 12.5, fontFamily: fontFamilyFor('w800') },

  xpBlock: {
    alignSelf: 'stretch',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#00000018',
  },
  xpBlockLabel: { fontSize: 9, fontFamily: fontFamilyFor('w700'), letterSpacing: 0.8, color: 'rgba(148,163,184,0.9)' },
  xpBlockValue: { fontSize: 12, fontFamily: fontFamilyFor('w800') },
  levelTrack: {
    height: 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(148,163,184,0.25)',
  },
  toNextLevel: { fontSize: 11, fontFamily: fontFamilyFor('w600') },

  editButton: {
    height: 50,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  editButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: fontFamilyFor('w800') },

  statGrid2x2: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  statGridRow: { flexDirection: 'row' },
  statPill: {
    borderRadius: 18,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  statPillIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statPillValue: { fontSize: 16, lineHeight: 20, fontFamily: fontFamilyFor('w800'), letterSpacing: -0.4 },
  statPillLabel: { fontSize: 11, lineHeight: 14, fontFamily: fontFamilyFor('w600') },

  sectionSpacing: { paddingHorizontal: 16, marginBottom: 12, marginTop: 2 },
  plainCard: {
    borderRadius: 20,
    borderWidth: 2.5,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  cardTitle: { fontSize: 15, fontFamily: fontFamilyFor('w800') },
  verifiedPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: withAlpha(AppColors.success, 0.12),
  },
  verifiedPillText: { fontSize: 12, fontFamily: fontFamilyFor('w700'), color: AppColors.success },
  badgeCountText: { fontSize: 12, fontFamily: fontFamilyFor('w600') },

  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 2,
    marginRight: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  badgeChipText: { fontSize: 11, fontFamily: fontFamilyFor('w700') },

  providerTile: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountTitle: { fontSize: 14.5, fontFamily: fontFamilyFor('w800') },
  accountSubtitle: { fontSize: 12, fontFamily: fontFamilyFor('w600') },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },

  aboutLabel: { fontSize: 13.5, fontFamily: fontFamilyFor('w600') },
  aboutValue: { fontSize: 13.5, fontFamily: fontFamilyFor('w700') },
  signOutBtn: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: withAlpha(AppColors.error, 0.08),
    borderWidth: 2,
    borderColor: withAlpha(AppColors.error, 0.5),
  },
  signOutText: { fontSize: 14, fontFamily: fontFamilyFor('w700'), color: AppColors.error },

  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    maxHeight: '86%',
  },
  sheetTitle: { fontSize: 19, fontFamily: fontFamilyFor('w800') },
  sheetInput: { flex: 1, fontSize: 15, fontFamily: fontFamilyFor('w700'), paddingVertical: 14 },
  sheetHint: { fontSize: 11, fontFamily: fontFamilyFor('w600') },
  saveButton: {
    height: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 15, fontFamily: fontFamilyFor('w800') },
});

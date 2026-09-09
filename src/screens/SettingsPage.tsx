import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CrossModal } from '../components/CrossModal';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme/ThemeProvider';
import { AppColors, withAlpha } from '../theme/colors';
import { AppSpacing, GlassShadow } from '../theme/spacing';
import { fontFamilyFor } from '../theme/typography';
import { ThemeMode } from '../theme/ThemeProvider';
import { LiquidGlassCard } from '../components/LiquidGlass';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { useNav } from './navContext';
import { EditProfilePage } from './EditProfilePage';
import { useAppStore, selectIsDemo, selectIsSignedIn, clearOnboarding } from '../state/appStore';
import { useSettingsStore } from '../state/settingsStore';
import { useGateStore } from '../state/gateStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SupabaseServiceInstance } from '../services/supabase';
import { SupabaseRow } from '../services/config';

interface SearchUser {
  id: string;
  name: string;
  username: string;
}

function toRowOf(name: unknown, fallback = ''): string {
  return typeof name === 'string' && name.trim().length > 0 ? name : fallback;
}

function parseTime(hhmm: string): { hour: number; minute: number } | null {
  const parts = hhmm.split(':');
  if (parts.length !== 2) return null;
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function prettyTime(hhmm: string): string {
  const t = parseTime(hhmm);
  if (t == null) return hhmm;
  const period = t.hour >= 12 ? 'PM' : 'AM';
  let hour = t.hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(t.minute).padStart(2, '0')} ${period}`;
}

export default function SettingsScreen({ onClose }: { onClose?: () => void }) {
  const { isDark, colors } = useTheme();
  const nav = useNav();

  const themeMode = useSettingsStore((s) => s.themeMode);
  const haptics = useSettingsStore((s) => s.haptics);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const reminderTime = useSettingsStore((s) => s.reminderTime);
  const streakAlerts = useSettingsStore((s) => s.streakAlerts);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const setHaptics = useSettingsStore((s) => s.setHaptics);
  const setRemindersEnabled = useSettingsStore((s) => s.setRemindersEnabled);
  const setStreakAlerts = useSettingsStore((s) => s.setStreakAlerts);

  const isSignedIn = selectIsSignedIn();
  const isDemo = selectIsDemo();
  const displayName = useAppStore((s) => s.displayName);
  const username = useAppStore((s) => s.username);

  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const ink = colors.ink;
  const muted = colors.muted;

  const statusText = useMemo(() => {
    if (isSignedIn) return 'Progress synced';
    if (isDemo) return 'Private progress · sign in to sync';
    return 'Not signed in — sign in to sync';
  }, [isSignedIn, isDemo]);

  const statusColor = useMemo(() => {
    if (isSignedIn) return AppColors.success;
    if (isDemo) return AppColors.gold;
    return colors.muted;
  }, [isSignedIn, isDemo, colors.muted]);

  const switchColors = useMemo(
    () => ({
      trackFalse: colors.gaugeTrack,
      trackTrue: AppColors.primarySoft,
    }),
    [colors.gaugeTrack],
  );

  const confirmSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'Your local progress is saved. Sign in again anytime to re-sync.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              useSettingsStore.getState().tap();
              // Spec §2: global scope clears every client on device — prevents token leakage on shared devices
              try {
                if (supabase != null) await supabase.auth.signOut({ scope: 'global' });
              } catch (e) {
                console.warn('[signOut] supabase signOut failed', e);
              }
              await SupabaseServiceInstance.signOut();
              await useAppStore.getState().signOut();
              await clearOnboarding();
              // Clear any remaining SecureStore-adapter keys (belt-and-suspenders)
              await AsyncStorage.clear().catch(() => {});
              useGateStore.getState().resetGates();
              await useGateStore.getState().hydrate().catch(() => {});
              await useSettingsStore.getState().hydrate().catch(() => {});
              // Reset navigation stack — prevents back-button into app. Expo-router builds would do router.replace('/auth/login')
              // Classic entry (App.tsx) re-renders to Login via isSignedIn === false, so no explicit nav needed.
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const router = require('expo-router').router as { replace: (p: string) => void } | undefined;
                router?.replace('/auth/login');
              } catch {}
              if (onClose != null) onClose();
              nav.toast('Signed out');
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert('Sign out failed', msg || 'Check your connection and try again.');
            }
          })();
        },
      },
    ]);
  }, [nav, onClose]);

  /** Permanent account deletion: backend RPC delete_user_account + full local wipe + landing reset. */
  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account?',
      'Are you sure? This action is permanent and will delete all your XP, streaks, and profile data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                // Step 3B: call the secure RPC — throws if unauthenticated or network fails
                const res = await (async () => {
                  if (supabase != null) return await supabase.rpc('delete_user_account');
                  // Fallback via service
                  try {
                    await SupabaseServiceInstance.deleteAccount();
                    return { error: null as unknown };
                  } catch (e) {
                    return { error: e as unknown };
                  }
                })();
                if ((res as { error?: unknown })?.error != null) {
                  const err = (res as { error: { message?: string } }).error;
                  const msg = err?.message ?? String(err);
                  // Surface failure — do not wipe local data if the server rejected deletion
                  if (msg.toLowerCase().includes('not authenticated')) {
                    Alert.alert('Not signed in', 'Please sign in to delete your account.');
                    return;
                  }
                  Alert.alert('Delete failed', msg || 'Check your connection and try again.');
                  return;
                }
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                Alert.alert('Delete failed', msg || 'Check your connection and try again.');
                return;
              }
              // On success: full local wipe + gated landing reset
              try {
                await SupabaseServiceInstance.signOut();
              } catch {}
              await AsyncStorage.clear().catch(() => {});
              await useAppStore.getState().signOut();
              await clearOnboarding();
              useGateStore.getState().resetGates();
              await useGateStore.getState().hydrate().catch(() => {});
              await useSettingsStore.getState().hydrate().catch(() => {});
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const router = require('expo-router').router as { replace: (p: string) => void } | undefined;
                router?.replace('/intro');
              } catch {}
              if (onClose != null) onClose();
              nav.toast('Account deleted');
            })();
          },
        },
      ],
    );
  }, [nav, onClose]);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable onTap={() => (onClose != null ? onClose() : nav.toast('Back'))}>
          <View
            style={[
              styles.backButton,
              {
                backgroundColor: isDark ? AppColors.glassDark : AppColors.glassLight,
                borderColor: AppColors.glassEdge,
              },
              GlassShadow,
            ]}
          >
            <StrokeIcon name="chevronLeft" size={20} color={muted} strokeWidth={2} />
          </View>
        </Pressable>
        <View style={{ width: 12 }} />
        <Text style={[styles.headerTitle, { color: ink }]}>Settings</Text>
      </View>

      {/* ── Appearance ─────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: muted }]}>APPEARANCE</Text>
      <SectionCard>
        <View style={styles.themeHeader}>
          <RowIcon icon="sparkle" />
          <View style={{ width: 12 }} />
          <Label title="Theme" subtitle="Pick a look for Qubi" ink={ink} muted={muted} />
        </View>
        <View style={styles.segmentWrap}>
          {(
            [
              ['light', 'Light', 'sun'],
              ['system', 'Auto', 'moonStar'],
              ['dark', 'Dark', 'moon'],
            ] as const
          ).map(([mode, label, icon]) => {
            const active = themeMode === mode;
            return (
              <View key={mode} style={styles.segmentCell}>
                <Pressable onTap={() => void setThemeMode(mode as ThemeMode)}>
                  <View
                    style={[
                      styles.segmentItem,
                      {
                        backgroundColor: active ? AppColors.primary : withAlpha(AppColors.primary, 0),
                        borderColor: active ? AppColors.primary : AppColors.glassEdge,
                      },
                      active ? null : { backgroundColor: colors.surfaceLowest },
                    ]}
                  >
                    <StrokeIcon name={icon} size={16} color={active ? '#FFFFFF' : muted} strokeWidth={2} />
                    <View style={{ height: 4 }} />
                    <Text
                      style={[
                        styles.segmentLabel,
                        { color: active ? '#FFFFFF' : ink },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </SectionCard>

      {/* ── Feedback ───────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: muted }]}>FEEDBACK</Text>
      <SectionCard>
        <Row icon="zap" title="Haptics" subtitle="Tactile taps & celebration buzz" ink={ink} muted={muted}>
          <Switch
            value={haptics}
            trackColor={{ false: switchColors.trackFalse, true: switchColors.trackTrue }}
            thumbColor={haptics ? AppColors.primary : colors.surfaceHigh}
            ios_backgroundColor={switchColors.trackFalse}
            onValueChange={(v) => void setHaptics(v)}
          />
        </Row>
        <Divider />
        <Row
          icon="bell"
          title="Daily Reminder"
          subtitle={remindersEnabled ? `Remind me at ${reminderTime}` : 'Notifications off'}
          ink={ink}
          muted={muted}
        >
          <Switch
            value={remindersEnabled}
            trackColor={{ false: switchColors.trackFalse, true: switchColors.trackTrue }}
            thumbColor={remindersEnabled ? AppColors.primary : colors.surfaceHigh}
            ios_backgroundColor={switchColors.trackFalse}
            onValueChange={(v) => void setRemindersEnabled(v)}
          />
        </Row>
        {remindersEnabled ? (
          <>
            <Divider />
            <Row
              icon="clock"
              title="Reminder Time"
              subtitle="Quest nudge every day"
              ink={ink}
              muted={muted}
            >
              <Pressable onTap={() => setTimeSheetOpen(true)}>
                <View
                  style={[
                    styles.pillChip,
                    { backgroundColor: colors.surfaceLowest, borderColor: AppColors.glassEdge },
                  ]}
                >
                  <Text style={[styles.pillChipTextPrimary, { color: AppColors.primaryDeep }]}>
                    {prettyTime(reminderTime)}
                  </Text>
                </View>
              </Pressable>
            </Row>
          </>
        ) : null}
        <Divider />
        <Row
          icon="flame"
          title="Streak Alerts"
          subtitle="Warn me before my streak slips"
          ink={ink}
          muted={muted}
        >
          <Switch
            value={streakAlerts}
            trackColor={{ false: switchColors.trackFalse, true: switchColors.trackTrue }}
            thumbColor={streakAlerts ? AppColors.primary : colors.surfaceHigh}
            ios_backgroundColor={switchColors.trackFalse}
            onValueChange={(v) => void setStreakAlerts(v)}
          />
        </Row>
      </SectionCard>

      {/* Friends moved to the main Friends tab — Settings stays focused on
          Account Security, Notifications, Theme and Privacy. */}

      {/* ── Data ───────────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: muted }]}>DATA</Text>
      <SectionCard>
        <Row
          icon="trash"
          title="Clear Image Cache"
          subtitle="Free up space from proof photos"
          ink={ink}
          muted={muted}
        >
          <Pressable onTap={() => void useSettingsStore.getState().clearCache()}>
            <View
              style={[
                styles.pillChipAccent,
                { backgroundColor: withAlpha(AppColors.primary, 0.1), borderColor: withAlpha(AppColors.primary, 0.4) },
              ]}
            >
              <Text style={[styles.pillChipText, { color: ink }]}>Clear</Text>
            </View>
          </Pressable>
        </Row>
        <Divider />
        <Pressable
          onTap={() => {
            useAppStore.getState().resetOnboardingForReplay();
            if (onClose != null) onClose();
          }}
        >
          <Row
            icon="replay"
            title="Replay Onboarding"
            subtitle="Walk through the 17-step wizard again"
            ink={ink}
            muted={muted}
            trailing={<StrokeIcon name="chevronRight" size={20} color={muted} />}
          />
        </Pressable>
      </SectionCard>

      {/* ── Account ────────────────────────────────────────────── */}
      <Text style={[styles.sectionTitle, { color: muted }]}>ACCOUNT</Text>
      <SectionCard>
        <Pressable onTap={() => setProfileOpen(true)}>
          <Row
            icon="user"
            title="Edit Profile"
            subtitle="Name & @username"
            ink={ink}
            muted={muted}
            trailing={<StrokeIcon name="chevronRight" size={20} color={muted} />}
          />
        </Pressable>
        <Divider />
        <Row icon="shield" title="Sync" subtitle={statusText} ink={ink} muted={muted}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: statusColor, shadowColor: statusColor },
            ]}
          />
        </Row>
        <Divider />
        <Row icon="info" title="App Version" subtitle="Qubi 1.0.0" ink={ink} muted={muted}>
          <Text style={[styles.versionText, { color: AppColors.primaryDeep }]}>1.0.0</Text>
        </Row>
      </SectionCard>

      <View style={{ height: 16 }} />

      {/* Sign out */}
      <View style={styles.signOutWrap}>
        <Pressable onTap={confirmSignOut}>
          <View
            style={[
              styles.signOutButton,
              { backgroundColor: withAlpha(AppColors.error, 0.08), borderColor: withAlpha(AppColors.error, 0.5) },
            ]}
          >
            <Text style={[styles.signOutText, { color: AppColors.error }]}>Sign Out</Text>
          </View>
        </Pressable>
      </View>

      {/* Account Security */}
      <View style={{ height: 24 }} />
      <Text style={[styles.securityHeader, { color: colors.muted }]}>ACCOUNT SECURITY</Text>
      <View style={{ height: 8 }} />
      <Pressable onTap={confirmDeleteAccount}>
        <View
          style={[
            styles.deleteRow,
            { backgroundColor: colors.surfaceLowest, borderColor: withAlpha('#EF4444', 0.35) },
          ]}
        >
          <View style={[styles.deleteIconTile, { backgroundColor: withAlpha('#EF4444', 0.12) }]}>
            <StrokeIcon name="alert" size={18} color="#EF4444" strokeWidth={2.3} />
          </View>
          <View style={styles.flex1}>
            <Text numberOfLines={1} style={[styles.deleteTitle, { color: '#EF4444' }]}>
              Delete Account
            </Text>
            <Text numberOfLines={1} style={[styles.deleteSubtitle, { color: colors.muted }]}>
              Permanently wipe streaks, XP & history
            </Text>
          </View>
          <StrokeIcon name="chevronRight" size={15} color="#EF4444" strokeWidth={2.4} />
        </View>
      </Pressable>

      <View style={{ height: 130 }} />

      {/* ── Sheets ─────────────────────────────────────────────── */}
      <TimeSheet
        visible={timeSheetOpen}
        initial={parseTime(reminderTime) ?? { hour: 8, minute: 0 }}
        onClose={() => setTimeSheetOpen(false)}
        onSave={(hhmm) => {
          void useSettingsStore.getState().setReminderTime(hhmm);
          setTimeSheetOpen(false);
        }}
      />
      <SearchSheet visible={searchOpen} onClose={() => setSearchOpen(false)} />
      <EditProfilePage visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </ScrollView>
  );
}

/* ── Shared pieces ─────────────────────────────────────────── */

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionWrap}>
      <LiquidGlassCard padding={4}>
        <View>{children}</View>
      </LiquidGlassCard>
    </View>
  );
}

function RowIcon({ icon }: { icon: Parameters<typeof StrokeIcon>[0]['name'] }) {
  return (
    <View style={styles.rowIconBox}>
      <StrokeIcon name={icon} size={18} color={AppColors.muted} strokeWidth={2} />
    </View>
  );
}

function Label({
  title,
  subtitle,
  ink,
  muted,
}: {
  title: string;
  subtitle?: string;
  ink: string;
  muted: string;
}) {
  return (
    <View style={styles.flex}>
      <Text style={[styles.rowTitle, { color: ink }]}>{title}</Text>
      {subtitle != null ? (
        <>
          <View style={{ height: 2 }} />
          <Text style={[styles.rowSubtitle, { color: muted }]}>{subtitle}</Text>
        </>
      ) : null}
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  ink,
  muted,
  trailing,
  children,
}: {
  icon: Parameters<typeof StrokeIcon>[0]['name'];
  title: string;
  subtitle?: string;
  ink: string;
  muted: string;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <RowIcon icon={icon} />
      <View style={{ width: 12 }} />
      <Label title={title} subtitle={subtitle} ink={ink} muted={muted} />
      <View style={{ width: 8 }} />
      {children ?? trailing}
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.divider,
        { backgroundColor: colors.border },
      ]}
    />
  );
}

/* ── Time picker sheet (steppers — no native time picker dep) ─ */

const MINUTE_STEP = 5;

function TimeSheet({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: { hour: number; minute: number };
  onClose: () => void;
  onSave: (hhmm: string) => void;
}) {
  const { isDark, colors } = useTheme();
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  React.useEffect(() => {
    if (visible) {
      setHour(initial.hour);
      setMinute(initial.minute);
    }
  }, [visible, initial.hour, initial.minute]);

  const bumpHour = (delta: number) =>
    setHour((h) => (((h + delta) % 24) + 24) % 24);
  const bumpMinute = (delta: number) =>
    setMinute((m) => (((m + delta / MINUTE_STEP) % (60 / MINUTE_STEP)) + 60 / MINUTE_STEP) % (60 / MINUTE_STEP));

  return (
    <CrossModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
        <Pressable onTap={onClose} scale={1}>
          <View style={styles.flex} />
        </Pressable>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? AppColors.glassDark : AppColors.glassLight,
              borderColor: AppColors.glassEdge,
            },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={[styles.grabber, { backgroundColor: withAlpha(colors.muted, 0.3) }]} />
          </View>
          <Text style={[styles.sheetTitle, { color: colors.ink }]}>Daily Reminder</Text>
          <View style={{ height: 16 }} />
          <Stepper
            label="Hour"
            value={String(hour).padStart(2, '0')}
            onDecrement={() => bumpHour(-1)}
            onIncrement={() => bumpHour(1)}
          />
          <View style={{ height: 12 }} />
          <Stepper
            label="Minute"
            value={String(minute).padStart(2, '0')}
            onDecrement={() => bumpMinute(-MINUTE_STEP)}
            onIncrement={() => bumpMinute(MINUTE_STEP)}
          />
          <View style={{ height: 20 }} />
          <Pressable onTap={() => onSave(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheetCta}
            >
              <Text style={styles.sheetCtaText}>Save Time</Text>
            </LinearGradient>
          </Pressable>
          <View style={{ height: 4 }} />
        </View>
      </KeyboardAvoidingView>
    </CrossModal>
  );
}

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: colors.surfaceLowest, borderColor: AppColors.glassEdge }]}>
      <Text style={[styles.stepperLabel, { color: colors.muted }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Pressable onTap={onDecrement}>
        <View style={[styles.stepperBtn, { backgroundColor: colors.surfaceContainer }]}>
          <StrokeIcon name="minus" size={18} color={colors.ink} strokeWidth={2.4} />
        </View>
      </Pressable>
      <View style={{ width: 14 }} />
      <Text style={[styles.stepperValue, { color: AppColors.primaryDeep }]}>{value}</Text>
      <View style={{ width: 14 }} />
      <Pressable onTap={onIncrement}>
        <View style={[styles.stepperBtn, { backgroundColor: colors.surfaceContainer }]}>
          <StrokeIcon name="plus" size={18} color={colors.ink} strokeWidth={2.4} />
        </View>
      </Pressable>
    </View>
  );
}

/* ── Search sheet ──────────────────────────────────────────── */

function SearchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDark, colors } = useTheme();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length === 0) return;
    setLoading(true);
    setSearched(true);
    try {
      const rows: SupabaseRow[] = await SupabaseServiceInstance.searchUsers(q);
      setResults(
        rows.map((r) => ({
          id: toRowOf(r['id']),
          name: toRowOf(r['display_name'], toRowOf(r['username'])),
          username: toRowOf(r['username']),
        })),
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <CrossModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
        <View
          style={[
            styles.sheetTall,
            {
              backgroundColor: isDark ? AppColors.glassDark : AppColors.glassLight,
              borderColor: AppColors.glassEdge,
            },
          ]}
        >
          <View style={styles.grabberWrap}>
            <View style={[styles.grabber, { backgroundColor: withAlpha(colors.muted, 0.3) }]} />
          </View>
          <Text style={[styles.sheetTitleLg, { color: colors.ink }]}>Find Players</Text>
          <View style={{ height: 14 }} />
          <View
            style={[
              styles.searchField,
              { backgroundColor: colors.surfaceLowest, borderColor: AppColors.glassEdge },
            ]}
          >
            <View style={styles.searchFieldIcon}>
              <StrokeIcon name="search" size={18} color={AppColors.primary} />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by username..."
              placeholderTextColor={colors.muted}
              autoFocus
              onSubmitEditing={() => void search()}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.ink }]}
            />
          </View>
          <View style={{ height: 14 }} />
          <Pressable onTap={() => void search()}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchCta}
            >
              <Text style={styles.sheetCtaText}>Search</Text>
            </LinearGradient>
          </Pressable>
          <View style={{ height: 14 }} />
          <View style={styles.flex}>
            {loading ? (
              <ActivityIndicator color={AppColors.primary} />
            ) : results.length === 0 && searched ? (
              <View style={styles.emptyState}>
                <StrokeIcon name="search" size={32} color={AppColors.muted} />
                <View style={{ height: 10 }} />
                <Text style={[styles.emptyTitleSm, { color: colors.ink }]}>No players found</Text>
                <View style={{ height: 4 }} />
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Try a different username.</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {results.map((user) => (
                  <SearchResultRow key={user.id || user.username} user={user} onToast={nav.toast} />
                ))}
              </ScrollView>
            )}
          </View>
          <View style={{ height: 24 }} />
        </View>
      </KeyboardAvoidingView>
    </CrossModal>
  );
}

function SearchResultRow({
  user,
  onToast,
}: {
  user: SearchUser;
  onToast: (msg: string) => void;
}) {
  const { colors } = useTheme();
  const initial = user.name.length > 0 ? user.name[0].toUpperCase() : '?';
  return (
    <View
      style={[
        styles.resultRow,
        { backgroundColor: colors.surfaceLowest, borderColor: AppColors.glassEdge },
      ]}
    >
      <View style={styles.resultAvatar}>
        <Text style={styles.resultAvatarText}>{initial}</Text>
      </View>
      <View style={{ width: 10 }} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.resultName, { color: colors.ink }]}>
          {user.name}
        </Text>
        <Text style={[styles.resultUsername, { color: colors.muted }]}>@{user.username}</Text>
      </View>
      <Pressable
        onTap={
          user.id.length === 0
            ? () => {}
            : async () => {
                try {
                  await SupabaseServiceInstance.sendFriendRequest(user.id);
                  onToast('Friend request sent!');
                } catch {
                  onToast('Could not send request.');
                }
              }
        }
      >
        <View
          style={[
            styles.addPill,
            { backgroundColor: withAlpha(AppColors.primary, 0.1), borderColor: withAlpha(AppColors.primary, 0.4) },
          ]}
        >
          <Text style={styles.addPillText}>Add</Text>
        </View>
      </Pressable>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  securityHeader: {
    marginHorizontal: 20,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.4,
    fontFamily: fontFamilyFor('w800'),
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  deleteIconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
  deleteSubtitle: { fontSize: 12, lineHeight: 16, marginTop: 2, fontFamily: fontFamilyFor('w500') },
  flex: { flex: 1 },
  scrollContent: { paddingTop: 8, paddingHorizontal: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: AppSpacing.radiusSm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontFamily: fontFamilyFor('w800'),
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: fontFamilyFor('w800'),
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionWrap: { marginHorizontal: 16 },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  segmentWrap: {
    flexDirection: 'row',
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 8,
    paddingBottom: 14,
  },
  segmentCell: { flex: 1, paddingHorizontal: 3 },
  segmentItem: {
    borderWidth: 1.2,
    borderRadius: AppSpacing.radiusSm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: AppColors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  rowSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    fontFamily: fontFamilyFor('w500'),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
    marginRight: 14,
  },
  pillChip: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: AppSpacing.radiusPill,
    borderWidth: 1,
  },
  pillChipAccent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: AppSpacing.radiusPill,
    borderWidth: 1.2,
  },
  pillChipText: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  pillChipTextPrimary: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  versionText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  signOutWrap: { marginHorizontal: 16 },
  signOutButton: {
    height: 50,
    borderRadius: AppSpacing.radiusSm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: AppSpacing.radiusSheet,
    borderTopRightRadius: AppSpacing.radiusSheet,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  sheetTall: {
    height: '60%',
    borderTopLeftRadius: AppSpacing.radiusSheet,
    borderTopRightRadius: AppSpacing.radiusSheet,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetProfile: {
    borderTopLeftRadius: AppSpacing.radiusSheet,
    borderTopRightRadius: AppSpacing.radiusSheet,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  grabberWrap: { alignItems: 'center', marginBottom: 14 },
  grabber: { width: 36, height: 4, borderRadius: 2 },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  sheetTitleMd: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  sheetTitleLg: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  sheetSubtitle: {
    fontSize: 12.5,
    fontWeight: '400',
    fontFamily: fontFamilyFor('w500'),
  },
  sheetCta: {
    height: 48,
    borderRadius: AppSpacing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppSpacing.radiusSoft,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fontFamilyFor('w600'),
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  emptyTitleSm: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: fontFamilyFor('w500'),
    textAlign: 'center',
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppSpacing.radiusSoft,
    borderWidth: 1,
  },
  searchFieldIcon: { paddingLeft: 14, paddingRight: 6, paddingVertical: 13 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
    paddingVertical: 14,
    paddingRight: 14,
  },
  searchCta: {
    height: 48,
    borderRadius: AppSpacing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppSpacing.radiusSoft,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  resultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(AppColors.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
    color: AppColors.primary,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
  },
  resultUsername: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: fontFamilyFor('w500'),
  },
  addPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: AppSpacing.radiusPill,
    borderWidth: 1,
  },
  addPillText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: fontFamilyFor('w800'),
    color: AppColors.primaryDeep,
  },
  editField: {
    borderRadius: AppSpacing.radiusSm,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fontFamilyFor('w600'),
  },
  editHint: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fontFamilyFor('w600'),
  },
  saveButton: {
    height: 54,
    borderRadius: AppSpacing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
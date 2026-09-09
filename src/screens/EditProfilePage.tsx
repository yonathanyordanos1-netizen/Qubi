/**
 * Edit Profile — Instagram-style full-screen editor.
 * Clean centered avatar with color swatches, hairline-separated NAME/USERNAME
 * fields with live availability, and server-enforced change limits surfaced
 * in the UI: name once a week, username once a month. Saves through the
 * `update_profile_identity` RPC so the limits can't be bypassed.
 */

import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CrossModal } from '../components/CrossModal';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { avatarColors, selectInitials, useAppStore } from '../state/appStore';
import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { useTheme } from '../theme/ThemeProvider';
import { SupabaseServiceInstance } from '../services/supabase';
import { useNav } from './navContext';

const DAY_MS = 86_400_000;
const NAME_COOLDOWN_MS = 7 * DAY_MS;
const USERNAME_COOLDOWN_MS = 30 * DAY_MS;
const PALETTE_KEYS = ['sun', 'ocean', 'grape', 'forest', 'ember', 'sky'];

function cooldownInfo(changedAt: string | null, windowMs: number): { locked: boolean; label: string } {
  if (changedAt == null) return { locked: false, label: '' };
  const unlock = Date.parse(changedAt) + windowMs;
  if (Number.isNaN(unlock)) return { locked: false, label: '' };
  if (Date.now() >= unlock) return { locked: false, label: '' };
  const days = Math.max(1, Math.ceil((unlock - Date.now()) / DAY_MS));
  return { locked: true, label: `You can change this again in ${days} day${days === 1 ? '' : 's'}.` };
}

export function EditProfilePage({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDark, colors } = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();

  const displayName = useAppStore((s) => s.displayName);
  const username = useAppStore((s) => s.username);
  const avatar = useAppStore((s) => s.avatar);
  const nameChangedAt = useAppStore((s) => s.nameChangedAt);
  const usernameChangedAt = useAppStore((s) => s.usernameChangedAt);
  const setAvatar = useAppStore((s) => s.setAvatar);
  const initials = useAppStore(selectInitials);

  const [name, setName] = useState(displayName);
  const [user, setUser] = useState(username.replace(/^@/, ''));
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const checkDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setName(displayName);
      setUser(username.replace(/^@/, ''));
      setAvailability('idle');
      setBusy(false);
    }
  }, [visible, displayName, username]);

  const cleanUser = user.trim().toLowerCase().replace(/^@/, '');
  const validUser = /^[a-z0-9_]{3,16}$/.test(cleanUser);
  const baseUser = username.replace(/^@/, '').toLowerCase();

  useEffect(() => {
    return () => {
      if (checkDebounce.current != null) clearTimeout(checkDebounce.current);
    };
  }, []);

  useEffect(() => {
    if (checkDebounce.current != null) clearTimeout(checkDebounce.current);
    checkDebounce.current = null;
    if (!validUser) {
      setAvailability(cleanUser.length === 0 ? 'idle' : 'invalid');
      return;
    }
    if (cleanUser === baseUser) {
      setAvailability('idle');
      return;
    }
    setAvailability('checking');
    checkDebounce.current = setTimeout(async () => {
      const available = await SupabaseServiceInstance.usernameAvailable(cleanUser);
      setAvailability(available ? 'ok' : 'taken');
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanUser, validUser, baseUser]);

  const nameChanged = name.trim() !== displayName;
  const usernameChanged = cleanUser !== baseUser;
  const nameCooldown = cooldownInfo(nameChangedAt, NAME_COOLDOWN_MS);
  const userCooldown = cooldownInfo(usernameChangedAt, USERNAME_COOLDOWN_MS);

  const doneEnabled =
    !busy &&
    name.trim().length > 0 &&
    name.trim().length <= 32 &&
    validUser &&
    !(nameChanged && nameCooldown.locked) &&
    !(usernameChanged && userCooldown.locked) &&
    !(availability === 'taken' || availability === 'checking') &&
    (nameChanged || usernameChanged || availability === 'ok');

  const save = async () => {
    if (!doneEnabled || busy) return;
    setBusy(true);
    const error = await useAppStore.getState().setProfile({ name: name.trim(), username: cleanUser });
    setBusy(false);
    if (error != null) {
      nav.toast(error);
      setName(displayName);
      setUser(username.replace(/^@/, ''));
      return;
    }
    onClose();
  };

  const palette = avatarColors(avatar);
  const activeSwatch = PALETTE_KEYS.includes(avatar) ? avatar : 'sun';
  const backdrop = isDark ? '#0D0A08' : '#FAFAFA';
  const fieldBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const div = colors.glassEdge;

  return (
    <CrossModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { backgroundColor: backdrop, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: div }]}>
          <Pressable scale={0.97} onTap={onClose}>
            <Text style={[styles.headerCancel, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.ink }]}>Edit Profile</Text>
          <Pressable scale={0.97} onTap={doneEnabled && !busy ? () => void save() : null}>
            <Text style={[styles.headerDone, { color: doneEnabled ? AppColors.primary : withAlpha(AppColors.primary, 0.35) }]}>
              {busy ? 'Saving…' : 'Done'}
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.hero}>
              <View style={[styles.avatar, { backgroundColor: palette[0] }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.swatches}>
                {PALETTE_KEYS.map((key) => {
                  const pal = avatarColors(key);
                  const active = key === activeSwatch;
                  return (
                    <Pressable key={key} scale={0.92} onTap={() => setAvatar(key)}>
                      <View style={[styles.swatch, { backgroundColor: pal[0] }, active && styles.swatchActive]}>
                        {active ? <StrokeIcon name="check" size={11} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.avatarHint, { color: colors.muted }]}>Tap a color to update your avatar</Text>
            </View>

            <View style={[styles.fieldGroup, { backgroundColor: fieldBg, borderColor: div }]}>
              <View style={[styles.field, { borderBottomColor: div }]}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>Name</Text>
                  {nameChanged && nameCooldown.locked ? (
                    <View style={styles.fieldFlag}>
                      <StrokeIcon name="lock" size={10} color={colors.muted} strokeWidth={2.5} />
                    </View>
                  ) : null}
                </View>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.mutedSoft}
                  autoCapitalize="words"
                  editable={!busy}
                  style={[styles.input, { color: colors.ink }]}
                />
                <Text numberOfLines={2} style={[styles.helper, { color: nameChanged && nameCooldown.locked ? AppColors.error : colors.muted }]}>
                  {nameChanged && nameCooldown.locked ? `Locked — ${nameCooldown.label}` : 'You can change your name once a week.'}
                </Text>
              </View>

              <View style={styles.field}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>Username</Text>
                  <View style={styles.counter}>
                    <Text style={[styles.counterText, { color: colors.muted }]}>{cleanUser.length}/16</Text>
                  </View>
                </View>
                <View style={styles.usernameRow}>
                  <Text style={[styles.at, { color: colors.muted }]}>@</Text>
                  <TextInput
                    value={user}
                    onChangeText={setUser}
                    placeholder="username"
placeholderTextColor={colors.mutedSoft}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    style={[styles.input, styles.inputUsername, { color: colors.ink }]}
                  />
                </View>
                <View style={styles.helperRow}>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.helper,
                      { color: statusColor(availability, userCooldown.locked && usernameChanged) },
                    ]}
                  >
                    {usernameChanged && userCooldown.locked
                      ? `Locked — ${userCooldown.label}`
                      : availability === 'checking'
                        ? 'Checking availability…'
                        : availability === 'ok'
                          ? 'Available — looks great!'
                          : availability === 'taken'
                            ? 'That one’s taken. Try another.'
                            : availability === 'invalid'
                              ? '3–16 chars · letters, numbers and underscores only.'
                              : 'You can change your username once a month.'}
                  </Text>
                  {usernameChanged && userCooldown.locked ? (
                    <View style={[styles.fieldFlag, { marginLeft: 6 }]}>
                      <StrokeIcon name="lock" size={10} color={AppColors.error} strokeWidth={2.5} />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </CrossModal>
  );
}

function statusColor(availability: 'idle' | 'checking' | 'ok' | 'taken' | 'invalid', locked: boolean): string {
  if (locked) return AppColors.error;
  if (availability === 'ok') return AppColors.secondary;
  if (availability === 'taken' || availability === 'invalid') return AppColors.error;
  return AppColors.muted;
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  page: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCancel: { fontSize: 16, fontFamily: fontFamilyFor('w500') },
  headerTitle: { fontSize: 16, fontFamily: fontFamilyFor('w700') },
  headerDone: { fontSize: 16, fontFamily: fontFamilyFor('w700') },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  hero: { alignItems: 'center', paddingTop: 26, paddingBottom: 8 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontFamily: fontFamilyFor('w800'), color: '#FFFFFF' },
  swatches: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 12 },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderWidth: 2, borderColor: '#FFFFFF' },
  avatarHint: { fontSize: 12, fontFamily: fontFamilyFor('w400'), marginTop: 10 },
  fieldGroup: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 22,
    overflow: 'hidden',
  },
  field: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: { fontSize: 12, fontFamily: fontFamilyFor('w600'), letterSpacing: 0.6, textTransform: 'uppercase' },
  fieldFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    fontFamily: fontFamilyFor('w500'),
    paddingVertical: 8,
  },
  inputUsername: { paddingLeft: 0 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  at: { fontSize: 16, fontFamily: fontFamilyFor('w500'), marginRight: 4 },
  counter: {},
  counterText: { fontSize: 11, fontFamily: fontFamilyFor('w500') },
  helper: {
    fontSize: 12,
    fontFamily: fontFamilyFor('w400'),
    lineHeight: 16,
    marginTop: 2,
  },
  helperRow: { flexDirection: 'row', alignItems: 'flex-start' },
});
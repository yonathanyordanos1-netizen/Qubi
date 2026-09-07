/**
 * Mandatory identity setup — shown once right after auth for new accounts.
 * Collects Full Name + unique @username (live availability check), upserts to
 * the profile, then launches into the dashboard.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme/ThemeProvider';
import { AppColors, withAlpha } from '../theme/colors';
import { body, fontFamilyFor } from '../theme/typography';
import { BrandLogo } from '../components/common/BrandLogo';
import { Pressable } from '../components/Pressable';
import { useAppStore } from '../state/appStore';
import { SupabaseServiceInstance } from '../services/supabase';
import { AppConfig } from '../services/config';

type HandleState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function ProfileSetupScreen({ onComplete }: { onComplete: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const storeName = useAppStore((s) => s.displayName);

  const [name, setName] = useState(storeName);
  const [handle, setHandle] = useState('');
  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanHandle = handle.replace(/^@/, '').toLowerCase();
  const onlineReady = AppConfig.supabaseConfigured;

  useEffect(() => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    if (cleanHandle.length < 3) {
      setHandleState(cleanHandle.length === 0 ? 'idle' : 'invalid');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanHandle)) {
      setHandleState('invalid');
      return;
    }
    if (!onlineReady) {
      setHandleState('available'); // offline/demo accepts locally
      return;
    }
    setHandleState('checking');
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const available = await SupabaseServiceInstance.usernameAvailable(cleanHandle);
          setHandleState(available === false ? 'taken' : 'available');
        } catch {
          setHandleState('checking');
        }
      })();
    }, 500);
    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    };
  }, [cleanHandle, onlineReady]);

  const canSubmit =
    name.trim().length >= 2 &&
    (handleState === 'available' || (!onlineReady && cleanHandle.length >= 3)) &&
    !busy;

  const completeSetup = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await SupabaseServiceInstance.upsertProfileStrict({ username: cleanHandle, display_name: name.trim() });
      if (!result.ok) {
        setMessage(result.error ?? 'Could not save your profile — try again.');
        return;
      }
      useAppStore.setState({ username: cleanHandle, displayName: name.trim() });
      onComplete();
    } catch {
      setMessage('Could not save your profile — try again.');
    } finally {
      setBusy(false);
    }
  }, [canSubmit, cleanHandle, name, onComplete]);

  const hint = (): { text: string; color: string } => {
    switch (handleState) {
      case 'checking':
        return { text: 'Checking availability…', color: AppColors.mutedLight };
      case 'available':
        return { text: `@${cleanHandle} is available ✓`, color: '#185FA5' };
      case 'taken':
        return { text: `@${cleanHandle} is already taken`, color: '#EF4444' };
      case 'invalid':
        return cleanHandle.length === 0
          ? { text: 'Choose a unique handle — friends find you by it.', color: colors.muted }
          : { text: '3+ characters: letters, numbers and underscores.', color: '#D97706' };
      default:
        return { text: 'Choose a unique handle — friends find you by it.', color: colors.muted };
    }
  };
  const h = hint();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, { paddingTop: Math.max(32, insets.top + 24), paddingBottom: Math.max(24, insets.bottom + 12) }]}>
        <BrandLogo size={48} />
        <View style={{ height: 20 }} />
        <Text style={{ fontFamily: fontFamilyFor('w900'), fontSize: 28, lineHeight: 34, letterSpacing: -1, color: colors.ink }}>
          Claim your identity.
        </Text>
        <View style={{ height: 8 }} />
        <Text style={{ ...body({ color: colors.muted }), fontSize: 15, lineHeight: 21 }}>
          Friends find and add you by your @handle. Pick one you will keep.
        </Text>

        <View style={{ height: 26 }} />

        <Text style={{ ...body({ color: colors.muted }), fontSize: 12.5, lineHeight: 17, marginBottom: 7 }}>FULL NAME</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surfaceContainer, borderColor: withAlpha(colors.ink, 0.1) }]}>
          <TextInput value={name} onChangeText={setName} placeholder="Alex Rivera" placeholderTextColor={AppColors.mutedLight} autoComplete="name" maxLength={32} style={[styles.input, { color: colors.ink }]} />
        </View>

        <View style={{ height: 16 }} />

        <Text style={{ ...body({ color: colors.muted }), fontSize: 12.5, lineHeight: 17, marginBottom: 7 }}>USERNAME</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surfaceContainer, borderColor: handleBorderColor(handleState) }]}>
          <Text style={{ fontFamily: fontFamilyFor('w700'), fontSize: 15, color: colors.muted }}>@</Text>
          <TextInput value={handle} onChangeText={(t) => setHandle(t.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="alex_fit" placeholderTextColor={AppColors.mutedLight} autoCapitalize="none" autoCorrect={false} maxLength={16} style={[styles.input, { color: colors.ink }]} />
        </View>
        <View style={{ height: 6 }} />
        <Text numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 17, fontWeight: '600', fontFamily: fontFamilyFor('w600'), color: h.color }}>
          {h.text}
        </Text>
        {message != null ? (
          <>
            <View style={{ height: 10 }} />
            <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: '#EF4444', fontFamily: fontFamilyFor('w600') }}>
              {message}
            </Text>
          </>
        ) : null}

        <View style={{ height: 26 }} />
        <Pressable onTap={() => void completeSetup()} scale={canSubmit ? 0.97 : 1}>
          <LinearGradient
            colors={canSubmit ? [AppColors.primary, AppColors.primaryDeep] : ['#9CA3AF', '#9CA3AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            <Text style={{ fontFamily: fontFamilyFor('w800'), fontSize: 16, lineHeight: 21, letterSpacing: -0.3, color: '#fff' }}>
              {busy ? 'Saving…' : 'Complete Setup'}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function handleBorderColor(state: HandleState): string {
  if (state === 'taken' || state === 'invalid') return withAlpha('#EF4444', 0.5);
  if (state === 'available') return withAlpha(AppColors.rewardBlue, 0.55);
  return withAlpha('#000000', 0.1);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 28, paddingTop: 90 },
  // Spec §3: 52px height, 16px radius, crisp 1px border, clear padding to prevent overlap
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, height: 52, justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 0 },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
    paddingVertical: 17,
    shadowColor: AppColors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});

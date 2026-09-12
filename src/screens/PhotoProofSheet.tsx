import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  type SharedValue,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ImageManipulator } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { AppColors, withAlpha } from '../theme/colors';
import { AppSpacing } from '../theme/spacing';
import { fontFamilyFor } from '../theme/typography';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { CameraIcon } from '../components/CameraIcon';
import { CrossModal } from '../components/CrossModal';
import { ProofSuccessModal, type ProofSuccessInfo } from '../components/ProofSuccessModal';
import { CelebrationOverlay } from '../components/animations/CelebrationOverlay';
import { QubiMascot } from '../components/QubiMascot';
import { useNav } from './navContext';
import { useAppStore, selectPendingTodayHabits, selectCompletedCount } from '../state/appStore';
import { useSettingsStore } from '../state/settingsStore';
import { VisionVerdict, AiHttpException } from '../services/openRouter';
import { SupabaseServiceInstance } from '../services/supabase';
import { takeQuestProofPhoto, pickQuestProofPhoto } from '../services/photoProofService';
import { verifyCameraProof, awardProofXp, type VisionVerificationResult } from '../services/aiProofService';
import { playTaskCompleted } from '../services/soundService';
import type { Habit } from '../types/models';

type ProofStage = 'camera' | 'analyzing' | 'verified' | 'rejected';

interface Capture {
  uri: string;
  base64: string;
}

/* ── Public entry: autonomous quick-verify flow ───────────── */

export function QuickVerify({ onClose }: { onClose: () => void }) {
  const pending = useAppStore(selectPendingTodayHabits);
  const nav = useNav();
  const [manualHabit, setManualHabit] = useState<Habit | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (closed) return;
    if (pending.length === 0) {
      useSettingsStore.getState().tap();
      nav.toast('All quests verified for today 🎉');
      setClosed(true);
      onClose();
    }
  }, [pending.length, closed, nav, onClose]);

  if (closed || pending.length === 0) return null;
  if (manualHabit != null) {
    return <PhotoProofSheet habit={manualHabit} onClose={onClose} />;
  }

  return (
    <AutonomousProofSheet pending={pending} onClose={onClose} onPickManually={(h) => setManualHabit(h)} />
  );
}

/**
 * Autonomous proof sheet: snap once — Qubi inspects the photo, matches it
 * against every pending quest, and verifies the right one automatically.
 */
function AutonomousProofSheet({
  pending,
  onClose,
  onPickManually,
}: {
  pending: Habit[];
  onClose: () => void;
  onPickManually: (h: Habit) => void;
}) {
  const nav = useNav();
  const insets = useSafeAreaInsets();

  type AutoStage = 'camera' | 'analyzing' | 'done';
  const [stage, setStage] = useState<AutoStage>('camera');
  const [captured, setCaptured] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [result, setResult] = useState<VisionVerificationResult | null>(null);
  const [reward, setReward] = useState<ProofSuccessInfo | null>(null);
  const [showFx, setShowFx] = useState(true);

  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const camGranted = permission?.status === 'granted';

  useEffect(() => {
    if (!camGranted && permission && !permission.canAskAgain) return;
    if (!camGranted) void requestPermission();
  }, [camGranted, permission, requestPermission]);

  const finalize = useCallback(
    async (cap: Capture | null) => {
      let v: VisionVerificationResult;
      try {
        v = await verifyCameraProof(cap?.base64 ?? '', pending);
      } catch {
        v = {
          success: false,
          detectedObjects: [],
          description: 'The verifier is unreachable right now.',
          matchedQuestId: null,
          matchedQuestTitle: null,
          xpEarned: 0,
          message: 'Verification failed — try again or choose a quest manually.',
          confidence: null,
          difficulty: null,
          taskName: null,
          qubiComment: null,
          reasoning: null,
        };
      }

      if (v.success && v.matchedQuestId != null) {
        const matched = pending.find((h) => h.id === v.matchedQuestId);
        if (matched != null && cap != null && SupabaseServiceInstance.isConfigured) {
          try {
            const resp = await fetch(cap.uri);
            const buf = await resp.arrayBuffer();
            await SupabaseServiceInstance.uploadPhotoProof(new Uint8Array(buf));
          } catch {}
        }
        if (matched != null) {
          useSettingsStore.getState().celebrate();
          const xpBefore = useAppStore.getState().xp;
          const completionsBefore = selectCompletedCount(useAppStore.getState());
          const { xp: xpAfter, streak } = await awardProofXp(matched.id, undefined, {
            xpAmount: v.xpEarned,
            difficulty: v.difficulty ?? 'Medium',
            taskName: v.taskName ?? matched.name,
          });
          // Fire the task-completed sting the instant verification succeeds —
          // the modal replays it on mount as a safety net.
          playTaskCompleted();
          setShowFx(true);
          const after = useAppStore.getState();
          setReward({
            habitName: matched.name,
            xpGained: Math.max(0, xpAfter - xpBefore),
            xpBefore,
            xpAfter,
            streak,
            completionsBefore,
            completionsAfter: selectCompletedCount(after),
            difficulty: v.difficulty ?? undefined,
            qubiComment: v.qubiComment ?? undefined,
          });
        }
      }

      setResult(v);
      setBusy(false);
      setStage('done');
    },
    [pending],
  );

  const shutter = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const settings = useSettingsStore.getState();
    if (settings.haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    let cap: Capture | null = null;
    try {
      if (camGranted && cameraRef.current != null) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.9,
          base64: true,
          skipProcessing: Platform.OS === 'android',
        });
        if (photo?.uri != null) {
          let base64 = photo.base64 ?? '';
          let uri = photo.uri;
          try {
            const rendered = await ImageManipulator.manipulate(uri)
              .resize({ width: 1200 })
              .renderAsync();
            const saved = await rendered.saveAsync({ compress: 0.82, base64: true });
            uri = saved.uri;
            base64 = saved.base64 ?? base64;
          } catch {}
          cap = { uri, base64 };
        }
      }
      if (cap == null) {
        cap = await takeQuestProofPhoto();
        if (cap == null) {
          setBusy(false);
          return;
        }
      }
    } catch {
      setBusy(false);
      nav.toast('Camera unavailable — try again');
      return;
    }

    setCaptured(cap);
    setStage('analyzing');
    await finalize(cap);
  }, [busy, camGranted, finalize, nav]);

  const pickExisting = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickQuestProofPhoto();
      if (picked == null) {
        setBusy(false);
        return;
      }
      setCaptured(picked);
      setStage('analyzing');
      await finalize(picked);
    } catch {
      setBusy(false);
    }
  }, [busy, finalize]);

  return (
    <CrossModal transparent animationType="slide" onRequestClose={onClose} visible>
      <View style={[styles.sheetBackdropFull, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
        <View style={[styles.sheetBody, { paddingTop: insets.top + 12 }]}>
          {/* Header */}
          <View style={[styles.proofHeader, { paddingTop: 4 }]}>
            <View style={styles.flex}>
              <Text style={styles.proofTitle}>Snap Photo Proof</Text>
              <View style={{ height: 2 }} />
              <Text style={styles.proofSubtitle}>🤖 Qubi matches your photo to a quest automatically</Text>
            </View>
            <Pressable onTap={onClose}>
              <StrokeIcon name="close" size={22} color={AppColors.mutedLight} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.flex}>
            {reward != null ? null : stage === 'camera' ? (
              <View style={styles.stagePad}>
                <View style={styles.flex}>
                  <View style={styles.viewfinderClip}>
                    <LinearGradient colors={['#141516', '#141516']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.flex}>
                      <View style={styles.flex}>
                        {camGranted ? (
                          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" enableTorch={flashOn} />
                        ) : (
                          <View style={styles.viewfinderPlaceholderWrap}>
                            <QubiMascot size={72} bob={false} />
                          </View>
                        )}
                        <ReticleCorners />
                        <View style={[styles.habitBadge, { maxWidth: '70%' }]}>
                          <Text numberOfLines={1} style={styles.habitBadgeName}>
                            {pending.length} quest{pending.length === 1 ? '' : 's'} waiting · AI auto-match
                          </Text>
                        </View>
                        <View style={styles.flashBtnWrap}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable onTap={() => void pickExisting()}>
                              <View style={[styles.flashBtn, { backgroundColor: withAlpha('#000000', 0.5) }]}>
                                <StrokeIcon name="image" size={18} color="#FFFFFF" strokeWidth={2.2} />
                              </View>
                            </Pressable>
                            <Pressable onTap={() => setFlashOn((f) => !f)}>
                              <View
                                style={[
                                  styles.flashBtn,
                                  {
                                    backgroundColor: flashOn
                                      ? withAlpha(AppColors.rewardBlue, 0.8)
                                      : withAlpha('#000000', 0.5),
                                  },
                                ]}
                              >
                                <StrokeIcon name="zap" size={18} color="#FFFFFF" strokeWidth={2.2} />
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>
                  </View>
                </View>
                <View style={{ height: 16 }} />
                <Text style={styles.cameraHint}>
                  Snap your completed quest — no picking needed. Qubi identifies what it sees and verifies the matching quest (+50 XP each).
                </Text>
                <View style={{ height: 14 }} />
                <View style={styles.shutterWrap}>
                  <Pressable onTap={busy ? () => {} : () => void shutter()} scale={0.94}>
                    <View style={styles.shutterOuter}>
                      <LinearGradient
                        colors={[AppColors.primary, AppColors.primaryDeep]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.shutterInner}
                      >
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <View />}
                      </LinearGradient>
                    </View>
                  </Pressable>
                </View>
                <View style={{ height: 10 }} />
                <Pressable onTap={onClose} scale={0.97}>
                  <View style={styles.autoManualLink}>
                    <Text style={styles.autoManualText}>Choose a quest manually instead</Text>
                  </View>
                </Pressable>
              </View>
            ) : stage === 'analyzing' ? (
              <AnalyzingStage habit={pending[0] ?? null} captured={captured} demoCapture={false} />
            ) : (
              <AutoResultStage
                result={result}
                pending={pending}
                onClose={onClose}
                onRetry={() => {
                  setResult(null);
                  setCaptured(null);
                  setStage('camera');
                }}
                onManual={onPickManually}
              />
            )}
          </View>

          {/* Bottom actions never collide with the tab bar */}
          <View style={{ paddingBottom: insets.bottom + 16 }} />
        </View>

        {reward != null ? (
          <>
            {showFx ? (
              <CelebrationOverlay
                key={`fx-${reward.habitName}-${reward.completionsAfter}`}
                visible
                silent
                hideHeroCard
                oldXp={reward.xpBefore}
                newXp={reward.xpAfter}
                oldLevel={1 + Math.floor(Math.max(0, reward.xpBefore) / 500)}
                newLevel={1 + Math.floor(Math.max(0, reward.xpAfter) / 500)}
                xpGained={reward.xpGained}
                habitName={reward.habitName}
                onDone={() => {}}
                onLevelUpDone={() => setShowFx(false)}
              />
            ) : null}
            <ProofSuccessModal
              info={reward}
              onContinue={onClose}
              onSnapAnother={() => {
                setReward(null);
                setResult(null);
                setCaptured(null);
                setStage('camera');
              }}
            />
          </>
        ) : null}
      </View>
    </CrossModal>
  );
}

function AutoResultStage({
  result,
  pending,
  onClose,
  onRetry,
  onManual,
}: {
  result: VisionVerificationResult | null;
  pending: Habit[];
  onClose: () => void;
  onRetry: () => void;
  onManual: (h: Habit) => void;
}) {
  const ok = result?.success === true;
  return (
    <View style={styles.stagePadCenteredNoGrow}>
      <QubiMascot size={96} celebrating={ok} bob={false} />
      <View style={{ height: 18 }} />
      <View
        style={[
          styles.matchChip,
          ok
            ? { backgroundColor: withAlpha(AppColors.rewardBlue, 0.16) }
            : { backgroundColor: withAlpha(AppColors.error, 0.16) },
        ]}
      >
        <StrokeIcon
          name={ok ? 'checkCircle' : 'alert'}
          size={18}
          color={ok ? AppColors.rewardBlue : AppColors.error}
          strokeWidth={2.4}
        />
        <View style={{ width: 6 }} />
        <Text
          numberOfLines={2}
          style={[styles.matchChipText, { flexShrink: 1, color: ok ? AppColors.rewardInkMid : AppColors.error }]}
        >
          {ok && result?.confidence != null ? `${Math.round(result.confidence * 100)}% Match · Verified!` : ok ? 'Verified!' : 'No confident match'}
        </Text>
      </View>
      <View style={{ height: 14 }} />
      <Text style={styles.rejectReason} numberOfLines={4}>
        {result?.message ?? 'Something went wrong.'}
      </Text>
      {!ok && result != null && result.detectedObjects.length > 0 ? (
        <>
          <View style={{ height: 10 }} />
          <View
            style={[styles.detectedWrap, { backgroundColor: withAlpha(AppColors.error, 0.1), borderColor: withAlpha(AppColors.error, 0.4) }]}
          >
            <Text style={styles.detectedLabel}>QUBI'S ANALYSIS · 0 XP AWARDED</Text>
            <Text numberOfLines={3} style={[styles.detectedText, { flexShrink: 1 }]}>
              I detected: {result.detectedObjects.join(', ')}.{result.description.length > 0 ? ` ${result.description}` : ''}
            </Text>
          </View>
        </>
      ) : null}
      {ok ? (
        <>
          <View style={{ height: 10 }} />
          <Text style={styles.treatLine}>Streak protected · Rank secured 🔥</Text>
        </>
      ) : null}
      <View style={styles.flex} />
      {ok ? (
        <View style={styles.rejectButtonsRow}>
          <View style={styles.rejectButtonCell}>
            <Pressable onTap={onRetry}>
              <View style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Snap another</Text>
              </View>
            </Pressable>
          </View>
          <View style={{ width: 12 }} />
          <View style={styles.rejectButtonCell}>
            <Pressable onTap={onClose}>
              <LinearGradient
                colors={[AppColors.primary, AppColors.primaryDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.retakeButton}
              >
                <Text style={styles.retakeButtonText}>Done</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ alignSelf: 'stretch', flex: 1, minHeight: 200 }}>
          <Text style={styles.autoPickHint}>Which quest does this prove?</Text>
          <PendingPicker habits={pending} onPick={onManual} />
        </View>
      )}
    </View>
  );
}

function PendingPicker({ habits, onPick }: { habits: Habit[]; onPick: (h: Habit) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.pickerSheet}>
      <View style={styles.grabberWrap}>
        <View style={[styles.grabber, { backgroundColor: withAlpha(colors.muted, 0.3) }]} />
      </View>
      <Text style={[styles.pickerTitle, { color: colors.ink }]}>Choose a quest to verify</Text>
      <View style={{ height: 4 }} />
      <ProofInfoToast />
      <View style={{ height: 14 }} />
      <View style={styles.flex}>
        {habits.map((h) => (
          <Pressable key={h.id} onTap={() => onPick(h)}>
            <View style={[styles.pickerRow, { backgroundColor: colors.surfaceLowest, borderColor: AppColors.glassEdge }]}>
              <Text style={styles.pickerEmoji}>{h.emoji}</Text>
              <View style={{ width: 12 }} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.pickerName, { color: colors.ink, marginRight: 10 }]}>
                  {h.name}
                </Text>
                <Text numberOfLines={1} style={[styles.pickerMeta, { color: colors.muted }]}>
                  {h.category} · {h.time}
                </Text>
              </View>
              <StrokeIcon name="chevronRight" size={16} color={colors.muted} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Dismissible info banner — always renders its copy inside <Text> and
 * auto-dismisses after 3 seconds (or immediately via the X button).
 */
function ProofInfoToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[styles.infoBanner, { backgroundColor: withAlpha(AppColors.rewardBlue, 0.1) }]}>
      <CameraIcon size={14} color={AppColors.rewardInkMid} backgroundColor="transparent" />
      <View style={{ width: 8 }} />
      <Text style={[styles.infoBannerText, { color: AppColors.mutedLight }]}>Camera-only proof · AI verified · graded XP</Text>
      <Pressable onTap={() => setVisible(false)} scale={0.9}>
        <View style={styles.infoBannerClose}>
          <StrokeIcon name="close" size={13} color={AppColors.mutedLight} strokeWidth={2.4} />
        </View>
      </Pressable>
    </View>
  );
}

/* ── Main per-quest proof sheet ────────────────────────────── */

export default function PhotoProofSheet({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();

  const [stage, setStage] = useState<ProofStage>('camera');
  const [captured, setCaptured] = useState<Capture | null>(null);
  const [demoCapture, setDemoCapture] = useState(false);
  const [verdict, setVerdict] = useState<VisionVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [reward, setReward] = useState<ProofSuccessInfo | null>(null);
  const [showFx, setShowFx] = useState(true);

  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const camGranted = permission?.status === 'granted';

  useEffect(() => {
    if (!camGranted && permission && !permission.canAskAgain) return;
    if (!camGranted) void requestPermission();
  }, [camGranted, permission, requestPermission]);

  const runAnalysis = useCallback(
    async (capLocal: Capture | null, demoLocal: boolean) => {
      // Graded pipeline: same difficulty + scaled-XP verdict as the
      // autonomous flow, scoped to this one quest.
      let v: VisionVerificationResult;
      try {
        v = await verifyCameraProof(demoLocal || capLocal == null ? '' : capLocal.base64, [habit]);
      } catch (e) {
        const reason =
          e instanceof AiHttpException ? e.userMessage : 'The verifier is unreachable right now. Try again.';
        setVerdict(new VisionVerdict(false, 0, reason));
        setStage('rejected');
        return;
      }

      if (v.success && v.matchedQuestId === habit.id) {
        let proofPath: string | null = null;
        if (SupabaseServiceInstance.isConfigured && capLocal != null) {
          try {
            const resp = await fetch(capLocal.uri);
            const buf = await resp.arrayBuffer();
            proofPath = await SupabaseServiceInstance.uploadPhotoProof(new Uint8Array(buf));
          } catch {}
        }
        useSettingsStore.getState().celebrate();
        const xpBefore = useAppStore.getState().xp;
        const completionsBefore = selectCompletedCount(useAppStore.getState());
        const { xp: xpAfter, streak } = await awardProofXp(habit.id, proofPath ?? undefined, {
          xpAmount: v.xpEarned,
          difficulty: v.difficulty ?? 'Medium',
          taskName: v.taskName ?? habit.name,
        });
        // Fire the task-completed sting the instant verification succeeds.
        playTaskCompleted();
        setShowFx(true);
        const after = useAppStore.getState();
        setReward({
          habitName: habit.name,
          xpGained: Math.max(0, xpAfter - xpBefore),
          xpBefore,
          xpAfter: after.xp,
          streak,
          completionsBefore,
          completionsAfter: selectCompletedCount(after),
          difficulty: v.difficulty ?? undefined,
          qubiComment: v.qubiComment ?? undefined,
        });
      }

      setVerdict(
        new VisionVerdict(
          v.success,
          v.confidence ?? (v.success ? 0.9 : 0),
          v.success ? (v.qubiComment ?? v.message) : v.message,
        ),
      );
      setStage('rejected');
    },
    [habit.id, habit.name],
  );

  /** Gallery / image-picker entry point. */
  const pickExisting = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const settings = useSettingsStore.getState();
    if (settings.haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const picked = await pickQuestProofPhoto();
      if (picked == null) {
        setBusy(false);
        return;
      }
      setCaptured(picked);
      setDemoCapture(false);
      setBusy(false);
      setStage('analyzing');
      await runAnalysis(picked, false);
    } catch {
      setBusy(false);
    }
  }, [busy, runAnalysis]);

  const shutter = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const settings = useSettingsStore.getState();
    if (settings.haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    let cap: Capture | null = null;
    let captureError: string | null = null;

    try {
      if (camGranted && cameraRef.current != null && !demoCapture) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.9,
          base64: true,
          skipProcessing: Platform.OS === 'android',
        });
        if (photo?.uri != null) {
          let base64 = photo.base64 ?? '';
          let uri = photo.uri;
          try {
            const rendered = await ImageManipulator.manipulate(uri)
              .resize({ width: 1200 })
              .renderAsync();
            const saved = await rendered.saveAsync({ compress: 0.82, base64: true });
            uri = saved.uri;
            base64 = saved.base64 ?? base64;
          } catch {}
          if (base64.length > 0 || uri.length > 0) cap = { uri, base64 };
        }
      }
      // Expo Go / permission-denied fallback: expo-image-picker camera flow
      // with an automatic gallery fallback inside the helper.
      if (cap == null) {
        const picked = await takeQuestProofPhoto();
        if (picked == null) {
          setBusy(false);
          return; // user cancelled the picker
        }
        cap = picked;
      }
    } catch (e) {
      captureError = cameraErrorMessage(e);
    }

    if (captureError != null) {
      setBusy(false);
      setStage('rejected');
      setVerdict(new VisionVerdict(false, 0, captureError));
      return;
    }

    const demo = cap == null;
    setCaptured(cap);
    setDemoCapture(demo);
    setBusy(false);
    setStage('analyzing');

    await runAnalysis(cap, demo);
  }, [busy, camGranted, demoCapture, runAnalysis]);

  return (
    <CrossModal transparent animationType="slide" onRequestClose={onClose} visible>
      <View style={[styles.sheetBackdropFull, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
        <View style={[styles.sheetBody, { paddingTop: insets.top + 12 }]}>
          {/* Header */}
          <View style={[styles.proofHeader, { paddingTop: 4 }]}>
            <View style={styles.flex}>
              <Text style={styles.proofTitle}>Snap Photo Proof</Text>
              <View style={{ height: 2 }} />
              <Text style={styles.proofSubtitle}>
                {habit.emoji} {habit.name} · {habit.time}
              </Text>
            </View>
            <Pressable onTap={onClose}>
              <StrokeIcon name="close" size={22} color={AppColors.mutedLight} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Stage views */}
          <View style={styles.flex}>
            {reward != null ? null : stage === 'camera' ? (
              <CameraStage
                habit={habit}
                busy={busy}
                flashOn={flashOn}
                camGranted={camGranted}
                captured={captured}
                demoCapture={demoCapture}
                onToggleFlash={() => setFlashOn((f) => !f)}
                onPickLibrary={() => void pickExisting()}
                cameraRef={cameraRef}
                onShutter={() => void shutter()}
              />
            ) : stage === 'analyzing' ? (
              <AnalyzingStage habit={habit} captured={captured} demoCapture={demoCapture} />
            ) : (
              <RejectedStage verdict={verdict!} onCancel={onClose} onRetake={() => nav.toast('Retake')} bottomInset={insets.bottom} />
            )}
          </View>
        </View>

        {/* Duolingo-style reward overlay — Continue returns straight to the dashboard */}
        {reward != null ? (
          <>
            {showFx ? (
              <CelebrationOverlay
                key={`fx-${reward.habitName}-${reward.completionsAfter}`}
                visible
                silent
                hideHeroCard
                oldXp={reward.xpBefore}
                newXp={reward.xpAfter}
                oldLevel={1 + Math.floor(Math.max(0, reward.xpBefore) / 500)}
                newLevel={1 + Math.floor(Math.max(0, reward.xpAfter) / 500)}
                xpGained={reward.xpGained}
                habitName={reward.habitName}
                onDone={() => {}}
                onLevelUpDone={() => setShowFx(false)}
              />
            ) : null}
            <ProofSuccessModal
              info={reward}
              onContinue={onClose}
              onSnapAnother={() => {
                setReward(null);
                setStage('camera');
              }}
            />
          </>
        ) : null}
      </View>
    </CrossModal>
  );
}

function cameraErrorMessage(error: unknown): string {
  const text = String(error).toLowerCase();
  if (text.includes('permission')) {
    return 'Camera permission was denied. Allow camera access in your phone settings, then come back and retake.';
  }
  if (text.includes('no camera') || text.includes('not available') || text.includes('unavailable')) {
    return 'No camera is available on this device.';
  }
  return 'The camera could not be opened. Tap Retake to try again.';
}

/* ── Camera stage ──────────────────────────────────────────── */

function CameraStage({
  habit,
  busy,
  flashOn,
  camGranted,
  captured,
  demoCapture,
  onToggleFlash,
  onPickLibrary,
  cameraRef,
  onShutter,
}: {
  habit: Habit;
  busy: boolean;
  flashOn: boolean;
  camGranted: boolean;
  captured: Capture | null;
  demoCapture: boolean;
  onToggleFlash: () => void;
  onPickLibrary: () => void;
  cameraRef: React.MutableRefObject<CameraView | null>;
  onShutter: () => void;
}) {
  const { isDark, colors } = useTheme();
  const [frameH, setFrameH] = useState(400);
  const scan = useSharedValue(0);

  useEffect(() => {
    scan.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [scan]);

  const scanStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scan.value, [0, 1], [40, Math.max(40, frameH - 90)]) }],
  }));

  return (
    <View style={styles.stagePad}>
      <View style={styles.flex}>
        <View style={styles.viewfinderClip} onLayout={(e) => setFrameH(e.nativeEvent.layout.height)}>
          <LinearGradient colors={['#141516', '#141516']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.flex}>
            <View style={styles.flex}>
              {camGranted && !demoCapture ? (
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" enableTorch={flashOn} />
              ) : captured != null ? (
                <Image source={{ uri: captured.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={styles.viewfinderPlaceholderWrap}>
                  <View style={styles.viewfinderPlaceholderBox}>
                    <StrokeIcon name={habit.icon as never} size={58} color={AppColors.mutedLight} strokeWidth={1.6} />
                  </View>
                </View>
              )}
              <ReticleCorners />
              <View style={styles.habitBadge}>
                <Text style={styles.habitBadgeEmoji}>{habit.emoji}</Text>
                <View style={{ width: 6 }} />
                <Text numberOfLines={1} style={[styles.habitBadgeName, { flexShrink: 1 }]}>
                  {habit.name}
                </Text>
              </View>
              <View style={styles.flashBtnWrap}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onTap={onPickLibrary}>
                    <View style={[styles.flashBtn, { backgroundColor: withAlpha('#000000', 0.5) }]}>
                      <StrokeIcon name="image" size={18} color="#FFFFFF" strokeWidth={2.2} />
                    </View>
                  </Pressable>
                  <Pressable onTap={onToggleFlash}>
                    <View
                      style={[
                        styles.flashBtn,
                        {
                          backgroundColor: flashOn
                            ? withAlpha(AppColors.rewardBlue, 0.8)
                            : withAlpha('#000000', 0.5),
                        },
                      ]}
                    >
                      <StrokeIcon name="zap" size={18} color="#FFFFFF" strokeWidth={2.2} />
                    </View>
                  </Pressable>
                </View>
              </View>
              <Animated.View style={[styles.scanLineWrap, scanStyle]}>
                <View style={styles.scanLine} />
              </Animated.View>
            </View>
          </LinearGradient>
        </View>
      </View>
      <View style={{ height: 16 }} />
      <Text style={[styles.cameraHint, { color: isDark ? AppColors.mutedLight : colors.muted }]}>
        Capture the evidence with the camera, or tap the gallery icon to choose an existing photo. AI verifies the object in your photo.
      </Text>
      <View style={{ height: 14 }} />
      <View style={styles.shutterWrap}>
        <Pressable onTap={busy ? () => {} : onShutter} scale={0.94}>
          <View style={styles.shutterOuter}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shutterInner}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <View />}
            </LinearGradient>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function ReticleCorners() {
  const len = 26;
  const thickness = 3;
  const cornerBase = { width: len, height: len } as const;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.cornerTL, cornerBase, { borderLeftWidth: thickness, borderTopWidth: thickness }]} />
      <View style={[styles.cornerTR, cornerBase, { borderRightWidth: thickness, borderTopWidth: thickness }]} />
      <View style={[styles.cornerBL, cornerBase, { borderLeftWidth: thickness, borderBottomWidth: thickness }]} />
      <View style={[styles.cornerBR, cornerBase, { borderRightWidth: thickness, borderBottomWidth: thickness }]} />
    </View>
  );
}

/* ── Analyzing stage — Cal-AI style scan experience ─────────────────── */

const ANALYZE_STEPS = ['Detecting scene', 'Matching your quest', 'Grading effort & XP'] as const;

function AnalyzingStage({
  habit,
  captured,
  demoCapture,
}: {
  habit: Habit | null;
  captured: Capture | null;
  demoCapture: boolean;
}) {
  const laser = useSharedValue(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [pct, setPct] = useState(4);

  useEffect(() => {
    laser.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [laser]);

  useEffect(() => {
    const t1 = setTimeout(() => setStepIdx(1), 900);
    const t2 = setTimeout(() => setStepIdx(2), 2100);
    const iv = setInterval(() => {
      setPct((p) => (p >= 95 ? 95 : Math.min(95, p + 1 + Math.floor(Math.random() * 3))));
    }, 160);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(iv);
    };
  }, []);

  const laserStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(laser.value, [0, 1], [6, 196]) }],
  }));

  return (
    <View style={styles.stagePadCentered}>
      {/* Photo card with sweeping laser */}
      <View style={styles.calPhotoCard}>
        {captured != null ? (
          <Image source={{ uri: captured.uri }} style={styles.calPhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.calPhoto, styles.analyzeThumbPlaceholder]}>
            <StrokeIcon name={(habit?.icon ?? 'camera') as never} size={52} color={AppColors.mutedLight} />
          </View>
        )}
        <Animated.View style={[styles.calLaser, laserStyle]} pointerEvents="none" />
        <View style={styles.calPctBadge} pointerEvents="none">
          <Text style={styles.calPctText}>{pct}%</Text>
        </View>
      </View>

      <View style={{ height: 20 }} />
      <Text style={styles.analyzeTitle}>Analyzing proof…</Text>
      <View style={{ height: 4 }} />
      <Text style={styles.analyzeSubtitle}>
        {demoCapture ? 'Preview capture — camera unavailable on this device' : 'Qubi AI is inspecting your photo 🔍'}
      </Text>

      <View style={{ height: 18 }} />
      {/* Phase checklist */}
      <View style={styles.calSteps}>
        {ANALYZE_STEPS.map((label, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <View key={label} style={styles.calStepRow}>
              <View
                style={[
                  styles.calStepDot,
                  done && styles.calStepDotDone,
                  active && styles.calStepDotActive,
                ]}
              >
                {done ? <Text style={styles.calStepCheck}>✓</Text> : null}
              </View>
              <Text style={[styles.calStepLabel, (done || active) && styles.calStepLabelOn]}>
                {label}{active ? '…' : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ── Verified stage removed — the ProofSuccessModal reward overlay is now the
      single post-capture celebration; CONTINUE returns to the dashboard. ── */

/* ── Rejected stage ────────────────────────────────────────── */

function RejectedStage({
  verdict,
  onCancel,
  bottomInset = 0,
}: {
  verdict: VisionVerdict;
  onCancel: () => void;
  onRetake: () => void;
  bottomInset?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.stagePadCenteredNoGrow}>
      <QubiMascot size={104} bob={false} />
      <View style={{ height: 20 }} />
      <View style={styles.rejectChip}>
        <StrokeIcon name="alert" size={18} color={AppColors.error} strokeWidth={2.4} />
        <View style={{ width: 6 }} />
        <Text style={styles.rejectChipText}>Proof rejected</Text>
      </View>
      <View style={{ height: 18 }} />
      <Text style={styles.rejectReason}>{verdict.reason}</Text>
      <View style={{ height: 10 }} />
      <Text style={styles.rejectHint}>No XP was banked. Re-capture the evidence and try again.</Text>
      <View style={styles.flex} />
      <View style={[styles.rejectButtonsRow, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.rejectButtonCell}>
          <Pressable onTap={onCancel}>
            <View style={styles.cancelButton}>
              <Text style={[styles.cancelButtonText, { color: colors.ink }]}>Cancel</Text>
            </View>
          </Pressable>
        </View>
        <View style={{ width: 12 }} />
        <View style={styles.rejectButtonCell}>
          <Pressable onTap={onCancel}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.retakeButton}
            >
              <Text style={styles.retakeButtonText}>Done</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function DoneButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onTap={onPress}>
      <LinearGradient
        colors={[AppColors.primary, AppColors.primaryDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.doneButton}
      >
        <Text style={styles.doneButtonText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}/* ── Styles ────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  /* Quick-verify picker */
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  pickerSheet: {
    backgroundColor: AppColors.glassDark,
    borderTopLeftRadius: AppSpacing.radiusSheet,
    borderTopRightRadius: AppSpacing.radiusSheet,
    borderWidth: 1,
    borderColor: AppColors.glassEdge,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  grabberWrap: { alignItems: 'center', marginBottom: 14 },
  grabber: { width: 36, height: 4, borderRadius: 2 },
  pickerTitle: { fontSize: 18, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withAlpha(AppColors.rewardBlue, 0.35),
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    fontFamily: fontFamilyFor('w600'),
  },
  infoBannerClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: AppSpacing.radiusSoft,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  pickerEmoji: { fontSize: 20 },
  pickerName: { fontSize: 14.5, fontWeight: '700', fontFamily: fontFamilyFor('w700'), lineHeight: 19 },
  pickerMeta: { fontSize: 12, fontWeight: '400', fontFamily: fontFamilyFor('w500'), lineHeight: 16 },
  /* Sheet */
  sheetBackdropFull: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheetBody: { flex: 1, justifyContent: 'flex-end', height: '92%' },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  proofTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
  proofSubtitle: { color: AppColors.mutedLightDark, fontSize: 12.5, fontWeight: '400', fontFamily: fontFamilyFor('w500') },
  stagePad: { flex: 1, paddingLeft: 20, paddingRight: 20, paddingTop: 8, paddingBottom: 16 },
  stagePadCentered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingLeft: 20, paddingRight: 20 },
  stagePadCenteredNoGrow: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 8,
  },
  /* Camera */
  viewfinderClip: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  viewfinderPlaceholderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderPlaceholderBox: {
    width: 150,
    height: 150,
    borderRadius: 18,
    backgroundColor: '#242628',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerTL: { position: 'absolute', top: 22, left: 22, borderColor: AppColors.rewardBlue, borderTopLeftRadius: 4 },
  cornerTR: { position: 'absolute', top: 22, right: 22, borderColor: AppColors.rewardBlue, borderTopRightRadius: 4 },
  cornerBL: { position: 'absolute', bottom: 22, left: 22, borderColor: AppColors.rewardBlue, borderBottomLeftRadius: 4 },
  cornerBR: { position: 'absolute', bottom: 22, right: 22, borderColor: AppColors.rewardBlue, borderBottomRightRadius: 4 },
  habitBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#F0E2CE',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  habitBadgeEmoji: { fontSize: 14 },
  habitBadgeName: { color: '#0F172A', fontSize: 11, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
  flashBtnWrap: { position: 'absolute', top: 14, right: 14 },
  flashBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  scanLineWrap: { position: 'absolute', left: 22, right: 22, top: 0 },
  scanLine: {
    height: 2.5,
    borderRadius: 2,
    backgroundColor: AppColors.rewardBlue,
    shadowColor: AppColors.rewardBlue,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  cameraHint: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
    fontFamily: fontFamilyFor('w600'),
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  shutterWrap: { alignItems: 'center' },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    padding: 5,
    shadowColor: '#F97316',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  /* Analyzing */
  analyzeThumb: { width: 120, height: 120, borderRadius: 18 },
  analyzeThumbPlaceholder: { backgroundColor: '#242628', alignItems: 'center', justifyContent: 'center' },
  analyzeSpinner: { transform: [{ scale: 1.35 }] },
  scanBarTrack: {
    width: 200,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  scanBarSweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 80,
    borderRadius: 3,
    backgroundColor: AppColors.rewardBlue,
    opacity: 0.9,
  },
  analyzeTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', fontFamily: fontFamilyFor('w800') },
  analyzeSubtitle: { color: AppColors.mutedLight, fontSize: 12.5, textAlign: 'center', fontWeight: '400', fontFamily: fontFamilyFor('w500') },
  /* Cal-AI scan experience */
  calPhotoCard: {
    width: 210,
    height: 210,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#242628',
    shadowColor: '#58CC02',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  calPhoto: { width: '100%', height: '100%' },
  calLaser: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#58CC02',
    shadowColor: '#58CC02',
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  calPctBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  calPctText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', fontFamily: fontFamilyFor('w800') },
  calSteps: { width: '100%', maxWidth: 300, gap: 10 },
  calStepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calStepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calStepDotActive: { borderColor: '#58CC02' },
  calStepDotDone: { backgroundColor: '#58CC02', borderColor: '#58CC02' },
  calStepCheck: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 16 },
  calStepLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600', fontFamily: fontFamilyFor('w600') },
  calStepLabelOn: { color: '#FFFFFF' },
  /* Verified (styles kept for the shared match chip used by AutoResultStage) */
  matchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(AppColors.rewardBlue, 0.16),
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  matchChipText: { fontSize: 14, fontWeight: '700', fontFamily: fontFamilyFor('w700'), lineHeight: 19 },
  verdictReason: {
    color: AppColors.mutedLight,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '400',
    fontFamily: fontFamilyFor('w500'),
  },
  /* Rejected */
  rejectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(AppColors.error, 0.16),
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  rejectChipText: { color: AppColors.error, fontSize: 14, fontWeight: '700', fontFamily: fontFamilyFor('w700') },
  rejectReason: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: fontFamilyFor('w600'),
  },
  rejectHint: {
    color: AppColors.mutedLight,
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '400',
    fontFamily: fontFamilyFor('w500'),
  },
  rejectButtonsRow: { flexDirection: 'row', alignSelf: 'stretch', paddingBottom: 16 },
  rejectButtonCell: { flex: 1 },
  cancelButton: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.glassDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { fontWeight: '700', fontSize: 15, fontFamily: fontFamilyFor('w700') },
  retakeButton: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  retakeButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, fontFamily: fontFamilyFor('w800') },
  treatLine: {
    color: AppColors.success,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: fontFamilyFor('w700'),
  },
  doneButton: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  doneButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, fontFamily: fontFamilyFor('w800') },
  /* Autonomous proof sheet */
  autoManualLink: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: withAlpha(AppColors.mutedLight, 0.4),
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  autoManualText: {
    color: AppColors.mutedLight,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    fontFamily: fontFamilyFor('w600'),
  },
  autoPickHint: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    fontFamily: fontFamilyFor('w700'),
    textAlign: 'center',
    marginBottom: 10,
  },
  detectedWrap: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  detectedLabel: {
    color: AppColors.error,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: fontFamilyFor('w800'),
    marginBottom: 5,
  },
  detectedText: {
    color: AppColors.mutedLight,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
    fontFamily: fontFamilyFor('w500'),
  },
});

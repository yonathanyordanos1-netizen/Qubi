/**
 * permissionService — unified iOS native permission manager for Qubi.
 *
 * Drop-in for onboarding soft-prompts and settings screens. Every method is
 * defensive: on web / Expo Go without native modules it no-ops and returns
 * a safe value so the app never crashes in a Release `.ipa` review.
 *
 * 1. requestNotificationPermissions() — expo-notifications push + daily habit reminders
 * 2. requestCameraPermissions()        — expo-camera + expo-image-picker (photo proof)
 * 3. requestHealthPermissions()        — react-native-health (Steps, Active Energy, Workouts, Water)
 * 4. requestAllPermissions()           — convenience one-tap onboarding flow
 * 5. syncHealthData()                  — re-export from healthKitService for `Step 3` snippet
 *
 * Install (already in package.json:57):
 *   npx expo install expo-notifications expo-camera expo-image-picker
 *   yarn add react-native-health  # already present
 *
 * iOS `app.json` must contain the `NS*UsageDescription` keys — see Step 1.
 * Without them Release builds crash on first native prompt.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SupabaseServiceInstance } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────
export type HealthPermissionStatus = 'notDetermined' | 'granted' | 'denied' | 'unavailable';

export interface CameraPermissionResult {
  camera: boolean;
  photos: boolean;
  /** true only if BOTH are granted */
  allGranted: boolean;
}

export interface AllPermissionsResult {
  notifications: boolean;
  camera: boolean;
  photos: boolean;
  health: HealthPermissionStatus;
  /** true if every prompt succeeded */
  allGranted: boolean;
}

// ── 1. Notifications ───────────────────────────────────────────────────────
/**
 * Requests Expo push notification permissions and saves the Expo push token
 * for daily habit reminders. Must be called from a user gesture (button tap).
 *
 * Saves to Supabase `user_push_tokens` + `profiles.push_token` via
 * `registerPushToken()` — safe to call repeatedly.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    // Use the canonical flow from notificationService to keep channel init consistent
    const { requestNotificationPermissions: req, registerPushToken } = await import('./notificationService');
    const granted = await req();
    if (granted) {
      // Best-effort: persist push token so backend can deliver daily reminders
      await registerPushToken().catch(() => {});
    }
    return granted;
  } catch {
    // Fallback: direct expo-notifications call if service import fails
    try {
      const settings = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      const granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      if (granted) {
        try {
          const mod = await import('./notificationService');
          await mod.registerPushToken().catch(() => {});
        } catch {}
      }
      return granted;
    } catch {
      return false;
    }
  }
}

// ── 2. Camera + Photo Library ─────────────────────────────────────────────
/**
 * Requests Camera and Photo Library permissions for photo proof snapping.
 * Uses `expo-camera` for camera and `expo-image-picker` for library so the
 * Release `.ipa` triggers the exact `NSCameraUsageDescription` /
 * `NSPhotoLibraryUsageDescription` dialogs from `app.json`.
 */
export async function requestCameraPermissions(): Promise<CameraPermissionResult> {
  if (Platform.OS === 'web') return { camera: false, photos: false, allGranted: false };

  let camera = false;
  let photos = false;

  // Camera — expo-camera (SDK 57: named export + Camera helper)
  try {
    const mod: any = await import('expo-camera');
    const req = mod.requestCameraPermissionsAsync ?? mod.Camera?.requestCameraPermissionsAsync;
    if (typeof req === 'function') {
      const res = await req();
      camera = !!res.granted;
    }
  } catch {
    // Expo Go stub or missing native module — treat as denied
    camera = false;
  }

  // Photo Library — expo-image-picker
  try {
    const ImagePicker: any = await import('expo-image-picker');
    const req = ImagePicker.requestMediaLibraryPermissionsAsync;
    if (typeof req === 'function') {
      const res = await req();
      photos = !!res.granted;
    }
  } catch {
    photos = false;
  }

  return { camera, photos, allGranted: camera && photos };
}

// ── 3. HealthKit ───────────────────────────────────────────────────────────
/**
 * Initializes HealthKit with permissions to read:
 *  - StepCount
 *  - ActiveEnergyBurned
 *  - Workout
 *  - Water (Water Intake)
 *
 * Returns `granted` / `denied` / `unavailable` (non-iOS / simulator / Expo Go).
 */
export async function requestHealthPermissions(): Promise<HealthPermissionStatus> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    // Delegate to healthService for the native init, but ensure Water is requested
    // react-native-health needs explicit Water permission — patch via direct init if needed
    let AppleHealthKit: any = null;
    try {
      AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    } catch {
      AppleHealthKit = null;
    }

    if (AppleHealthKit?.initHealthKit) {
      const perms = {
        permissions: {
          read: [
            AppleHealthKit.Constants.Permissions.StepCount,
            AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
            AppleHealthKit.Constants.Permissions.Workout,
            // Water — guarded for SDKs where the constant is missing
            AppleHealthKit.Constants.Permissions.Water ??
              AppleHealthKit.Constants.Permissions.WaterIntake ??
              'Water',
          ].filter(Boolean),
          write: [],
        },
      };
      const granted = await new Promise<boolean>((resolve) => {
        AppleHealthKit.initHealthKit(perms, (err: string | null) => {
          if (err) resolve(false);
          else resolve(true);
        });
      });
      return granted ? 'granted' : 'denied';
    }

    // Fallback to shared healthService implementation (Steps/Calories/Workout)
    const { requestHealthPermissions: req } = await import('./healthService');
    return await req();
  } catch {
    return 'denied';
  }
}

// ── 4. Unified one-tap flow ───────────────────────────────────────────────
/**
 * One-tap onboarding helper: prompts Notifications → Camera → Photos → HealthKit
 * sequentially so iOS shows each native dialog in order (iOS only allows one
 * system prompt at a time).
 */
export async function requestAllPermissions(): Promise<AllPermissionsResult> {
  const notifications = await requestNotificationPermissions().catch(() => false);
  const cam = await requestCameraPermissions().catch(() => ({ camera: false, photos: false, allGranted: false }));
  const health = await requestHealthPermissions().catch(() => 'denied' as HealthPermissionStatus);

  return {
    notifications,
    camera: cam.camera,
    photos: cam.photos,
    health,
    allGranted: notifications && cam.allGranted && health === 'granted',
  };
}

// ── 5. Re-export for Step 3 snippet compatibility ──────────────────────────
// `import { requestAllPermissions, syncHealthData } from './services/permissionService'`
export { syncHealthData } from './healthKitService';

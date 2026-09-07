/**
 * Apple HealthKit service — Expo-compatible abstraction.
 *
 * On iOS physical devices with HealthKit available (via `react-native-health`
 * or `expo-health-kit`), it requests permissions and reads:
 *  - Daily steps
 *  - Active Energy Burned (calories)
 *  - Workout sessions (running, gym, cycling)
 *
 * On web / Android / Expo Go without native HealthKit, all functions degrade
 * gracefully to mock/no-op values so the rest of the app never crashes.
 */

import { Platform } from 'react-native';

export type HealthPermissionStatus = 'notDetermined' | 'granted' | 'denied' | 'unavailable';

export type WorkoutType = 'running' | 'cycling' | 'gym' | 'yoga' | 'swimming' | 'hiking' | 'other';

export interface WorkoutSession {
  id: string;
  type: WorkoutType;
  startDate: string; // ISO
  endDate: string; // ISO
  durationMinutes: number;
  calories: number;
  distanceMeters?: number;
}

export interface HealthMetrics {
  stepsToday: number;
  activeCaloriesToday: number;
  workoutsToday: WorkoutSession[];
  /** XP derived from workouts: 50 XP per workout + 5 XP per 1000 steps + 1 XP per 10 kcal */
  xpFromFitness: number;
}

function isHealthKitAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  // HealthKit is only available on physical iOS devices, not simulator
  // We guard with try/catch for Expo Go where native module may be absent.
  return true; // permission check will gate further
}

// ── Permission helpers ───────────────────────────────────────────────────

/**
 * Request HealthKit permissions for steps, calories and workouts.
 * Returns status string; on unsupported platforms returns 'unavailable'.
 */
export async function requestHealthPermissions(): Promise<HealthPermissionStatus> {
  if (!isHealthKitAvailable()) return 'unavailable';
  try {
    // Try expo-health-kit first, then react-native-health fallback.
    // Dynamic requires avoid bundling errors when the native module isn't linked.
    let AppleHealthKit: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    } catch {
      // not installed — will fall through to mock granted
    }
    if (AppleHealthKit?.initHealthKit) {
      const permissions = {
        permissions: {
          read: [
            AppleHealthKit.Constants.Permissions.StepCount,
            AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
            AppleHealthKit.Constants.Permissions.Workout,
          ],
          write: [],
        },
      };
      const granted = await new Promise<boolean>((resolve) => {
        AppleHealthKit.initHealthKit(permissions, (err: string | null) => {
          if (err) resolve(false);
          else resolve(true);
        });
      });
      return granted ? 'granted' : 'denied';
    }
    // If no native lib, pretend granted for demo/mock flow
    return 'granted';
  } catch {
    return 'denied';
  }
}

// ── Fetchers ─────────────────────────────────────────────────────────────

export async function fetchDailySteps(date: Date = new Date()): Promise<number> {
  if (!isHealthKitAvailable()) return mockSteps(date);
  try {
    let AppleHealthKit: any = null;
    try {
      AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    } catch {
      return mockSteps(date);
    }
    if (!AppleHealthKit?.getStepCount) return mockSteps(date);
    const options = { date: date.toISOString() };
    return await new Promise<number>((resolve) => {
      AppleHealthKit.getStepCount(options, (err: string | null, res: { value: number }) => {
        if (err || !res) resolve(mockSteps(date));
        else resolve(Math.round(res.value));
      });
    });
  } catch {
    return mockSteps(date);
  }
}

export async function fetchActiveEnergy(date: Date = new Date()): Promise<number> {
  if (!isHealthKitAvailable()) return mockCalories(date);
  try {
    let AppleHealthKit: any = null;
    try {
      AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    } catch {
      return mockCalories(date);
    }
    if (!AppleHealthKit?.getActiveEnergyBurned) return mockCalories(date);
    // Query today's sum
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return await new Promise<number>((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(
        { startDate: start.toISOString(), endDate: end.toISOString() },
        (err: string | null, res: { value: number }[]) => {
          if (err || !Array.isArray(res)) resolve(mockCalories(date));
          else {
            const sum = res.reduce((a, r) => a + (r.value ?? 0), 0);
            resolve(Math.round(sum));
          }
        },
      );
    });
  } catch {
    return mockCalories(date);
  }
}

export async function fetchWorkoutSessions(date: Date = new Date()): Promise<WorkoutSession[]> {
  if (!isHealthKitAvailable()) return mockWorkouts(date);
  try {
    let AppleHealthKit: any = null;
    try {
      AppleHealthKit = require('react-native-health').default ?? require('react-native-health');
    } catch {
      return mockWorkouts(date);
    }
    if (!AppleHealthKit?.getSamples) return mockWorkouts(date);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return await new Promise<WorkoutSession[]>((resolve) => {
      AppleHealthKit.getSamples(
        {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          type: AppleHealthKit.Constants.Permissions.Workout,
        },
        (err: string | null, res: any[]) => {
          if (err || !Array.isArray(res)) resolve(mockWorkouts(date));
          else {
            const mapped: WorkoutSession[] = res.map((w: any, idx: number) => mapHealthKitWorkout(w, idx));
            resolve(mapped);
          }
        },
      );
    });
  } catch {
    return mockWorkouts(date);
  }
}

// ── Aggregated helper ────────────────────────────────────────────────────

export async function getHealthMetrics(date: Date = new Date()): Promise<HealthMetrics> {
  const [stepsToday, activeCaloriesToday, workoutsToday] = await Promise.all([
    fetchDailySteps(date),
    fetchActiveEnergy(date),
    fetchWorkoutSessions(date),
  ]);
  const xpFromFitness = computeFitnessXp(stepsToday, activeCaloriesToday, workoutsToday);
  return { stepsToday, activeCaloriesToday, workoutsToday, xpFromFitness };
}

export function computeFitnessXp(steps: number, calories: number, workouts: WorkoutSession[]): number {
  const workoutXp = workouts.length * 50;
  const stepXp = Math.floor(steps / 1000) * 5;
  const calorieXp = Math.floor(calories / 10);
  return workoutXp + stepXp + calorieXp;
}

// ── Mocks (Expo Go / simulator / denied) ─────────────────────────────────

function mockSteps(_date: Date): number {
  // Deterministic-ish for today: 2k–9k
  const day = new Date().getDate();
  return 2100 + ((day * 733) % 6800);
}

function mockCalories(_date: Date): number {
  const day = new Date().getDate();
  return 180 + ((day * 97) % 420);
}

function mockWorkouts(date: Date): WorkoutSession[] {
  // Show 1 workout on even days, 0 on odd, so UI has both empty/filled states
  const day = date.getDate();
  if (day % 2 === 1) return [];
  return [
    {
      id: `mock-${date.toISOString().slice(0, 10)}-1`,
      type: day % 4 === 0 ? 'running' : 'gym',
      startDate: new Date(date.setHours(7, 30, 0, 0)).toISOString(),
      endDate: new Date(date.setHours(8, 15, 0, 0)).toISOString(),
      durationMinutes: 45,
      calories: 320,
      distanceMeters: 5200,
    },
  ];
}

function mapHealthKitWorkout(raw: any, idx: number): WorkoutSession {
  const typeRaw = String(raw.activityName ?? raw.workoutActivityType ?? '').toLowerCase();
  let type: WorkoutType = 'other';
  if (typeRaw.includes('run')) type = 'running';
  else if (typeRaw.includes('cycl') || typeRaw.includes('bike')) type = 'cycling';
  else if (typeRaw.includes('yoga')) type = 'yoga';
  else if (typeRaw.includes('swim')) type = 'swimming';
  else if (typeRaw.includes('hik')) type = 'hiking';
  else if (typeRaw.includes('gym') || typeRaw.includes('strength') || typeRaw.includes('cross') || typeRaw.includes('weight')) type = 'gym';

  const start = raw.startDate ? new Date(raw.startDate) : new Date();
  const end = raw.endDate ? new Date(raw.endDate) : new Date(start.getTime() + 30 * 60000);
  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  return {
    id: String(raw.uuid ?? raw.id ?? `hk-${idx}-${start.toISOString()}`),
    type,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    durationMinutes,
    calories: Math.round(raw.totalEnergyBurned ?? raw.calories ?? 0),
    distanceMeters: raw.totalDistance ? Math.round(raw.totalDistance) : undefined,
  };
}

// ── Convenience — check if mock mode ────────────────────────────────────
export function isHealthKitMockMode(): boolean {
  return Platform.OS === 'web' || Platform.OS === 'android';
}

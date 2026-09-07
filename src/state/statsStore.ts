import { create } from 'zustand';

import { LeagueEntry } from '../types/models';
import { rankLabel, tierForXp, RankTier } from '../services/rankService';

/**
 * Hybrid analytics engine: real Supabase stats + 5 dynamic simulated users.
 * The ticker picks a random simulated user every 8–15 seconds and awards
 * them +25–100 XP for completing a habit. This creates the appearance of
 * a live, active community without requiring real multiplayer backend.
 * Ported from stats_provider.dart.
 */

/** A simulated user that appears on the live leaderboard. */
export interface SimulatedUser {
  name: string;
  initials: string;
  xp: number;
  streak: number;
  level: number;
  readonly baseXp: number;
}

/** The last activity event emitted by the ticker engine. */
export interface ActivityEvent {
  user: SimulatedUser;
  habitName: string;
  xpGain: number;
  timestamp: number;
}

const SIMULATED_USERS: readonly Omit<SimulatedUser, 'baseXp'>[] = [
  { name: 'Alex M.', initials: 'AM', xp: 2340, streak: 19, level: 15 },
  { name: 'Elena R.', initials: 'ER', xp: 1980, streak: 14, level: 12 },
  { name: 'Marcus K.', initials: 'MK', xp: 2670, streak: 28, level: 17 },
  { name: 'Priya S.', initials: 'PS', xp: 1750, streak: 8, level: 10 },
  { name: 'Liam T.', initials: 'LT', xp: 2120, streak: 16, level: 13 },
];

const HABIT_NAMES = [
  'Morning Run',
  'Meditation',
  'Read 30 min',
  'Gym Session',
  'Hydration Goal',
  'Journaling',
  'Cold Shower',
  'Yoga Flow',
  'No Sugar Diet',
  'Code Practice',
  'Gratitude Log',
  'Protein Intake',
] as const;

const MAX_EVENTS = 50;

const tierLabelOf = (xp: number): string => rankLabel(tierForXp(xp, xp > 0 ? 1 : 0));

function makeRoster(): SimulatedUser[] {
  return SIMULATED_USERS.map((u) => ({ ...u, baseXp: u.xp }));
}

export interface StatsShape {
  simulatedUsers: SimulatedUser[];
  /** Most recent simulated activity events (newest first). */
  activity: ActivityEvent[];
}

let timer: ReturnType<typeof setTimeout> | null = null;
let rankChangeCb: ((user: SimulatedUser, newTier: RankTier) => void) | null = null;

function randomInterval(): number {
  return (8 + Math.floor(Math.random() * 8)) * 1000; // 8–15 seconds
}

function tick(): void {
  const state = useStatsStore.getState();

  // Pick a random user
  const idx = Math.floor(Math.random() * state.simulatedUsers.length);
  const user = state.simulatedUsers[idx];

  // Random XP gain: +25 to +100
  const xpGain = 25 + Math.floor(Math.random() * 76);

  // Random habit
  const habitName = HABIT_NAMES[Math.floor(Math.random() * HABIT_NAMES.length)];

  // Track tier before XP gain
  const oldTier = tierForXp(user.xp, 1);

  // Update user stats
  const updated: SimulatedUser = {
    ...user,
    xp: user.xp + xpGain,
    streak: user.streak + 1,
    level: 1 + Math.floor((user.xp + xpGain) / 200),
  };

  // Check for rank change
  const newTier = tierForXp(updated.xp, 1);
  if (newTier !== oldTier && newTier !== RankTier.unranked) {
    rankChangeCb?.(updated, newTier);
  }

  // Record activity
  const event: ActivityEvent = {
    user: updated,
    habitName,
    xpGain,
    timestamp: Date.now(),
  };
  const activity = [event, ...state.activity].slice(0, MAX_EVENTS);

  useStatsStore.setState({
    simulatedUsers: state.simulatedUsers.map((u, i) => (i === idx ? updated : u)),
    activity,
  });

  scheduleNext();
}

function scheduleNext(): void {
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(tick, randomInterval());
}

export function setOnRankChange(cb: ((user: SimulatedUser, newTier: RankTier) => void) | null): void {
  rankChangeCb = cb;
}

/** Starts the activity ticker (the Dart ctor did this automatically). */
export function startTicker(): void {
  if (timer != null) return;
  scheduleNext();
}

export function stopTicker(): void {
  if (timer != null) clearTimeout(timer);
  timer = null;
}

export const useStatsStore = create<StatsShape>(() => ({
  simulatedUsers: makeRoster(),
  activity: [],
}));

// Auto-start like the Dart constructor (`autoStart: true`).
startTicker();

// ── Selectors ───────────────────────────────────────────────────────────────

/** Most recent 20 simulated activity events (newest first). Memoized: hooks need stable references. */
let recentActivityCache: { src: ActivityEvent[]; value: ActivityEvent[] } | null = null;
export function selectRecentActivity(s: StatsShape): ActivityEvent[] {
  if (recentActivityCache?.src === s.activity) return recentActivityCache.value;
  const value = s.activity.slice(0, 20);
  recentActivityCache = { src: s.activity, value };
  return value;
}

/** Latest event for toast display. */
export function selectLatestActivity(s: StatsShape): ActivityEvent | null {
  return s.activity.length === 0 ? null : s.activity[0];
}

/** Merges the real user + simulated users into one XP-descending leaderboard. */
export function mergedLeaderboard(
  s: StatsShape,
  opts: { displayName: string; initials: string; realXp: number; realStreak: number },
): LeagueEntry[] {
  const entries: LeagueEntry[] = [];

  // Add real user
  entries.push({
    rank: 0, // recalculated below
    name: opts.displayName,
    initials: opts.initials,
    xp: opts.realXp,
    streak: opts.realStreak,
    tier: tierLabelOf(opts.realXp),
    isMe: true,
    level: 1 + Math.floor(opts.realXp / 200),
  });

  // Add simulated users
  for (const u of s.simulatedUsers) {
    entries.push({
      rank: 0,
      name: u.name,
      initials: u.initials,
      xp: u.xp,
      streak: u.streak,
      tier: tierLabelOf(u.xp),
      isMe: false,
      level: u.level,
    });
  }

  // Sort by XP descending, then assign ranks
  entries.sort((a, b) => b.xp - a.xp);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

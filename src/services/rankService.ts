import { AppColors } from '../theme/colors';

/** The 7 explicit rank tiers in Qubi, from lowest to highest. */
export enum RankTier {
  unranked = 'unranked',
  bronze = 'bronze',
  silver = 'silver',
  gold = 'gold',
  platinum = 'platinum',
  diamond = 'diamond',
  ultimate = 'ultimate',
  quester = 'quester',
}

const RANK_LABELS: Record<RankTier, string> = {
  [RankTier.unranked]: 'Unranked',
  [RankTier.bronze]: 'Bronze',
  [RankTier.silver]: 'Silver',
  [RankTier.gold]: 'Gold',
  [RankTier.platinum]: 'Platinum',
  [RankTier.diamond]: 'Diamond',
  [RankTier.ultimate]: 'Ultimate',
  [RankTier.quester]: 'Quester',
};

const RANK_EMOJI: Record<RankTier, string> = {
  [RankTier.unranked]: '\u{1F512}',
  [RankTier.bronze]: '\u{1F949}',
  [RankTier.silver]: '\u{1F948}',
  [RankTier.gold]: '\u{1F947}',
  [RankTier.platinum]: '\u{1F48E}',
  [RankTier.diamond]: '\u{1F4A0}',
  [RankTier.ultimate]: '\u26A1',
  [RankTier.quester]: '\u{1F451}',
};

const RANK_COLORS: Record<RankTier, string> = {
  [RankTier.unranked]: AppColors.muted,
  [RankTier.bronze]: '#CD7F32',
  [RankTier.silver]: '#C0C0C0',
  [RankTier.gold]: '#FFCC00',
  [RankTier.platinum]: '#D9E2EC',
  [RankTier.diamond]: '#7ECFE6',
  [RankTier.ultimate]: '#9B59B6',
  [RankTier.quester]: '#0B0B0B',
};

/** Gradient colors for badge backgrounds. */
const RANK_GRADIENTS: Record<RankTier, [string, string]> = {
  [RankTier.unranked]: ['#94A3B8', '#64748B'],
  [RankTier.bronze]: ['#CD7F32', '#8B5E3C'],
  [RankTier.silver]: ['#C0C0C0', '#8E8E8E'],
  [RankTier.gold]: ['#FFCC00', '#E6A800'],
  [RankTier.platinum]: ['#D9E2EC', '#A3B8D0'],
  [RankTier.diamond]: ['#7ECFE6', '#4DA8CC'],
  [RankTier.ultimate]: ['#9B59B6', '#6C3483'],
  [RankTier.quester]: ['#0B0B0B', '#0B0B0B'],
};

const RANK_DESCRIPTIONS: Record<RankTier, string> = {
  [RankTier.unranked]: 'Complete your first task to unlock your rank badge.',
  [RankTier.bronze]: 'The journey begins. Keep completing tasks to climb higher.',
  [RankTier.silver]: "You're building momentum. Stay consistent.",
  [RankTier.gold]: 'A true achiever. Your dedication shows.',
  [RankTier.platinum]: "Exceptional discipline. You're in the top tier.",
  [RankTier.diamond]: 'Rare and brilliant. Almost at the peak.',
  [RankTier.ultimate]: "Transcendent. You've mastered the grind.",
  [RankTier.quester]: 'The apex predator. You ARE Qubi.',
};

export const rankLabel = (t: RankTier) => RANK_LABELS[t];
export const rankEmoji = (t: RankTier) => RANK_EMOJI[t];
export const rankColor = (t: RankTier) => RANK_COLORS[t];
export const rankGradient = (t: RankTier): [string, string] => RANK_GRADIENTS[t];
export const rankDescription = (t: RankTier) => RANK_DESCRIPTIONS[t];

/** Data for a single rank tier display. */
export interface RankTierData {
  tier: RankTier;
  minXp: number;
  maxXp: number;
}

export function tierRange(data: RankTierData): number {
  return data.maxXp - data.minXp;
}

export function tierContains(data: RankTierData, xp: number): boolean {
  return xp >= data.minXp && xp < data.maxXp;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** All 7 rank tiers in ascending order, with their XP boundaries. */
export const RANK_TIERS: readonly RankTierData[] = [
  { tier: RankTier.bronze, minXp: 0, maxXp: 500 },
  { tier: RankTier.silver, minXp: 500, maxXp: 1500 },
  { tier: RankTier.gold, minXp: 1500, maxXp: 3500 },
  { tier: RankTier.platinum, minXp: 3500, maxXp: 7000 },
  { tier: RankTier.diamond, minXp: 7000, maxXp: 12000 },
  { tier: RankTier.ultimate, minXp: 12000, maxXp: 20000 },
  { tier: RankTier.quester, minXp: 20000, maxXp: 999999 },
] as const;

const UNRANKED_DATA: RankTierData = { tier: RankTier.unranked, minXp: 0, maxXp: 0 };

/** Determines the user's rank tier based on their XP. Returns `unranked` if totalCompletions is 0. */
export function tierForXp(xp: number, totalCompletions = 0): RankTier {
  if (totalCompletions <= 0) return RankTier.unranked;
  for (const t of RANK_TIERS) {
    if (tierContains(t, xp)) return t.tier;
  }
  return RankTier.quester; // 20000+ XP
}

/** Returns the current RankTierData for the given XP. */
export function tierDataForXp(xp: number, totalCompletions = 0): RankTierData {
  if (totalCompletions <= 0) return UNRANKED_DATA;
  for (const t of RANK_TIERS) {
    if (tierContains(t, xp)) return t;
  }
  return RANK_TIERS[RANK_TIERS.length - 1]; // quester
}

/** Progress within the current tier (0.0 to 1.0). */
export function tierProgress(xp: number, totalCompletions = 0): number {
  if (totalCompletions <= 0) return 0;
  const data = tierDataForXp(xp, totalCompletions);
  if (tierRange(data) <= 0) return 1;
  const clamped = clamp(xp, data.minXp, data.maxXp);
  return (clamped - data.minXp) / tierRange(data);
}

/** XP remaining to reach the next tier. */
export function xpToNextTier(xp: number, totalCompletions = 0): number {
  if (totalCompletions <= 0) return 0;
  const data = tierDataForXp(xp, totalCompletions);
  if (data.tier === RankTier.quester) return 0;
  return data.maxXp - xp;
}

/** The next rank tier (or null if already Quester). */
export function nextTier(current: RankTier): RankTier | null {
  const values = Object.values(RankTier);
  const idx = values.indexOf(current);
  if (idx < values.length - 1) return values[idx + 1];
  return null;
}

/** Whether reaching newXp crosses a tier boundary compared to oldXp. */
export function tierChanged(oldXp: number, newXp: number, totalCompletions = 0): RankTier | null {
  const oldTier = tierForXp(oldXp, totalCompletions);
  const newTier = tierForXp(newXp, totalCompletions);
  if (newTier !== oldTier && newTier !== RankTier.unranked) return newTier;
  return null;
}

/** String representation of the XP range for a tier. */
export function rangeLabel(data: RankTierData): string {
  if (data.tier === RankTier.quester) return `${data.minXp}+ XP`;
  return `${data.minXp} \u2013 ${data.maxXp - 1} XP`;
}

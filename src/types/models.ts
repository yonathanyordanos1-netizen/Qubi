import { RankTier } from '../services/rankService';

/** Status of a single quest on a given day. */
export enum QuestStatus {
  pending = 'pending',
  verified = 'verified',
  missed = 'missed',
}

/** A trackable habit / quest. */
export interface Habit {
  id: string;
  name: string;
  /** AppIcons stroke name. */
  icon: string;
  time: string;
  category: string;
  emoji: string;
}

export function habitToJson(h: Habit): Record<string, unknown> {
  return { id: h.id, name: h.name, icon: h.icon, time: h.time, category: h.category, emoji: h.emoji };
}

export function habitFromJson(json: Record<string, unknown>): Habit {
  return {
    id: json.id as string,
    name: json.name as string,
    icon: json.icon as string,
    time: json.time as string,
    category: json.category as string,
    emoji: json.emoji as string,
  };
}

/** A chat bubble in the Qubi assistant. */
export interface ChatMessage {
  fromUser: boolean;
  text: string;
}

export function chatMessageToJson(m: ChatMessage): Record<string, unknown> {
  return { fromUser: m.fromUser, text: m.text };
}

export function chatMessageFromJson(json: Record<string, unknown>): ChatMessage {
  return { fromUser: json.fromUser as boolean, text: json.text as string };
}

/** A row in the weekly league leaderboard. */
export interface LeagueEntry {
  rank: number;
  name: string;
  initials: string;
  xp: number;
  streak: number;
  tier: string;
  isMe: boolean;
  level: number;
}

/** Convenience getter to parse the string `tier` into a RankTier enum. */
export function leagueTierEnum(entry: LeagueEntry): RankTier {
  return (
    (Object.values(RankTier) as string[]).includes(entry.tier.toLowerCase())
      ? (entry.tier.toLowerCase() as RankTier)
      : RankTier.bronze
  );
}

import { OpenRouterServiceInstance, AiHttpException } from './openRouter';
import type { PlannedHabit } from '../state/appStore';

/**
 * Qubi AI engine — the high-level coaching API built on top of the
 * OpenRouter-backed client (src/services/openRouter.ts).
 *
 * `askQubi` is the simple one-shot entry point: give it the user's prompt and
 * live context, get a short coaching reply. When AI is unreachable it degrades
 * to a dynamic local coaching engine so the chat never dead-ends.
 *
 * The full streaming chat + routine-plan tool flow lives in QubiScreen via
 * OpenRouterServiceInstance.streamChat.
 */

export interface QubiUserContext {
  name: string;
  level: number;
  streak: number;
}

export async function askQubi(userPrompt: string, userContext: QubiUserContext): Promise<string> {
  try {
    const completion = await OpenRouterServiceInstance.complete({
      tools: false,
      messages: [
        {
          role: 'system',
          content: [
            'You are Qubi, the friendly AI habit coach inside Qubi — a photo-verified habit app.',
            'Reply with at most 3 short, encouraging sentences. No lists.',
            `User profile: name=${userContext.name}, level=${userContext.level}, streak=${userContext.streak} days.`,
          ].join('\n'),
        },
        { role: 'user', content: userPrompt },
      ],
    });
    const text = completion.text?.trim();
    if (text != null && text.length > 0) return text;
    return fallbackReply(userPrompt, userContext);
  } catch (e) {
    if (e instanceof AiHttpException) {
      // Surface rate-limit/credit guidance when available, else coach locally.
      if (!e.retryable) return e.userMessage;
    }
    return fallbackReply(userPrompt, userContext);
  }
}

/** Local dynamic coaching engine used offline / on API failure. */
function fallbackReply(userPrompt: string, ctx: QubiUserContext): string {
  const p = userPrompt.toLowerCase();
  if (p.includes('streak') || p.includes('miss')) {
    return `Hey ${ctx.name}! You're on a ${ctx.streak}-day streak — snap today's photo proof before 9 PM and it stays alive. 🔥`;
  }
  if (p.includes('routine') || p.includes('plan') || p.includes('quest')) {
    return `${ctx.name}, ask me to "generate my routine" and I'll build quests around your day — ${ctx.streak}-day streaks start with one clear plan. 📋`;
  }
  if (p.includes('level') || p.includes('xp')) {
    return `You're Level ${ctx.level} right now. Every verified quest banks +50 XP — two today moves you up. 🚀`;
  }
  return `Hey ${ctx.name}! You're on a ${ctx.streak}-day streak. Keep pushing! 🚀`;
}

/* ── Multi-task intent extraction ─────────────────────────────────────────── */

export type SuggestedCategory = 'Health' | 'Fitness' | 'Productivity' | 'Mindset';
export type SuggestedTimeOfDay = 'Morning' | 'Afternoon' | 'Evening';

export interface SuggestedQuest {
  title: string;
  category: SuggestedCategory;
  timeOfDay: SuggestedTimeOfDay;
  xp: number;
}

export interface QubiResponse {
  text: string;
  suggestedQuests: SuggestedQuest[];
}

interface TaskPattern {
  re: RegExp;
  build: (time: string | null) => SuggestedQuest;
}

const TIME = String.raw`(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)`;

/** Keyword-driven multi-task extractor: finds every activity+time pair in one prompt. */
export function extractTasksFromPrompt(prompt: string): SuggestedQuest[] {
  const tasks: SuggestedQuest[] = [];
  const seen = new Set<string>();
  const push = (t: SuggestedQuest) => {
    const key = t.title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tasks.push(t);
    }
  };

  const patterns: TaskPattern[] = [
    {
      re: new RegExp(String.raw`\bwake\s*up(?:\s+(?:at|by))?\s*${TIME}?`, 'i'),
      build: (time) => ({
        title: time != null ? `Wake up at ${normTime(time)}` : 'Wake up early',
        category: 'Health',
        timeOfDay: 'Morning',
        xp: 50,
      }),
    },
    {
      re: new RegExp(String.raw`\b(?:go\s+for\s+a\s+)?(?:run|jog)\b(?:\s*(?:at|by)?\s*${TIME})?`, 'i'),
      build: (time) => ({
        title: time != null ? `Run at ${normTime(time)}` : 'Go for a run',
        category: 'Fitness',
        timeOfDay: timeSlot(time ?? null, 'Morning'),
        xp: 75,
      }),
    },
    {
      re: new RegExp(String.raw`\b(?:workout|gym|lift|training)\b(?:\s*(?:at|by)?\s*${TIME})?`, 'i'),
      build: (time) => ({
        title: time != null ? `Workout at ${normTime(time)}` : 'Gym session',
        category: 'Fitness',
        timeOfDay: timeSlot(time ?? null, 'Morning'),
        xp: 100,
      }),
    },
    {
      re: new RegExp(String.raw`\b(?:deep\s+work|focus(?:\s+session)?|stud(?:y|ies)|code|coding|project\s+work)\b(?:\s*(?:at|by|for)?\s*${TIME})?`, 'i'),
      build: (time) => ({
        title: time != null ? `Deep work at ${normTime(time)}` : 'Deep work session',
        category: 'Productivity',
        timeOfDay: timeSlot(time ?? null, 'Afternoon'),
        xp: 100,
      }),
    },
    {
      re: new RegExp(String.raw`\bread(?:ing)?\b(?:\s*(?:at|by)?\s*${TIME})?`, 'i'),
      build: (time) => ({
        title: time != null ? `Reading at ${normTime(time)}` : 'Read 20 minutes',
        category: 'Mindset',
        timeOfDay: timeSlot(time ?? null, 'Evening'),
        xp: 50,
      }),
    },
    {
      re: new RegExp(String.raw`\bmeditat(?:e|ion)\b(?:\s*(?:at|by)?\s*${TIME})?`, 'i'),
      build: (time) => ({
        title: time != null ? `Meditate at ${normTime(time)}` : 'Meditate 10 minutes',
        category: 'Mindset',
        timeOfDay: timeSlot(time ?? null, 'Morning'),
        xp: 50,
      }),
    },
    {
      re: new RegExp(String.raw`\b(?:drink\s+)?water\b|\bhydrat\w*\b|\bbreakfast\b`, 'i'),
      build: () => ({ title: 'Hydration & healthy breakfast', category: 'Health', timeOfDay: 'Morning', xp: 50 }),
    },
    {
      re: new RegExp(String.raw`\b(?:evening\s+)?walk\b|\bstretch(?:ing)?\b|\byoga\b`, 'i'),
      build: (time) => ({
        title: time != null ? `Walk at ${normTime(time)}` : 'Evening walk & stretch',
        category: 'Fitness',
        timeOfDay: timeSlot(time ?? null, 'Evening'),
        xp: 50,
      }),
    },
    {
      re: new RegExp(String.raw`\bjournal(?:ing)?\b|\breflect\w*\b|\bgratitude\b`, 'i'),
      build: () => ({ title: 'Journaling & reflection', category: 'Mindset', timeOfDay: 'Evening', xp: 50 }),
    },
    {
      re: new RegExp(String.raw`\b(?:bedtime|sleep|go\s+to\s+bed)\b(?:\s*(?:at|by)?\s*${TIME})?`, 'i'),
      build: (time) => ({
        title: time != null ? `Lights out by ${normTime(time)}` : 'Lights out on time',
        category: 'Health',
        timeOfDay: 'Evening',
        xp: 75,
      }),
    },
  ];

  for (const p of patterns) {
    const m = prompt.match(p.re);
    if (m != null) push(p.build(m[1]?.trim() ?? null));
  }
  return tasks.slice(0, 6);
}

function normTime(t: string): string {
  return t.replace(/\s+/g, ' ').trim().toUpperCase();
}

function timeSlot(time: string | null, fallback: SuggestedTimeOfDay): SuggestedTimeOfDay {
  if (time == null) return fallback;
  const m = time.match(/(\d{1,2})/);
  if (m == null) return fallback;
  let hour = Number.parseInt(m[1], 10);
  const pm = /pm/i.test(time);
  if (pm && hour < 12) hour += 12;
  if (hour < 11) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

/**
 * High-level chat entry point: classifies the prompt, extracts every
 * activity/time goal it contains, and returns Qubi's reply plus the
 * interactive quest suggestions for the UI cards.
 */
export function processQubiMessage(userPrompt: string): QubiResponse {
  const suggestedQuests = extractTasksFromPrompt(userPrompt);
  if (suggestedQuests.length === 0) {
    return {
      text: 'Tell me about your ideal day — activities and times — and I\'ll turn them into quests!',
      suggestedQuests: [],
    };
  }
  const names = suggestedQuests.map((q) => `“${q.title}”`).join(', ');
  return {
    text:
      suggestedQuests.length === 1
        ? `Found one goal: ${names}. Add it to your plan?`
        : `Found ${suggestedQuests.length} goals: ${names}. Add them all to your plan?`,
    suggestedQuests,
  };
}

/** Maps a suggested quest onto the store's habit fields. */
export function suggestedToHabitInput(q: SuggestedQuest): {
  name: string;
  category: string;
  time: string;
  emoji: string;
} {
  const TIME_BY_SLOT: Record<SuggestedTimeOfDay, string> = {
    Morning: '7:30 AM',
    Afternoon: '12:30 PM',
    Evening: '8:00 PM',
  };
  const CATEGORY_MAP: Record<SuggestedCategory, string> = {
    Fitness: 'Fitness',
    Health: 'Wellness',
    Productivity: 'Learning',
    Mindset: 'Wellness',
  };
  const EMOJI_BY_CATEGORY: Record<SuggestedCategory, string> = {
    Fitness: '\u{1F3CB}',
    Health: '\u{1F4A7}',
    Productivity: '\u{1F4D6}',
    Mindset: '\u{1F9D0}',
  };
  return {
    name: q.title,
    category: CATEGORY_MAP[q.category],
    time: TIME_BY_SLOT[q.timeOfDay],
    emoji: EMOJI_BY_CATEGORY[q.category],
  };
}

/* ── Ideal-day routine generation ─────────────────────────────────────────── */

export type QuestCategory = 'Fitness' | 'Mindset' | 'Productivity' | 'Health';
export type QuestTimeOfDay = 'Morning' | 'Afternoon' | 'Evening';

export interface GeneratedQuest {
  id: string;
  title: string;
  category: QuestCategory;
  xp: number;
  timeOfDay: QuestTimeOfDay;
  verificationType: 'camera' | 'check-in';
  completed: boolean;
}

const ROUTINE_SYSTEM_PROMPT = [
  'You convert a user\'s natural-language "ideal day" description into daily quests.',
  'Answer ONLY with a JSON array, no prose, no code fences. Each item:',
  '{"title": string (short imperative, max 6 words), "category": "Fitness"|"Mindset"|"Productivity"|"Health",',
  ' "xp": 50|75|100, "timeOfDay": "Morning"|"Afternoon"|"Evening",',
  ' "verificationType": "camera"|"check-in"}',
  'Rules: 3-6 quests, spread across the day, physical/nutrition items are camera-verified,',
  'work/study items may be check-in. Derive everything from the user description.',
].join('\n');

/** AI-backed with an offline heuristic parser as fallback. */
export async function generateRoutineFromIdealDay(promptText: string): Promise<GeneratedQuest[]> {
  const stamp = Date.now();
  try {
    if (OpenRouterServiceInstance.isConfigured && promptText.trim().length > 0) {
      const completion = await OpenRouterServiceInstance.complete({
        tools: false,
        messages: [
          { role: 'system', content: ROUTINE_SYSTEM_PROMPT },
          { role: 'user', content: promptText },
        ],
      });
      const parsed = parseQuestJson(completion.text ?? '');
      if (parsed.length > 0) {
        return parsed.map((q, i) => ({ ...q, id: `q-${i + 1}-${stamp}`, completed: false }));
      }
    }
  } catch {
    // fall through to the local parser
  }
  return heuristicRoutine(promptText, stamp);
}

function parseQuestJson(raw: string): Array<Omit<GeneratedQuest, 'id' | 'completed'>> {
  try {
    let cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    cleaned = cleaned.substring(start, end + 1);
    const arr = JSON.parse(cleaned) as Record<string, unknown>[];
    if (!Array.isArray(arr)) return [];
    const cats: QuestCategory[] = ['Fitness', 'Mindset', 'Productivity', 'Health'];
    const times: QuestTimeOfDay[] = ['Morning', 'Afternoon', 'Evening'];
    return arr
      .filter((q) => typeof q['title'] === 'string' && (q['title'] as string).length > 0)
      .slice(0, 6)
      .map((q) => ({
        title: String(q['title']),
        category: cats.includes(q['category'] as QuestCategory) ? (q['category'] as QuestCategory) : 'Health',
        xp: typeof q['xp'] === 'number' ? q['xp'] : 50,
        timeOfDay: times.includes(q['timeOfDay'] as QuestTimeOfDay)
          ? (q['timeOfDay'] as QuestTimeOfDay)
          : 'Morning',
        verificationType: q['verificationType'] === 'check-in' ? 'check-in' : 'camera',
      }));
  } catch {
    return [];
  }
}

/** Keyword-driven local routine builder used when AI is offline. */
function heuristicRoutine(promptText: string, stamp: number): GeneratedQuest[] {
  const p = promptText.toLowerCase();
  const out: GeneratedQuest[] = [];
  const push = (title: string, category: QuestCategory, xp: number, timeOfDay: QuestTimeOfDay) =>
    out.push({
      id: `q-${out.length + 1}-${stamp}`,
      title,
      category,
      xp,
      timeOfDay,
      verificationType: category === 'Productivity' ? 'check-in' : 'camera',
      completed: false,
    });

  if (/gym|workout|run|lift|exercise|train/.test(p)) push('Training Session', 'Fitness', 100, 'Morning');
  if (/water|hydrat|breakfast|meal|vitamin|protein/.test(p)) push('Hydration & Breakfast', 'Health', 50, 'Morning');
  if (/work|code|deep|focus|project|study|write/.test(p)) push('Deep Work Session', 'Productivity', 100, 'Afternoon');
  if (/read|journal|meditat|minds|reflect/.test(p)) push('Reading & Wind-Down', 'Mindset', 75, 'Evening');
  if (/walk|stretch|yoga|mobility/.test(p)) push('Evening Walk & Stretch', 'Fitness', 50, 'Evening');

  if (out.length === 0) {
    return [
      { id: `q-1-${stamp}`, title: 'Morning Focus & Hydration', category: 'Health', xp: 50, timeOfDay: 'Morning', verificationType: 'camera', completed: false },
      { id: `q-2-${stamp}`, title: '45-Min Deep Work Session', category: 'Productivity', xp: 100, timeOfDay: 'Afternoon', verificationType: 'check-in', completed: false },
      { id: `q-3-${stamp}`, title: 'Evening Wind-Down & Reading', category: 'Mindset', xp: 75, timeOfDay: 'Evening', verificationType: 'camera', completed: false },
    ];
  }
  return out.slice(0, 5);
}

/** Maps generated quests onto the store's PlannedHabit shape (id/title/category/time). */
export function questsToPlannedHabits(quests: GeneratedQuest[]): PlannedHabit[] {
  const TIME_BY_SLOT: Record<QuestTimeOfDay, string> = {
    Morning: '7:30 AM',
    Afternoon: '12:30 PM',
    Evening: '8:00 PM',
  };
  const CATEGORY_MAP: Record<QuestCategory, string> = {
    Fitness: 'Fitness',
    Mindset: 'Wellness',
    Productivity: 'Learning',
    Health: 'Wellness',
  };
  return quests.map((q) => ({
    title: q.title,
    category: CATEGORY_MAP[q.category],
    timeOfDay: TIME_BY_SLOT[q.timeOfDay],
    frequencyDays: [0, 1, 2, 3, 4, 5, 6],
  }));
}

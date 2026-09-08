import { AppConfig } from './config';
import { supabase } from './supabase';
import type { Habit } from '../types/models';

/**
 * Autonomous AI photo verification.
 *
 * Instead of asking the user which quest they completed, the vision model
 * inspects the photo, identifies what it shows, and matches it against the
 * list of pending quests on its own. Failures throw a retryable error so the
 * UI can offer a retry — verification never auto-accepts.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODELS = [
  AppConfig.openRouterVisionModel,
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-4-maverick:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
].filter((m, i, a) => m.length > 0 && a.indexOf(m) === i);

/**
 * Generic scenes that can never prove an activity on their own. If the photo
 * only contains these, verification fails no matter what the model says.
 */
const GENERIC_SCENES = [
  'door',
  'wall',
  'floor',
  'ceiling',
  'window',
  'blind',
  'furniture',
  'table',
  'desk',
  'chair',
  'sofa',
  'couch',
  'bed',
  'lamp',
  'curtain',
  'ceiling fan',
  'empty room',
  'hallway',
  'stairs',
];

function isGenericOnly(objects: string[]): boolean {
  const meaningful = objects.filter(
    (o) => !GENERIC_SCENES.some((g) => o.toLowerCase().includes(g)),
  );
  return objects.length > 0 && meaningful.length === 0;
}

export type DifficultyLevel = 'Low' | 'Medium' | 'High' | 'Intense';

/** AI XP grading bands — the model picks within a band; we clamp server-side. */
export const XP_BANDS: Record<DifficultyLevel, { min: number; max: number }> = {
  Low: { min: 10, max: 20 },
  Medium: { min: 25, max: 45 },
  High: { min: 50, max: 80 },
  Intense: { min: 85, max: 120 },
};

const DIFFICULTIES: readonly DifficultyLevel[] = ['Low', 'Medium', 'High', 'Intense'];

function parseDifficulty(raw: unknown): DifficultyLevel | null {
  if (typeof raw !== 'string') return null;
  const canon = raw.trim().toLowerCase();
  const hit = DIFFICULTIES.find((d) => d.toLowerCase() === canon);
  return hit ?? null;
}

/** Derives the band whose range contains the XP (nearest band otherwise). */
export function inferDifficulty(xp: number): DifficultyLevel {
  for (const d of DIFFICULTIES) {
    const band = XP_BANDS[d];
    if (xp >= band.min && xp <= band.max) return d;
  }
  let best: DifficultyLevel = 'Medium';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const d of DIFFICULTIES) {
    const band = XP_BANDS[d];
    const dist = xp < band.min ? band.min - xp : xp - band.max;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

/** Clamps a model-proposed amount into its difficulty band (0..120 hard cap). */
export function clampXpForDifficulty(raw: unknown, difficulty: DifficultyLevel): number {
  const band = XP_BANDS[difficulty];
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : band.min;
  return Math.max(band.min, Math.min(band.max, Math.max(0, Math.min(120, n))));
}

export interface VisionVerificationResult {
  success: boolean;
  detectedObjects: string[];
  description: string;
  matchedQuestId: string | null;
  matchedQuestTitle: string | null;
  xpEarned: number;
  message: string;
  /** Model-reported confidence (0..1) when known; null for proxy/sim paths. */
  confidence: number | null;
  /** AI-graded effort band for this proof (null only when unverifiable). */
  difficulty: DifficultyLevel | null;
  /** Task name as reported by the model (falls back to the matched quest). */
  taskName: string | null;
  /** Short celebratory / coaching line for the reward modal (null when rejected). */
  qubiComment: string | null;
  /** Model's effort reasoning, persisted to the proof history ledger. */
  reasoning: string | null;
}

/**
 * Normalizes camera base64 payloads for the OpenRouter Vision API.
 * Strips `data:image/...;base64,` prefixes (double-prefixing breaks the call),
 * whitespace/newlines, and URL-safe alphabet variants.
 */
export function normalizeBase64Image(raw: string): string {
  let out = (raw ?? '').trim();
  const comma = out.indexOf(',');
  if (out.startsWith('data:') && comma >= 0) out = out.slice(comma + 1);
  out = out.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  return out;
}

/**
 * @param imageBase64 JPEG bytes base64-encoded (from camera / image picker).
 * @param pendingHabits All uncompleted quests for today.
 */
export async function verifyProofWithAI(
  imageBase64: string,
  pendingHabits: Habit[],
): Promise<VisionVerificationResult> {
  try {
    const clean = normalizeBase64Image(imageBase64);
    if (clean.length === 0 || pendingHabits.length === 0) {
      throw new Error('vision-unavailable');
    }

    // ── Preferred path: secure Edge Function proxy (API key stays server-side).
    if (AppConfig.verifyFunctionUrl.length > 0) {
      const edgeResult = await verifyViaEdgeFunction(clean, pendingHabits);
      if (edgeResult != null) return edgeResult;
    }

    if (!AppConfig.aiConfigured) throw new Error('vision-unavailable');
    const questList = pendingHabits.map((q) => `- id=${q.id} · "${q.name}" (${q.category})`).join('\n');
    let lastError: unknown = null;

    for (const model of VISION_MODELS) {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AppConfig.openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://Qubi.app',
            'X-Title': 'Qubi',
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 600,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text:
                      'You are Qubi\'s STRICT autonomous proof verifier AND difficulty grader. Inspect the photo, identify what it shows, and decide which ONE pending quest it genuinely proves. Pending quests:\n' +
                      `${questList}\n\n` +
                      'CONTEXTUAL MATCHING RULES — the photo must contain the environment/objects the quest INTENT implies:\n' +
                      '- "Wake up"/morning quests REQUIRE morning context: a bed, alarm clock, sunrise/morning light, coffee or breakfast.\n' +
                      '- Gym/workout/run quests REQUIRE fitness context: gym equipment, dumbbells, running shoes, sportswear, outdoor running scene.\n' +
                      '- Reading/study quests REQUIRE books, notes, e-reader, desk-with-books.\n' +
                      '- Hydration/breakfast quests REQUIRE water, glass/bottle, or an actual meal.\n' +
                      '- A PC monitor, keyboard, door, blank wall, floor or random furniture proves NOTHING.\n' +
                      'REJECTION FORMAT: when context mismatches, set isValid=false, matchedQuestId=null and start "description" with exactly what you see, e.g. ' +
                      '"I see a computer monitor. This does not match your task." Never guess. Approving a wrong quest is worse than rejecting.\n\n' +
                      'DIFFICULTY GRADING — evaluate physical + mental effort from the image and task, then award XP inside the matching band:\n' +
                      '- Low (10-20 XP): drinking water, vitamins, making bed, quick stretch.\n' +
                      '- Medium (25-45 XP): healthy meal, 15-min reading, walk, cleaning room.\n' +
                      '- High (50-80 XP): gym workout, running, heavy studying, coding sprint.\n' +
                      '- Intense (85-120 XP): marathon, intense weight session, multi-hour study/workout.\n' +
                      'If isValid is false, xpAwarded MUST be 0 and qubiComment MUST give short constructive feedback.\n' +
                      'Answer ONLY with JSON: {"isValid": boolean, "taskName": string, "difficultyLevel": "Low"|"Medium"|"High"|"Intense", ' +
                      '"xpAwarded": number, "reasoning": string, "qubiComment": string, "matchedQuestId": string|null, ' +
                      '"confidence": 0..1, "detectedObjects": string[], "description": string}.',
                  },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${clean}` } },
                ],
              },
            ],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = JSON.parse(await res.text()) as Record<string, unknown>;
        const message = ((data['choices'] as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined)?.[
          'message'
        ] as Record<string, unknown> | undefined;
        const verdict = parseVerdict((message?.['content'] as string) ?? '', pendingHabits);
        if (verdict != null) return verdict;
        throw new Error('unparseable-verdict');
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error('all-models-failed');
  } catch (error) {
    // Never auto-accept. Surface the real failure so the UI can show a
    // retryable message — no offline simulator that grants free XP.
    throw error;
  }
}

/** Calls the secure Supabase Edge Function proxy. Returns null when unavailable. */
async function verifyViaEdgeFunction(
  imageBase64: string,
  pendingHabits: Habit[],
): Promise<VisionVerificationResult | null> {
  try {
    const { data: sessionData } = await supabase?.auth.getSession() ?? { data: null };
    const token = sessionData?.session?.access_token ?? '';
    const target = pendingHabits[0];
    const res = await fetch(AppConfig.verifyFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token.length > 0 ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        task_title: target?.name ?? 'daily quest',
        quest_category: target?.category ?? 'Wellness',
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success?: boolean; reason?: string; detectedObjects?: string[] };
    if (typeof data.success !== 'boolean') return null;
    const objects = Array.isArray(data.detectedObjects) ? data.detectedObjects : [];
    if (data.success) {
      const matched = pendingHabits[0];
      // Proxy path carries no grading — fall back to the standard quest reward.
      const difficulty = inferDifficulty(50);
      const comment = data.reason ?? `Verified "${matched?.name ?? 'quest'}"!`;
      return {
        success: true,
        detectedObjects: objects,
        description: comment,
        matchedQuestId: matched?.id ?? null,
        matchedQuestTitle: matched?.name ?? null,
        xpEarned: 50,
        message: `${comment} +50 XP 🎉`,
        confidence: null,
        difficulty,
        taskName: matched?.name ?? null,
        qubiComment: comment,
        reasoning: null,
      };
    }
    return {
      success: false,
      detectedObjects: objects,
      description: data.reason ?? '',
      matchedQuestId: null,
      matchedQuestTitle: null,
      xpEarned: 0,
      message: data.reason ?? 'Proof rejected. 0 XP awarded.',
      confidence: null,
      difficulty: null,
      taskName: null,
      qubiComment: data.reason ?? null,
      reasoning: null,
    };
  } catch {
    return null; // fall through to direct OpenRouter / local simulator
  }
}

function parseVerdict(raw: string, pending: Habit[]): VisionVerificationResult | null {  try {
    let cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    cleaned = cleaned.substring(start, end + 1);
    const json = JSON.parse(cleaned) as Record<string, unknown>;
    const matchedId = typeof json['matchedQuestId'] === 'string' ? json['matchedQuestId'] : null;
    const matched = matchedId != null ? pending.find((q) => q.id === matchedId) : undefined;
    const confidence = typeof json['confidence'] === 'number' ? json['confidence'] : 0.8;
    const objects = Array.isArray(json['detectedObjects'])
      ? (json['detectedObjects'] as unknown[]).filter((o): o is string => typeof o === 'string')
      : [];
    const description =
      typeof json['description'] === 'string' && json['description'].length > 0
        ? json['description']
        : '';
    const isValid = json['isValid'] !== false;
    const taskName =
      typeof json['taskName'] === 'string' && json['taskName'].length > 0
        ? json['taskName']
        : (matched?.name ?? null);
    const reasoning =
      typeof json['reasoning'] === 'string' && json['reasoning'].length > 0
        ? json['reasoning']
        : null;
    const modelComment =
      typeof json['qubiComment'] === 'string' && json['qubiComment'].length > 0
        ? json['qubiComment']
        : null;

    const fail = (
      message: string,
      fallbackDescription: string,
    ): VisionVerificationResult => ({
      success: false,
      detectedObjects: objects,
      description: description.length > 0 ? description : fallbackDescription,
      matchedQuestId: null,
      matchedQuestTitle: null,
      xpEarned: 0,
      message,
      confidence,
      difficulty: null,
      taskName,
      // Rejected proofs surface the model's constructive feedback when present.
      qubiComment: modelComment,
      reasoning,
    });

    // ── Strict rejection path: invalid / no match / low confidence → 0 XP.
    if (!isValid || matched == null || confidence < 0.35) {
      const seen = objects.length > 0 ? objects.join(', ') : 'an unrelated scene';
      return fail(
        modelComment ??
          (`Proof Rejected: ${description.length > 0 ? description : `I see ${seen}`}. ` +
            `This does not match any of your pending quests. 0 XP awarded.`),
        `I see ${seen}.`,
      );
    }

    // A "match" backed only by generic scenery is still a false positive.
    if (isGenericOnly(objects)) {
      return fail(
        modelComment ??
          (`I see only a door/wall/furniture-type scene (${objects.join(', ')}), which doesn't match your task '${matched.name}'. ` +
            `Please capture evidence of your actual activity! 0 XP awarded.`),
        `I see ${objects.join(', ')}.`,
      );
    }

    // ── Graded success: clamp the model's XP into its difficulty band ──
    const difficulty = parseDifficulty(json['difficultyLevel']) ?? inferDifficulty(
      typeof json['xpAwarded'] === 'number' && Number.isFinite(json['xpAwarded'])
        ? Math.round(json['xpAwarded'])
        : 50,
    );
    const xp = clampXpForDifficulty(json['xpAwarded'], difficulty);
    const comment = modelComment ?? `Verified '${matched.name}' (+${xp} XP) 🎉`;
    return {
      success: true,
      detectedObjects: objects.length > 0 ? objects : [matched.name],
      description: description.length > 0 ? description : `I see your ${matched.category.toLowerCase()} setup — this proves "${matched.name}"!`,
      matchedQuestId: matched.id,
      matchedQuestTitle: matched.name,
      xpEarned: xp,
      message: `${comment} (+${xp} XP) 🎉`,
      confidence,
      difficulty,
      taskName: taskName ?? matched.name,
      qubiComment: comment,
      reasoning,
    };
  } catch {
    return null;
  }
}

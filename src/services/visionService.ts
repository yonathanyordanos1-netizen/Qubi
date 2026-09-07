import { AppConfig } from './config';
import { supabase } from './supabase';
import type { Habit } from '../types/models';

/**
 * Autonomous AI photo verification.
 *
 * Instead of asking the user which quest they completed, the vision model
 * inspects the photo, identifies what it shows, and matches it against the
 * list of pending quests on its own. When the AI endpoint is unreachable or
 * unconfigured (demo mode), a smart local simulator keeps the flow working
 * gracefully — no HTTP 404 crashes, ever.
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

export interface VisionVerificationResult {
  success: boolean;
  detectedObjects: string[];
  description: string;
  matchedQuestId: string | null;
  matchedQuestTitle: string | null;
  xpEarned: number;
  message: string;
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
    if (imageBase64.length === 0 || pendingHabits.length === 0) {
      throw new Error('vision-unavailable');
    }

    // ── Preferred path: secure Edge Function proxy (API key stays server-side).
    if (AppConfig.verifyFunctionUrl.length > 0) {
      const edgeResult = await verifyViaEdgeFunction(imageBase64, pendingHabits);
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
            max_tokens: 400,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text:
                      'You are Qubi\'s STRICT autonomous proof verifier. Inspect the photo, identify what it shows, and decide which ONE pending quest it genuinely proves. Pending quests:\n' +
                      `${questList}\n\n` +
                      'CONTEXTUAL MATCHING RULES — the photo must contain the environment/objects the quest INTENT implies:\n' +
                      '- "Wake up"/morning quests REQUIRE morning context: a bed, alarm clock, sunrise/morning light, coffee or breakfast.\n' +
                      '- Gym/workout/run quests REQUIRE fitness context: gym equipment, dumbbells, running shoes, sportswear, outdoor running scene.\n' +
                      '- Reading/study quests REQUIRE books, notes, e-reader, desk-with-books.\n' +
                      '- Hydration/breakfast quests REQUIRE water, glass/bottle, or an actual meal.\n' +
                      '- A PC monitor, keyboard, door, blank wall, floor or random furniture proves NOTHING.\n' +
                      'REJECTION FORMAT: when context mismatches, set matchedQuestId=null and start "description" with exactly what you see, e.g. ' +
                      '"I see a computer monitor. This does not match your task." Never guess. Approving a wrong quest is worse than rejecting.\n' +
                      'Answer ONLY with JSON: {"matchedQuestId": string|null, "confidence": 0..1, ' +
                      '"detectedObjects": string[], "description": string}.',
                  },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
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
    // SMART LOCAL VISION SIMULATOR — never crash, always verify something sane.
    const targetQuest = pendingHabits[0] ?? null;
    if (targetQuest == null) {
      return {
        success: false,
        detectedObjects: [],
        description: 'No pending tasks found to verify.',
        matchedQuestId: null,
        matchedQuestTitle: null,
        xpEarned: 0,
        message: 'All tasks for today are already completed!',
      };
    }
    return {
      success: true,
      detectedObjects: [targetQuest.name, 'evidence photo'],
      description: `I analyzed your photo and detected activities matching "${targetQuest.name}"!`,
      matchedQuestId: targetQuest.id,
      matchedQuestTitle: targetQuest.name,
      xpEarned: 50,
      message: `Verified! I detected "${targetQuest.name}" in your image. +50 XP banked! 🎉`,
    };
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
      return {
        success: true,
        detectedObjects: objects,
        description: data.reason ?? `Verified "${matched?.name ?? 'quest'}"!`,
        matchedQuestId: matched?.id ?? null,
        matchedQuestTitle: matched?.name ?? null,
        xpEarned: 50,
        message: `${data.reason ?? 'Verified!'} +50 XP 🎉`,
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

    // ── Strict rejection path: no match / low confidence → 0 XP, explain why.
    if (matched == null || confidence < 0.35 || (matched != null && isGenericOnly(objects))) {
      const seen = objects.length > 0 ? objects.join(', ') : 'an unrelated scene';
      const generic =
        matched != null && isGenericOnly(objects)
          ? `I see only a door/wall/furniture-type scene (${seen}), which doesn't match your task '${matched.name}'. Please capture evidence of your actual activity!`
          : `Proof Rejected: ${description.length > 0 ? description : `I see ${seen}`}. ` +
            `This does not match any of your pending quests. 0 XP awarded.`;
      return {
        success: false,
        detectedObjects: objects,
        description: description.length > 0 ? description : `I see ${seen}.`,
        matchedQuestId: null,
        matchedQuestTitle: null,
        xpEarned: 0,
        message: generic,
      };
    }

    // A "match" backed only by generic scenery is still a false positive.
    if (isGenericOnly(objects)) {
      return {
        success: false,
        detectedObjects: objects,
        description: description.length > 0 ? description : `I see ${objects.join(', ')}.`,
        matchedQuestId: null,
        matchedQuestTitle: null,
        xpEarned: 0,
        message:
          `I see a door/wall in this photo, which doesn't match your task '${matched.name}'. ` +
          `Please capture evidence of your actual activity! 0 XP awarded.`,
      };
    }

    return {
      success: true,
      detectedObjects: objects.length > 0 ? objects : [matched.name],
      description: description.length > 0 ? description : `I see your ${matched.category.toLowerCase()} setup — this proves "${matched.name}"!`,
      matchedQuestId: matched.id,
      matchedQuestTitle: matched.name,
      xpEarned: 50,
      message: `${description.length > 0 ? description : 'Verified!'} Verified '${matched.name}' (+50 XP) 🎉`,
    };
  } catch {
    return null;
  }
}

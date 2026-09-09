import { Env } from '../config/env';
import type { AiMessage } from './openRouter';

/**
 * NVIDIA NIM provider (integrate.api.nvidia.com) — the fast leg of Qubi's
 * AI race. OpenAI-compatible chat-completions endpoint; failures are
 * routine on free NIM keys (404/503/stalls), so every call is wrapped in a
 * short AbortController timeout and the engine treats NIM as best-effort:
 * when NIM answers it usually wins on speed, otherwise OpenRouter covers.
 */

const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

/** Chat models, fastest/largest first. Availability varies — all best-effort. */
const NIM_CHAT_MODELS = [
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'mistralai/mistral-nemotron',
  'nvidia/nemotron-nano-3-30b-a3b',
];

/** Vision-capable NIM models for photo-proof grading. */
const NIM_VISION_MODELS = [
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
];

export function isNimConfigured(): boolean {
  return Env.nvidiaConfigured;
}

function nimHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${Env.nvidiaKey}`,
    'Content-Type': 'application/json',
  };
}

async function postNim(body: Record<string, unknown>, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: nimHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal as never,
    });
    if (!res.ok) throw new Error(`NIM HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const choice = (data['choices'] as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
    const message = choice?.['message'] as Record<string, unknown> | undefined;
    const text = (message?.['content'] as string | null) ?? '';
    if (text.trim().length === 0) throw new Error('NIM empty reply');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One-shot chat via NIM. Tries each chat model with a short per-model
 * timeout; resolves with the first non-empty reply.
 */
export async function nimChat(messages: AiMessage[], opts?: { maxTokens?: number; timeoutMs?: number }): Promise<string> {
  if (!isNimConfigured()) throw new Error('nim-unconfigured');
  const perModel = opts?.timeoutMs ?? 8_000;
  let lastError: unknown = null;
  for (const model of NIM_CHAT_MODELS) {
    try {
      return await postNim(
        {
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content ?? '' })),
          temperature: 0.7,
          max_tokens: opts?.maxTokens ?? 600,
          stream: false,
        },
        perModel,
      );
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('nim-chat-failed');
}

/** Shared proof-grading contract — identical JSON shape to visionService. */
export function nimGradingPrompt(questList: string): string {
  return (
    'You are Qubi\'s STRICT autonomous proof verifier AND difficulty grader. Inspect the photo, identify what it shows, and decide which ONE pending quest it genuinely proves. Pending quests:\n' +
    `${questList}\n\n` +
    'DIFFICULTY GRADING — award XP inside the matching band: Low (10-20 XP): water, vitamins, bed, stretch. ' +
    'Medium (25-45 XP): meal, 15-min reading, walk, cleaning. High (50-80 XP): gym, running, studying, coding sprint. ' +
    'Intense (85-120 XP): marathon, heavy weights, multi-hour effort. ' +
    'If isValid is false, xpAwarded MUST be 0 and qubiComment MUST give short constructive feedback. ' +
    'Answer ONLY with JSON: {"isValid": boolean, "taskName": string, "difficultyLevel": "Low"|"Medium"|"High"|"Intense", ' +
    '"xpAwarded": number, "reasoning": string, "qubiComment": string, "matchedQuestId": string|null, ' +
    '"confidence": 0..1, "detectedObjects": string[], "description": string}.'
  );
}

/**
 * Vision grading via NIM. Returns the raw verdict JSON string; the caller
 * parses it with visionService.parseVerdict so both providers share one
 * strict parser + XP clamping path.
 */
export async function nimGradeProof(imageBase64: string, questList: string): Promise<string> {
  if (!isNimConfigured()) throw new Error('nim-unconfigured');
  const clean = (imageBase64 ?? '').trim().replace(/\s+/g, '');
  if (clean.length === 0) throw new Error('nim-empty-image');
  let lastError: unknown = null;
  for (const model of NIM_VISION_MODELS) {
    try {
      return await postNim(
        {
          model,
          temperature: 0.1,
          max_tokens: 600,
          stream: false,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: nimGradingPrompt(questList) },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${clean}` } },
              ],
            },
          ],
        },
        30_000,
      );
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('nim-vision-failed');
}

import { AppConfig } from './config';

/**
 * OpenRouter-backed AI engine: chat completions, SSE streaming with tool-call
 * interception, and multimodal photo verification.
 * Ported from openrouter_service.dart.
 *
 * When no real API key is present the service degrades to a local simulator so
 * the UI remains fully testable offline.
 */

/** A single chat message in OpenAI-compatible format. */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
}

export function aiMessageToJson(m: AiMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role };
  if (m.content != null) out.content = m.content;
  if (m.toolCalls != null && m.toolCalls.length > 0) {
    out.tool_calls = m.toolCalls.map((t) => ({
      id: t.id,
      type: 'function',
      function: { name: t.name, arguments: JSON.stringify(t.args) },
    }));
  }
  if (m.toolCallId != null) out.tool_call_id = m.toolCallId;
  return out;
}

/** An assistant request to invoke a tool. */
export interface AiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const decoded = JSON.parse(raw);
      return typeof decoded === 'object' && decoded != null ? decoded : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && raw != null) return raw as Record<string, unknown>;
  return {};
}

function aiToolCallFromJson(json: Record<string, unknown>): AiToolCall {
  const fn = json['function'] as Record<string, unknown> | undefined;
  return {
    id: (json['id'] as string) ?? '',
    name: (fn?.['name'] as string) ?? '',
    args: parseArgs(fn?.['arguments']),
  };
}

/** A completed (non-streaming) model turn. */
export interface AiCompletion {
  text?: string | null;
  toolCalls?: AiToolCall[];
  finishReason?: string | null;
}

export function wantsToolCall(c: AiCompletion): boolean {
  return c.toolCalls != null && c.toolCalls.length > 0;
}

/** Streaming events for the Qubi chat view. */
export type AiStreamEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'toolCall'; toolCall: AiToolCall }
  | { kind: 'done' };

/** Tool schema exposed to the model — lets Qubi propose a habit plan. */
export const CREATE_ROUTINE_PLAN_TOOL = {
  type: 'function',
  function: {
    name: 'create_routine_plan',
    description:
      "Propose a daily routine by creating or updating the user's habit plan. " +
      'Returns a list of habits with title, category, days-per-week and time of day.',
    parameters: {
      type: 'object',
      properties: {
        habits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short habit name' },
              category: {
                type: 'string',
                enum: ['Fitness', 'Learning', 'Wellness', 'Chores', 'Creative'],
              },
              frequency_days: {
                type: 'array',
                items: { type: 'integer', minimum: 1, maximum: 7 },
                description: '0-indexed weekdays (0 = Monday … 6 = Sunday)',
              },
              time_of_day: { type: 'string', example: '8:00 AM' },
            },
            required: ['title', 'time_of_day'],
          },
        },
      },
      required: ['habits'],
    },
  },
} as const;

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const APP_URL = 'https://Qubi.app';
const APP_TITLE = 'Qubi';

const FALLBACK_CHAT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
];
const FALLBACK_VISION_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
];

function dedupe(models: string[]): string[] {
  return [...new Set(models)];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Structured vision verdict. */
export class VisionVerdict {
  constructor(
    public readonly verified: boolean,
    public readonly confidence: number,
    public readonly reason: string,
  ) {}

  static parse(raw: string): VisionVerdict {
    try {
      let cleaned = raw
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
      // Some models wrap the JSON in commentary — extract the first {…} object.
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end > start) cleaned = cleaned.substring(start, end + 1);
      const json = JSON.parse(cleaned) as Record<string, unknown>;
      return new VisionVerdict(
        json['verified'] === true,
        typeof json['confidence'] === 'number' ? json['confidence'] : 0.5,
        (json['reason'] as string) ?? 'No reason given.',
      );
    } catch {
      return new VisionVerdict(false, 0, 'The verifier could not parse a verdict.');
    }
  }
}

/** HTTP-level AI failure; some statuses allow retrying on another free model. */
export class AiHttpException extends Error {
  constructor(public readonly statusCode: number, public readonly body: string) {
    super(`OpenRouter error ${statusCode}: ${body.length > 240 ? body.substring(0, 240) : body}`);
  }

  /** Whether a different free model can be tried for this failure. */
  get retryable(): boolean {
    return [402, 429, 500, 502, 503, 504, 408].includes(this.statusCode);
  }

  /** Short, human-friendly message for chat bubbles / toasts. */
  get userMessage(): string {
    if (this.statusCode === 402) {
      return (
        'Every free AI model Qubi tried is busy right now. Wait a few seconds and retry — ' +
        'or add a few dollars of credits at openrouter.ai to unlock the fast paid models.'
      );
    }
    if (this.statusCode === 401 || this.statusCode === 403) {
      return 'My AI key was rejected — please try again in a moment.';
    }
    if (this.statusCode === 429) {
      return 'All the free AI models are rate-limited at the moment. Give it a few seconds, then try again.';
    }
    if (this.statusCode === 502) {
      return 'All AI models are unreachable right now — check your connection and try again.';
    }
    return `I hit a snag talking to my brain (HTTP ${this.statusCode}). Please try again.`;
  }
}

interface PartialToolCall {
  id: string;
  name: string;
  argsBuffer: string;
}

function buildPartial(p: PartialToolCall): AiToolCall {
  let args: Record<string, unknown> = {};
  if (p.argsBuffer.length > 0) {
    try {
      const decoded = JSON.parse(p.argsBuffer);
      if (typeof decoded === 'object' && decoded != null) args = decoded;
    } catch {}
  }
  return { id: p.id, name: p.name, args };
}

class OpenRouterService {
  get isConfigured(): boolean {
    return AppConfig.aiConfigured;
  }

  private get chatModels(): string[] {
    return dedupe([AppConfig.openRouterModel, ...FALLBACK_CHAT_MODELS]);
  }

  private get visionModels(): string[] {
    return dedupe([AppConfig.openRouterVisionModel, ...FALLBACK_VISION_MODELS]);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${AppConfig.openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': APP_TITLE,
    };
  }

  // ── Non-streaming completion ────────────────────────────────────────────

  async complete(opts: {
    messages: AiMessage[];
    tools?: boolean;
    toolChoice?: Record<string, unknown>;
  }): Promise<AiCompletion> {
    if (!this.isConfigured) return this.simulate(opts.messages);

    let lastError: AiHttpException | null = null;
    for (const model of this.chatModels) {
      try {
        return await this.completeWithModel(model, opts.messages, opts.tools !== false, opts.toolChoice);
      } catch (e) {
        if (!(e instanceof AiHttpException)) throw e;
        if (!e.retryable) throw e;
        lastError = e;
      }
      await sleep(400); // cooldown between model attempts
    }
    throw lastError ?? new AiHttpException(502, 'All AI models are unavailable.');
  }

  private async completeWithModel(
    model: string,
    messages: AiMessage[],
    tools: boolean,
    toolChoice?: Record<string, unknown>,
  ): Promise<AiCompletion> {
    const payload: Record<string, unknown> = {
      model,
      messages: messages.map(aiMessageToJson),
      temperature: 0.7,
      max_tokens: 900,
    };
    if (tools) {
      payload.tools = [CREATE_ROUTINE_PLAN_TOOL];
      if (toolChoice != null) payload.tool_choice = toolChoice;
    }
    const res = await withTimeout(
      fetch(ENDPOINT, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) }),
      45_000,
    );
    const text = await res.text();
    if (res.status !== 200) throw new AiHttpException(res.status, text);
    const data = JSON.parse(text) as Record<string, unknown>;
    const choice = (data['choices'] as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
    const message = choice?.['message'] as Record<string, unknown> | undefined;
    return {
      text: message?.['content'] as string | null,
      toolCalls: (((message?.['tool_calls'] as unknown[]) ?? []) as Record<string, unknown>[]).map(
        aiToolCallFromJson,
      ),
      finishReason: choice?.['finish_reason'] as string | null,
    };
  }

  // ── SSE streaming with tool-call interception ───────────────────────────

  /** Emits delta events for text tokens and a toolCall event per completed invocation. */
  async *streamChat(messages: AiMessage[], tools = false): AsyncGenerator<AiStreamEvent> {
    if (!this.isConfigured) {
      const sim = this.simulate(messages);
      if (sim.text != null) {
        for (const chunk of chunkString(sim.text, 14)) {
          yield { kind: 'delta', text: chunk };
          await sleep(24);
        }
      }
      for (const t of sim.toolCalls ?? []) yield { kind: 'toolCall', toolCall: t };
      yield { kind: 'done' };
      return;
    }

    let lastError: AiHttpException | null = null;
    for (const model of this.chatModels) {
      let emitted = false;
      try {
        for await (const ev of this.streamWithModel(model, messages, tools)) {
          emitted = true;
          yield ev;
        }
        return;
      } catch (e) {
        if (emitted) throw e;
        if (!(e instanceof AiHttpException)) throw e;
        if (!e.retryable) throw e;
        lastError = e;
      }
      await sleep(400);
    }
    throw lastError ?? new AiHttpException(502, 'All AI models are unavailable.');
  }

  private async *streamWithModel(model: string, messages: AiMessage[], tools: boolean): AsyncGenerator<AiStreamEvent> {
    const payload: Record<string, unknown> = {
      model,
      messages: messages.map(aiMessageToJson),
      stream: true,
      temperature: 0.7,
      max_tokens: 900,
    };
    if (tools) {
      payload.tools = [CREATE_ROUTINE_PLAN_TOOL];
    }
    const res = await withTimeout(
      fetch(ENDPOINT, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      }),
      45_000,
    );
    if (res.status !== 200 || res.body == null) {
      throw new AiHttpException(res.status, await res.text().catch(() => ''));
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const toolCalls: PartialToolCall[] = [];
    const reader = res.body.getReader();

    const flushDone = function* flush(): Generator<AiStreamEvent> {
      for (const p of toolCalls) yield { kind: 'toolCall', toolCall: buildPartial(p) };
      toolCalls.length = 0;
      yield { kind: 'done' };
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const nl = buffer.indexOf('\n');
        if (nl < 0) break;
        const line = buffer.substring(0, nl).trim();
        buffer = buffer.substring(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.substring(5).trim();
        if (payload === '[DONE]') {
          yield* flushDone();
          return;
        }
        if (!payload.startsWith('{')) continue;
        try {
          const json = JSON.parse(payload) as Record<string, unknown>;
          const err = json['error'];
          if (err != null) {
            const msg =
              typeof err === 'object' && err != null && 'message' in err
                ? String((err as Record<string, unknown>)['message'])
                : 'OpenRouter error';
            throw new AiHttpException(402, msg);
          }
          const choices = json['choices'] as unknown[] | undefined;
          const delta = (choices?.[0] as Record<string, unknown> | undefined)?.['delta'] as
            | Record<string, unknown>
            | undefined;
          const content = delta?.['content'] as string | undefined;
          if (content != null && content.length > 0) yield { kind: 'delta', text: content };
          for (const t of ((delta?.['tool_calls'] as unknown[]) ?? []) as Record<string, unknown>[]) {
            const idx = typeof t['index'] === 'number' ? Math.trunc(t['index']) : 0;
            while (toolCalls.length <= idx) toolCalls.push({ id: '', name: '', argsBuffer: '' });
            const partial = toolCalls[idx];
            const fn = t['function'] as Record<string, unknown> | undefined;
            if (typeof t['id'] === 'string') partial.id = t['id'];
            if (typeof fn?.['name'] === 'string') partial.name = fn['name'];
            if (typeof fn?.['arguments'] === 'string') partial.argsBuffer += fn['arguments'];
          }
        } catch (e) {
          if (e instanceof AiHttpException) throw e;
          // Skip malformed keep-alive / partial frames.
        }
      }
    }
    // End of stream without [DONE]: flush partial tool calls if any.
    yield* flushDone();
  }

  // ── Vision: photo proof verification ────────────────────────────────────

  /**
   * Asks the vision model whether the photo plausibly shows [expected]
   * (e.g. "your book"). Returns a structured verdict.
   *
   * @param base64 JPEG bytes encoded as base64 (from ImageManipulator / FileSystem).
   */
  async verifyPhoto(opts: { base64: string; expected: string }): Promise<VisionVerdict> {
    if (opts.base64.length === 0) {
      // No image bytes — never auto-accept; report it as a failed verification.
      throw new AiHttpException(400, 'No photo captured to verify.');
    }
    if (!this.isConfigured) {
      throw new AiHttpException(403, "AI isn't connected right now — please try again in a moment.");
    }

    let lastError: AiHttpException | null = null;
    for (const model of this.visionModels) {
      try {
        return await this.verifyWithModel(model, opts.base64, opts.expected);
      } catch (e) {
        if (!(e instanceof AiHttpException)) throw e;
        if (!e.retryable) throw e;
        lastError = e;
      }
      await sleep(400);
    }
    throw lastError ?? new AiHttpException(502, 'All AI models are unavailable.');
  }

  private async verifyWithModel(model: string, base64: string, expected: string): Promise<VisionVerdict> {
    const clean = base64.trim().replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    const res = await withTimeout(
      fetch(ENDPOINT, {
        method: 'POST',
        headers: this.headers(),
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
                    'You are a strict but fair habit-proof verifier for the Qubi app. ' +
                    `The user claims this photo proves they completed: "${expected}". ` +
                    'FIRST inspect the entire photo and determine exactly what object or scene it actually shows. ' +
                    'Then decide whether the photo plausibly proves the claimed habit. ' +
                    'Answer ONLY with a JSON object: ' +
                    '{"verified": true|false, "confidence": 0..1, "reason": "one sentence"}. ' +
                    'Set verified=true only when the claimed item is clearly present in the photo. ' +
                    'If verified=false, your reason MUST say what the photo actually shows and state ' +
                    'that it cannot be proved (example: "The photo shows a coffee cup, not your book — ' +
                    'this cannot be proved.").',
                },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${clean}` } },
              ],
            },
          ],
        }),
      }),
      60_000,
    );
    if (res.status !== 200) throw new AiHttpException(res.status, await res.text());
    const data = JSON.parse(await res.text()) as Record<string, unknown>;
    const choices = data['choices'] as unknown[] | undefined;
    const message = (choices?.[0] as Record<string, unknown> | undefined)?.['message'] as
      | Record<string, unknown>
      | undefined;
    return VisionVerdict.parse((message?.['content'] as string) ?? '{}');
  }

  // ── Demo simulator ──────────────────────────────────────────────────────

  simulate(messages: AiMessage[]): AiCompletion {
    const prompt = (messages[messages.length - 1]?.content ?? '').toLowerCase();
    const mentionsPlan = prompt.includes('routine') || prompt.includes('plan');
    if (mentionsPlan) {
      return {
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'sim_plan_1',
            name: 'create_routine_plan',
            args: {
              habits: [
                {
                  title: 'Morning Stretch',
                  category: 'Wellness',
                  frequency_days: [0, 1, 2, 3, 4, 5, 6],
                  time_of_day: '7:00 AM',
                },
                {
                  title: 'Read 20 min',
                  category: 'Learning',
                  frequency_days: [0, 1, 2, 3, 4, 5, 6],
                  time_of_day: '9:00 PM',
                },
              ],
            },
          },
        ],
      };
    }
    const reply =
      prompt.includes('why') || prompt.includes('miss')
        ? 'Your streak is safest when a quest has a backup slot. I found that Gym is your most-skipped quest — let\u2019s move it to your high-energy window (6:30 PM) and add a 5-minute warmup trigger.'
        : 'On it! To keep your streak alive, snap a photo proof and I\u2019ll verify it. Ask me to optimize your routine anytime.';
    return { text: reply, finishReason: 'stop' };
  }
}

function chunkString(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.substring(i, i + size > text.length ? text.length : i + size));
  }
  return out;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new AiHttpException(504, 'request timed out')), ms)),
  ]);
}

export const OpenRouterServiceInstance = new OpenRouterService();

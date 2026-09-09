import {
  OpenRouterServiceInstance,
  type AiMessage,
} from './openRouter';
import { isNimConfigured, nimChat } from './nvidiaNim';

/**
 * Qubi AI engine — fastest-wins race across providers.
 *
 * Every request fires all configured legs concurrently and resolves with
 * the FIRST success (not the first settlement). Slow/stalled legs are
 * simply ignored once a winner lands; if every leg fails, the last error
 * is thrown so callers can degrade to local replies.
 */

/** Run all factories concurrently; resolve with the first fulfillment. */
export function firstSuccess<T>(factories: Array<() => Promise<T>>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (factories.length === 0) {
      reject(new Error('no-ai-legs'));
      return;
    }
    let pending = factories.length;
    let lastError: unknown = new Error('all-ai-legs-failed');
    let settled = false;
    for (const run of factories) {
      try {
        const p = run();
        p.then(
          (value) => {
            if (!settled) {
              settled = true;
              resolve(value);
            }
          },
          (err) => {
            lastError = err;
            pending -= 1;
            if (pending <= 0 && !settled) {
              settled = true;
              reject(lastError);
            }
          },
        );
      } catch (err) {
        lastError = err;
        pending -= 1;
        if (pending <= 0 && !settled) {
          settled = true;
          reject(lastError);
        }
      }
    }
  });
}

function nonEmpty(text: string): string {
  const trimmed = (text ?? '').trim();
  if (trimmed.length === 0) throw new Error('empty-ai-reply');
  return trimmed;
}

async function openRouterChatLeg(messages: AiMessage[]): Promise<string> {
  const completion = await OpenRouterServiceInstance.complete({ messages, tools: false });
  return nonEmpty(completion.text ?? '');
}

/**
 * One-shot coaching reply — NVIDIA NIM and OpenRouter race; the faster
 * provider wins. Overall ceiling ~40s; typical win in 2–6s.
 */
export async function chatReply(messages: AiMessage[]): Promise<string> {
  const legs: Array<() => Promise<string>> = [];
  if (isNimConfigured()) {
    legs.push(() => nimChat(messages, { maxTokens: 600, timeoutMs: 8_000 }).then(nonEmpty));
  }
  legs.push(() => openRouterChatLeg(messages));
  return firstSuccess(legs);
}

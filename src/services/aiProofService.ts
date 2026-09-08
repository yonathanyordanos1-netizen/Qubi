/**
 * Canonical AI proof-verification service (OpenRouter Vision).
 *
 * Thin wrapper over `visionService.verifyProofWithAI` that guarantees the
 * base64 payload is normalized for the Vision API, then persists rewards:
 * on success it banks the AI-graded XP + bumps the streak via the Supabase
 * RPC path (`verify_completion` → atomic xp/total_xp/level update), writes
 * the graded proof to the `activity_proofs` ledger, and mirrors the
 * aggregates onto the user profile row so stats always read from live
 * Supabase queries.
 */
import { normalizeBase64Image, verifyProofWithAI, type VisionVerificationResult } from './visionService';
import { SupabaseServiceInstance } from './supabase';
import { useAppStore } from '../state/appStore';
import type { Habit } from '../types/models';

export type { VisionVerificationResult };
export { normalizeBase64Image };

/** Fallback award when the model grades without a usable amount. */
export const PROOF_XP_REWARD = 50;

/**
 * Verifies a camera capture against today's pending quests.
 * Accepts raw or `data:`-prefixed base64 (normalizes before the API call).
 */
export async function verifyCameraProof(
  imageBase64: string,
  pendingHabits: Habit[],
): Promise<VisionVerificationResult> {
  return verifyProofWithAI(normalizeBase64Image(imageBase64), pendingHabits);
}

export interface ProofAward {
  xpAmount: number;
  difficulty?: string;
  taskName?: string;
}

/**
 * Awards the AI-graded XP for a verified quest: marks the habit verified
 * locally (which fires the Supabase `verify_completion` RPC + profile upsert
 * + `activity_proofs` ledger write), then pulls the authoritative profile
 * back so streak / XP / rank / level stay live.
 * Returns the post-sync `{ xp, streak }`.
 */
export async function awardProofXp(
  habitId: string,
  proofPath?: string,
  award?: ProofAward,
): Promise<{ xp: number; streak: number }> {
  const store = useAppStore.getState();
  await store.verifyHabit(habitId, proofPath, award?.xpAmount ?? PROOF_XP_REWARD, award?.difficulty ?? 'Medium', award?.taskName);
  try {
    await store.refreshProfileStats();
  } catch {
    // Offline — optimistic local stats remain authoritative.
  }
  const after = useAppStore.getState();
  return { xp: after.xp, streak: after.streak };
}

/** True when the backend + AI key are present for end-to-end verification. */
export function isProofBackendOnline(): boolean {
  return SupabaseServiceInstance.isConfigured;
}

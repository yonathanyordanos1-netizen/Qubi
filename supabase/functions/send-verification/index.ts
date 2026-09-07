// Supabase Edge Function: send-verification
// Resend-backed custom email OTP pipeline for Qubi.
//
//   send          -> server generates a 6-digit code, stores only its SHA-256
//                    hash, emails it via Resend. Per-email resend cooldown +
//                    hourly cap.
//   verify        -> checks the hashed code (max 5 attempts), marks verified
//                    and confirms the Supabase auth user's email via admin API.
//   check-user    -> reports whether an auth user already exists for the
//                    email (no side effects — sends nothing). Used by signup
//                    to say "account already exists" instead of dispatching
//                    a code into the void.
//   confirm-email -> fallback: confirms a user's email ONLY when a code for
//                    that email was verified within the last 30 minutes.
//
// Deploy:
//   supabase secrets set RESEND_API_KEY=re_... RESEND_FROM_EMAIL="Qubi <noreply@questify-app.com>"
//   supabase functions deploy send-verification
//
// Secrets: RESEND_API_KEY (required), RESEND_FROM_EMAIL (optional).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// NOTE: the sender domain must be verified in Resend (or use onboarding@resend.dev
// for testing — test senders can only email the Resend account owner).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FALLBACK_FROM = 'Questify <noreply@questify-app.com>';
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function resendFrom(): string {
  try {
    const v = Deno.env.get('RESEND_FROM_EMAIL');
    if (v != null && v.trim().length > 0) return v.trim();
  } catch {
    // env access denied — fall through
  }
  return FALLBACK_FROM;
}

/** Cryptographically random 6-digit numeric code (server-side only). */
function generateCode(): string {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => String(n % 10)).join('');
}

/** SHA-256 hash -> hex string (Web Crypto API). */
async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Branded to match supabase/email-templates/magiclink_otp.html (Qubi Orange). */
function otpEmailHtml(code: string, email: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#FFF7ED;">
<center style="width:100%;background-color:#FFF7ED;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
<tr><td style="background-color:#F97316;padding:28px 24px;text-align:center;" bgcolor="#F97316">
<span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:900;color:#FFFFFF;">Qubi</span>
</td></tr>
<tr><td style="background-color:#FFFFFF;padding:32px 32px 28px 32px;border-left:1px solid #FFE4CC;border-right:1px solid #FFE4CC;">
<h1 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#111827;">Your Qubi sign-in code</h1>
<p style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#6B7280;">Use the code below to verify <strong style="color:#111827;">${email}</strong>. It expires in ${CODE_TTL_MINUTES} minutes.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td align="center" style="background-color:#FFF7ED;border:1px solid #FFE4CC;border-radius:12px;padding:18px 16px;">
<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;color:#9CA3AF;">ONE-TIME CODE</p>
<p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:800;letter-spacing:8px;color:#111827;">${code}</p>
<p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9CA3AF;">Enter this in the Qubi app (don't share it)</p>
</td></tr></table>
<p style="margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9CA3AF;">If you didn't request this, you can safely ignore this email.</p>
</td></tr>
<tr><td style="background-color:#FFF7ED;padding:18px 32px 28px 32px;text-align:center;border-left:1px solid #FFE4CC;border-right:1px solid #FFE4CC;border-bottom:1px solid #FFE4CC;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9CA3AF;">&copy; 2026 Qubi — Build unstoppable habits.</p>
</td></tr>
</table></center></body></html>`;
}

function otpEmailText(code: string): string {
  return `Your Qubi verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. If you didn't create an account, you can safely ignore this email.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => null);
    const action = body?.action as string | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (action !== 'send' && action !== 'verify' && action !== 'check-user' && action !== 'confirm-email') {
      return jsonResp({ error: 'Unknown action' }, 400);
    }
    if (!isValidEmail(email)) return jsonResp({ error: 'A valid email is required' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl == null || serviceKey == null) {
      console.error('[send-verification] missing SUPABASE_URL / SERVICE_ROLE_KEY');
      return jsonResp({ error: 'Email service is not configured. Please try again later.' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── SEND ─────────────────────────────────────────────────────────────
    if (action === 'send') {
      const now = Date.now();

      const cooldownCutoff = new Date(now - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
      const { data: recent } = await supabase
        .from('verification_codes')
        .select('created_at')
        .eq('email', email)
        .gte('created_at', cooldownCutoff)
        .limit(1);
      if (recent != null && recent.length > 0) {
        return jsonResp(
          { error: 'Please wait before requesting another code', retryAfter: RESEND_COOLDOWN_SECONDS },
          429,
        );
      }

      const hourCutoff = new Date(now - 3600 * 1000).toISOString();
      const { count } = await supabase
        .from('verification_codes')
        .select('id', { count: 'exact', head: true })
        .eq('email', email)
        .gte('created_at', hourCutoff);
      if ((count ?? 0) >= MAX_SENDS_PER_HOUR) {
        return jsonResp({ error: 'Too many codes requested. Try again later.', retryAfter: 3600 }, 429);
      }

      const code = generateCode();
      const code_hash = await sha256hex(code);
      const { error: insertErr } = await supabase.from('verification_codes').insert({
        email,
        code_hash,
        status: 'pending',
      });
      if (insertErr) {
        console.error('[send] insert error:', insertErr);
        return jsonResp({ error: 'Failed to store verification code' }, 500);
      }

      const apiKey = Deno.env.get('RESEND_API_KEY');
      if (apiKey == null || apiKey.length === 0) {
        console.error('[send] RESEND_API_KEY secret is not set');
        await supabase.from('verification_codes').delete().eq('email', email).eq('status', 'pending');
        return jsonResp({ error: 'Email service is not configured. Please try again later.' }, 500);
      }

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom(),
          to: email,
          subject: `${code} is your Qubi verification code`,
          html: otpEmailHtml(code, email),
          text: otpEmailText(code),
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error(`[send] resend error (${resendRes.status}):`, errText);
        await supabase.from('verification_codes').delete().eq('email', email).eq('status', 'pending');
        const configErr = resendRes.status === 401 || resendRes.status === 403;
        return jsonResp(
          { error: configErr ? 'Email service is not configured. Please try again later.' : 'Failed to send verification email' },
          502,
        );
      }

      console.log(`[send] code dispatched to ${email}`);
      return jsonResp({ ok: true });
    }

    // ── VERIFY ───────────────────────────────────────────────────────────
    if (action === 'verify') {
      const rawCode = typeof body?.code === 'string' ? body.code.trim() : '';
      if (!/^\d{6}$/.test(rawCode)) return jsonResp({ error: 'A 6-digit code is required' }, 400);
      const userId = typeof body?.userId === 'string' ? body.userId : undefined;

      const { data: rows } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('email', email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);
      const row = rows?.[0];
      if (row == null) return jsonResp({ error: 'No active code. Request a new one.' }, 401);

      if (new Date(row.expires_at as string).getTime() <= Date.now()) {
        await supabase.from('verification_codes').update({ status: 'expired' }).eq('id', row.id);
        return jsonResp({ error: 'This code has expired. Request a new one.' }, 401);
      }

      const attemptsLeft = Math.max(0, MAX_VERIFY_ATTEMPTS - ((row.attempts as number) ?? 0));
      if (attemptsLeft <= 0) {
        await supabase.from('verification_codes').update({ status: 'failed' }).eq('id', row.id);
        return jsonResp({ error: 'Too many incorrect attempts. Request a new code.', locked: true }, 429);
      }

      const candidateHash = await sha256hex(rawCode);
      if (candidateHash !== row.code_hash) {
        const usedAttempts = (((row.attempts as number) ?? 0) as number) + 1;
        const failedOut = usedAttempts >= MAX_VERIFY_ATTEMPTS;
        await supabase
          .from('verification_codes')
          .update({ attempts: usedAttempts, ...(failedOut ? { status: 'failed' } : {}) })
          .eq('id', row.id);
        return jsonResp(
          {
            error: failedOut
              ? 'Too many incorrect attempts. Request a new code.'
              : `Incorrect code. ${MAX_VERIFY_ATTEMPTS - usedAttempts} attempts remaining.`,
            ...(failedOut ? { locked: true } : {}),
            attemptsLeft: Math.max(0, MAX_VERIFY_ATTEMPTS - usedAttempts),
          },
          401,
        );
      }

      await supabase.from('verification_codes').update({ status: 'verified' }).eq('id', row.id);

      let emailConfirmed = false;
      try {
        emailConfirmed = await confirmAuthUserEmail(supabase, email, userId);
      } catch (confirmErr) {
        console.error('[verify] confirm failed:', confirmErr);
      }
      console.log(`[verify] success for ${email} (email_confirmed=${emailConfirmed})`);
      return jsonResp({ ok: true, emailConfirmed });
    }

    // ── CHECK-USER (existence probe, no side effects) ──────────────────
    if (action === 'check-user') {
      const targetId = await findUserIdByEmail(supabase, email);
      return jsonResp({ exists: targetId != null });
    }

    // ── CONFIRM-EMAIL (fallback) ─────────────────────────────────────────
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: proof } = await supabase
      .from('verification_codes')
      .select('id')
      .eq('email', email)
      .eq('status', 'verified')
      .gte('created_at', cutoff)
      .limit(1);
    if (proof == null || proof.length === 0) {
      return jsonResp({ error: 'No recent verification found for this email' }, 403);
    }
    const confirmed = await confirmAuthUserEmail(supabase, email);
    if (!confirmed) return jsonResp({ error: 'Failed to confirm email or user not found' }, 500);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('[send-verification] error:', err);
    return jsonResp({ error: 'Internal server error' }, 500);
  }
});

async function confirmAuthUserEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
  userId?: string,
): Promise<boolean> {
  let targetId: string | null = null;

  if (userId != null) {
    const { data: byId, error: byIdErr } = await supabase.auth.admin.getUserById(userId);
    if (byIdErr) {
      console.error('[confirm] getUserById error:', byIdErr);
    } else if (byId?.user?.email?.toLowerCase() === email) {
      targetId = byId.user.id;
    }
  }

  if (targetId == null) {
    targetId = await findUserIdByEmail(supabase, email);
  }

  if (targetId == null) {
    console.error(`[confirm] no auth user found for ${email}`);
    return false;
  }
  const { error: updateErr } = await supabase.auth.admin.updateUserById(targetId, { email_confirm: true });
  if (updateErr) {
    console.error('[confirm] updateUserById error:', updateErr);
    return false;
  }
  return true;
}

/** Finds the auth user id for [email] via the admin API (service_role). */
async function findUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const perPage = 1000;
  const maxPages = 20;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
    if (listErr) {
      console.error('[lookup] listUsers error:', listErr);
      break;
    }
    const users = data?.users ?? [];
    const found = users.find((u) => u.email?.toLowerCase() === email);
    if (found != null) return found.id;
    if (users.length < perPage) break;
  }
  return null;
}

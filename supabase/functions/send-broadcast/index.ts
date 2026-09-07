import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface BroadcastPayload {
  title: string;
  body: string;
  secretKey: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN_BROADCAST_KEY = Deno.env.get('ADMIN_BROADCAST_KEY');

if (!ADMIN_BROADCAST_KEY) {
  console.error('ADMIN_BROADCAST_KEY not set in environment variables');
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function sendExpoPushBatch(
  tokens: string[],
  title: string,
  body: string,
): Promise<{ ok: boolean; details?: string }[]> {
  const payload = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: { type: 'broadcast' },
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const results = Array.isArray(parsed) ? parsed : parsed?.data ?? [];

  return results.map((r: any, i: number) => {
    if (!r) return { ok: false, details: `empty response for #${i}` };
    return {
      ok: Boolean(!r.error && (r.status === 'ok' || r.status === 200)) && res.ok,
      details: r.error ? JSON.stringify(r.error) : r.status ?? String(res.status),
    };
  });
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const bodyText = typeof body?.body === 'string' ? body.body.trim() : '';
    const secretKey = typeof body?.secretKey === 'string' ? body.secretKey : '';

    if (!title || !bodyText) {
      return jsonResp({ error: 'Title and body are required' }, 400);
    }
    if (!ADMIN_BROADCAST_KEY || secretKey !== ADMIN_BROADCAST_KEY) {
      return jsonResp({ error: 'Invalid secret key' }, 403);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl == null || serviceKey == null) {
      console.error('[send-broadcast] missing SUPABASE_URL / SERVICE_ROLE_KEY');
      return jsonResp({ error: 'Broadcast service is not configured.' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const seen = new Set<string>();
    const tokens: string[] = [];
    const collect = (raw: string | null | undefined, tokens: string[], seen: Set<string>) => {
      if (raw != null && raw.trim().length > 0 && !seen.has(raw)) {
        seen.add(raw);
        tokens.push(raw);
      }
    };

    const { data: pushTokenRows, error: pushErr } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token')
      .not('expo_push_token', 'is', null);
    if (pushErr) throw pushErr;
    for (const row of pushTokenRows || []) collect(row.expo_push_token, tokens, seen);

    const { data: profileRows, error: profileErr } = await supabase
      .from('profiles')
      .select('push_token')
      .not('push_token', 'is', null);
    if (profileErr) throw profileErr;
    for (const row of profileRows || []) collect(row.push_token, tokens, seen);

    const batches = chunkArray(tokens, 100);
    let totalSent = 0;
    let totalSuccessful = 0;
    const failures: string[] = [];

    for (const batch of batches) {
      const results = await sendExpoPushBatch(batch, title, bodyText);
      totalSent += batch.length;
      results.forEach((r, i) => {
        if (r.ok) totalSuccessful += 1;
        else failures.push(`${batch[i]} -> ${r.details ?? 'failed'}`);
      });
    }

    const { error: logErr } = await supabase.from('broadcast_logs').insert({
      title,
      body: bodyText,
      sent_count: totalSuccessful,
    });
    if (logErr) console.error('[send-broadcast] log insert error:', logErr);

    console.log(
      `[send-broadcast] sent=${totalSent} ok=${totalSuccessful} fail=${failures.length}`,
    );
    return jsonResp({
      status: 'success',
      recipientCount: totalSent,
      successCount: totalSuccessful,
      failures: failures.slice(0, 20),
    });
  } catch (err) {
    console.error('[send-broadcast] error:', err);
    return jsonResp({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
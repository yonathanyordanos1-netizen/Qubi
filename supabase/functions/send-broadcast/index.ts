import type { HttpsRequest } from '@cloudflare/platform-sdk';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import type { EdgeFunctionRequest } from '@supabase/functions-js';

interface BroadcastPayload {
  title: string;
  body: string;
  secretKey: string;
}

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

async function sendExpoPush(token: string, title: string, body: string): Promise<boolean> {
  const payload = JSON.stringify({
    to: token,
    sound: 'default',
    title,
    body,
    data: { type: 'broadcast' },
  });

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload,
  });

  const data = await res.json();
  // Consider success if data error is not present
  return !data.error;
}

serve(
  async (req: Request): Promise<Response> => {
    try {
      const json = (await req.json()) as BroadcastPayload;
      const { title, body, secretKey } = json;

      // Validate secret key
      if (secretKey !== ADMIN_BROADCAST_KEY) {
        return new Response(
          JSON.stringify({ error: 'Invalid secret key' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Fetch all distinct push tokens
      const { data: tokens, error } = await supabase
        .from('user_push_tokens')
        .select('expo_push_token')
        .not('expo_push_token', 'is', null);

      if (error) throw error;

      const tokenStrings = (tokens || []).map((t: any) => t.expo_push_token);

      // Chunk into batches of 100
      const batches = chunkArray(tokenStrings, 100);

      let totalSent = 0;
      let totalSuccessful = 0;

      for (const batch of batches) {
        const results = await Promise.all(batch.map((token) => sendExpoPush(token, title, body)));
        totalSent += batch.length;
        totalSuccessful += results.filter((r) => r).length;
      }

      // Insert broadcast log
      const { error: logError } = await supabase
        .from('broadcast_logs')
        .insert({ title, body, sent_count: totalSuccessful });

      if (logError) throw logError;

      return new Response(
        JSON.stringify({
          status: 'success',
          recipientCount: totalSent,
          successCount: totalSuccessful,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      console.error('Broadcast error:', err);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
);
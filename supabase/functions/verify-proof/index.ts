// Supabase Edge Function: verify-proof
// Securely proxies OpenRouter free vision models so the API key never ships
// in the client bundle. Falls back through a list of free models automatically.
//
// Deploy:
//   supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
//   supabase functions deploy verify-proof
//
// POST /functions/v1/verify-proof
//   body: { image_base64: string, task_title: string, quest_category?: string }
//   auth: Bearer <supabase user JWT>
//   → { success: boolean, reason: string, detectedObjects: string[] }

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS = [
  Deno.env.get('OPENROUTER_VISION_MODEL') ?? 'google/gemma-3-27b-it:free',
  'meta-llama/llama-4-maverick:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface VerifyRequest {
  image_base64?: string;
  task_title?: string;
  quest_category?: string;
}

function buildPrompt(taskTitle: string, category: string): string {
  return [
    "You are Questify's STRICT proof verifier. Inspect the photo and decide whether it genuinely proves the quest.",
    `Quest: "${taskTitle}" (category: ${category}).`,
    '',
    'CONTEXTUAL MATCHING RULES:',
    '- "Wake up"/morning quests REQUIRE morning context: bed, alarm clock, sunrise/morning light, coffee, breakfast.',
    '- Gym/workout/run quests REQUIRE fitness context: gym equipment, dumbbells, running shoes, sportswear, running outdoors.',
    '- Reading/study quests REQUIRE books, notes, e-reader, or a desk with study materials.',
    '- Hydration/meal quests REQUIRE water, a bottle/glass, or an actual meal.',
    '- A PC monitor, keyboard, door, blank wall, floor, or random furniture proves NOTHING.',
    '',
    'REJECTION FORMAT: when context mismatches, start "reason" with exactly what you see,',
    'e.g. "I see a computer monitor. This does not match your task."',
    'Answer ONLY with JSON: {"success": true|false, "reason": string, "detectedObjects": string[]}.',
  ].join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Require a signed-in Questify user.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (apiKey == null || apiKey.length === 0) {
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let body: VerifyRequest;
  try {
    body = (await req.json()) as VerifyRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const imageBase64 = body.image_base64 ?? '';
  const taskTitle = body.task_title ?? 'daily quest';
  const category = body.quest_category ?? 'Wellness';
  if (imageBase64.length === 0) {
    return new Response(JSON.stringify({ error: 'image_base64 is required' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    let lastError: string | null = null;
    for (const model of MODELS) {
      try {
        const res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://questify.app',
            'X-Title': 'Questify',
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 400,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: buildPrompt(taskTitle, category) },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                ],
              },
            ],
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          lastError = `OpenRouter ${res.status}: ${text.slice(0, 240)}`;
          if (res.status === 402 || res.status === 429 || res.status >= 500) continue; // try next free model
          break;
        }

        const data = JSON.parse(await res.text());
        const content: string = data?.choices?.[0]?.message?.content ?? '{}';
        const cleaned = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        const json = JSON.parse(start >= 0 && end > start ? cleaned.substring(start, end + 1) : '{}');

        return new Response(
          JSON.stringify({
            success: json.success === true,
            reason: typeof json.reason === 'string' ? json.reason : 'No analysis returned.',
            detectedObjects: Array.isArray(json.detectedObjects) ? json.detectedObjects : [],
          }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        continue;
      }
    }
    return new Response(JSON.stringify({ error: lastError ?? 'All free models unavailable' }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Verification failed' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 4;
const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 1200;
const MAX_TOTAL_CHARS = 10000;

const ALLOWED_ACTION_TYPES = new Set(['navigate', 'check_balance']);
const ALLOWED_ROUTES = new Set([
  'airtime-purchase',
  'data-purchase',
  'transfer',
  'add-money',
  'electricity',
  'cable-tv',
  'betting',
  'education',
  '(tabs)/transactions',
  '(tabs)/pay-bills',
]);

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ActionPayload = {
  type: 'navigate' | 'check_balance';
  route?: string;
  label: string;
};

type ValidatedMessages = {
  messages: ChatMessage[];
  totalChars: number;
};

type SafeResponse = {
  response: {
    success: true;
    reply: string;
    suggestions: string[];
    action?: ActionPayload;
  };
  meta: {
    intentAction?: ActionPayload;
    modelAction?: ActionPayload;
  };
};

const SYSTEM_PROMPT = `You are Netpay AI, a helpful assistant for Netpay — a Nigerian fintech platform.

ALWAYS respond with a valid JSON object in EXACTLY this format (no markdown, no code blocks, raw JSON only):
{
  "reply": "Your response here. Use **bold** for emphasis. Use \\n for line breaks. Use - for bullet lists.",
  "suggestions": ["Option 1", "Option 2", "Option 3"],
  "action": {
    "type": "navigate",
    "route": "airtime-purchase",
    "label": "Buy Airtime →"
  }
}

Rules:
- "reply" is REQUIRED — always include it.
- "suggestions" is REQUIRED — always include 2–4 short follow-up options relevant to the conversation.
- "action" is OPTIONAL — only include when the user clearly wants to do a specific task. Omit it otherwise.
- Never wrap the JSON in markdown code blocks.
- Users can chat naturally like ChatGPT. If the user asks a general question (not about Netpay), answer helpfully and clearly.
- For Netpay intents (airtime, data, transfers, bills, balance, account actions), provide practical in-app guidance.
- Keep answers concise first, then add brief detail only when needed.
- If a request is unsafe, illegal, or fraudulent, refuse briefly and suggest a safer alternative.

Action order (STRICT):
1) If user asks for wallet/balance, use action {"type":"check_balance"}.
2) If user asks for transaction history, use route "(tabs)/transactions".
3) If user asks to pay bills generally, use route "(tabs)/pay-bills".
4) If user asks a specific service task (airtime/data/electricity/cable/betting/education/transfer/add-money), use that exact route.
5) If no clear in-app intent, omit action.

Available action routes (use exact string):
- "airtime-purchase" → buy airtime
- "data-purchase" → buy data bundle
- "transfer" → send money to another user
- "add-money" → fund wallet / add money
- "electricity" → pay electricity bill
- "cable-tv" → pay DSTV, GOtv, Startimes
- "betting" → fund betting wallet
- "education" → JAMB, WAEC, NECO payments
- "(tabs)/transactions" → view transaction history
- "(tabs)/pay-bills" → all bill payment options

For balance inquiries use action type "check_balance" (no route):
{ "type": "check_balance", "label": "Show My Balance" }

You help with:
- Airtime & data purchases (MTN, Airtel, Glo, 9Mobile)
- Bill payments (electricity, cable TV, betting, education)
- Fund transfers between Netpay users
- Account questions, security (PIN, password, biometrics)
- Nigerian fintech topics
- General questions and everyday assistance

Keep replies concise and friendly. Format Naira amounts as ₦. Do not give financial advice.`;

function sanitizeText(input: unknown, fallback = ''): string {
  if (typeof input !== 'string') return fallback;
  return input.replace(/\u0000/g, '').trim();
}

function validateAndNormalizeMessages(raw: unknown): ValidatedMessages {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('messages array is required');
  }

  let totalChars = 0;
  const normalized: ChatMessage[] = [];

  for (const item of raw.slice(-MAX_MESSAGES)) {
    const role = item?.role;
    const content = sanitizeText(item?.content);
    if ((role !== 'user' && role !== 'assistant') || !content) continue;

    const trimmedContent = content.slice(0, MAX_MESSAGE_CHARS);
    totalChars += trimmedContent.length;
    if (totalChars > MAX_TOTAL_CHARS) break;

    normalized.push({ role, content: trimmedContent });
  }

  if (normalized.length === 0) {
    throw new Error('No valid messages found');
  }

  return { messages: normalized, totalChars };
}

function getIntentAction(message: string): ActionPayload | undefined {
  const msg = message.toLowerCase();

  if (/balance|wallet|how much/i.test(msg)) {
    return { type: 'check_balance', label: 'Show My Balance' };
  }

  if (/transaction|history|statement/i.test(msg)) {
    return { type: 'navigate', route: '(tabs)/transactions', label: 'View Transactions →' };
  }

  if (/bill|pay bills?/i.test(msg)) {
    return { type: 'navigate', route: '(tabs)/pay-bills', label: 'Pay Bills →' };
  }

  if (/airtime|recharge|top.?up|credit/i.test(msg)) {
    return { type: 'navigate', route: 'airtime-purchase', label: 'Buy Airtime →' };
  }
  if (/data|bundle|gb|mb/i.test(msg)) {
    return { type: 'navigate', route: 'data-purchase', label: 'Buy Data →' };
  }
  if (/transfer|send money|send.*to/i.test(msg)) {
    return { type: 'navigate', route: 'transfer', label: 'Transfer Money →' };
  }
  if (/add money|fund|deposit|top up wallet/i.test(msg)) {
    return { type: 'navigate', route: 'add-money', label: 'Add Money →' };
  }
  if (/electricity|nepa|phcn|disco|power/i.test(msg)) {
    return { type: 'navigate', route: 'electricity', label: 'Pay Electricity →' };
  }
  if (/cable|dstv|gotv|startimes|tv/i.test(msg)) {
    return { type: 'navigate', route: 'cable-tv', label: 'Pay Cable TV →' };
  }
  if (/bet|sporty|betking|1xbet|betting/i.test(msg)) {
    return { type: 'navigate', route: 'betting', label: 'Fund Betting →' };
  }
  if (/jamb|waec|neco|education|school/i.test(msg)) {
    return { type: 'navigate', route: 'education', label: 'Education Payments →' };
  }

  return undefined;
}

function normalizeAction(rawAction: unknown): ActionPayload | undefined {
  if (!rawAction || typeof rawAction !== 'object') return undefined;
  const type = sanitizeText((rawAction as Record<string, unknown>).type);
  const label = sanitizeText((rawAction as Record<string, unknown>).label);
  const route = sanitizeText((rawAction as Record<string, unknown>).route);

  if (!ALLOWED_ACTION_TYPES.has(type)) return undefined;

  if (type === 'check_balance') {
    return { type: 'check_balance', label: label || 'Show My Balance' };
  }

  if (!ALLOWED_ROUTES.has(route)) return undefined;
  return { type: 'navigate', route, label: label || 'Continue →' };
}

function normalizeSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return ['Buy Airtime', 'Buy Data', 'Pay Bills'];
  }

  const unique = [...new Set(
    raw
      .map((s) => sanitizeText(s))
      .filter((s) => s.length > 0)
      .slice(0, 4)
  )];

  if (unique.length >= 2) return unique;
  return ['Buy Airtime', 'Buy Data', 'Pay Bills'];
}

function buildSafeResponse(parsed: Record<string, unknown>, lastUserMessage: string): SafeResponse {
  const reply = sanitizeText(parsed.reply, "I'm sorry, I couldn't process that. Please try again.");
  const suggestions = normalizeSuggestions(parsed.suggestions);
  const modelAction = normalizeAction(parsed.action);
  const intentAction = getIntentAction(lastUserMessage);

  // Enforce deterministic function order by giving intent-derived action precedence.
  const action = intentAction ?? modelAction;

  return {
    response: {
      success: true,
      reply,
      suggestions,
      ...(action ? { action } : {}),
    },
    meta: {
      intentAction,
      modelAction,
    },
  };
}

async function writeAuditLog(
  supabase: ReturnType<typeof createClient>,
  payload: {
    userId: string;
    requestMessageCount: number;
    requestTotalChars: number;
    intentAction?: ActionPayload;
    selectedAction?: ActionPayload;
    modelAction?: ActionPayload;
    blockedReason?: string;
  }
) {
  const { error } = await supabase.from('ai_chat_audit_logs').insert({
    user_id: payload.userId,
    request_message_count: payload.requestMessageCount,
    request_total_chars: payload.requestTotalChars,
    detected_intent:
      payload.intentAction?.type === 'check_balance'
        ? 'check_balance'
        : payload.intentAction?.route ?? null,
    selected_action_type: payload.selectedAction?.type ?? null,
    selected_action_route: payload.selectedAction?.route ?? null,
    model_action_type: payload.modelAction?.type ?? null,
    model_action_route: payload.modelAction?.route ?? null,
    blocked_reason: payload.blockedReason ?? null,
  });

  if (error) {
    console.error('Failed to write ai chat audit log:', error);
  }
}

// Extract JSON from GPT response even if wrapped in markdown
function extractJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()); } catch { /* continue */ } }
  const jsonObj = text.match(/\{[\s\S]*\}/);
  if (jsonObj) { try { return JSON.parse(jsonObj[0]); } catch { /* continue */ } }
  return null;
}

// Keyword-based fallback when OpenAI is unavailable
function getFallbackResponse(msg: string): { reply: string; suggestions: string[]; action?: Record<string, string> } {
  if (/airtime|recharge|top.?up|credit/i.test(msg)) return {
    reply: "I'll take you to the **Airtime Purchase** page where you can recharge MTN, Airtel, Glo, or 9Mobile instantly.",
    suggestions: ['Buy Data Instead', 'Pay Bills', 'Check Balance', 'Transfer Money'],
    action: { type: 'navigate', route: 'airtime-purchase', label: 'Buy Airtime →' },
  };
  if (/data|bundle|gb|mb/i.test(msg)) return {
    reply: "Let me take you to **Data Purchase** to buy data bundles for any network.",
    suggestions: ['Buy Airtime Instead', 'Pay Bills', 'Check Balance'],
    action: { type: 'navigate', route: 'data-purchase', label: 'Buy Data →' },
  };
  if (/transfer|send money|send.*to/i.test(msg)) return {
    reply: "You can **transfer money** to any Netpay user instantly with zero fees.",
    suggestions: ['Check Balance', 'Add Money', 'Transaction History'],
    action: { type: 'navigate', route: 'transfer', label: 'Transfer Money →' },
  };
  if (/balance|wallet|how much/i.test(msg)) return {
    reply: "Tap below to view your current **wallet balance**.",
    suggestions: ['Add Money', 'Transfer Money', 'Buy Airtime'],
    action: { type: 'check_balance', label: 'Show My Balance' },
  };
  if (/electricity|nepa|phcn|disco|power/i.test(msg)) return {
    reply: "Pay your **electricity bill** quickly for any DISCO (EKEDC, IKEDC, AEDC, etc.).",
    suggestions: ['Cable TV', 'Pay Bills', 'Buy Airtime'],
    action: { type: 'navigate', route: 'electricity', label: 'Pay Electricity →' },
  };
  if (/cable|dstv|gotv|startimes|tv/i.test(msg)) return {
    reply: "Subscribe to **DSTV, GOtv, or Startimes** directly from the app.",
    suggestions: ['Pay Electricity', 'Pay Bills', 'Buy Airtime'],
    action: { type: 'navigate', route: 'cable-tv', label: 'Pay Cable TV →' },
  };
  if (/bet|sporty|betking|1xbet|betting/i.test(msg)) return {
    reply: "Fund your **betting wallet** instantly on all major platforms.",
    suggestions: ['Buy Airtime', 'Pay Bills', 'Check Balance'],
    action: { type: 'navigate', route: 'betting', label: 'Fund Betting →' },
  };
  if (/jamb|waec|neco|education|school/i.test(msg)) return {
    reply: "Make **education payments** for JAMB, WAEC, NECO and more.",
    suggestions: ['Pay Bills', 'Buy Airtime', 'Check Balance'],
    action: { type: 'navigate', route: 'education', label: 'Education Payments →' },
  };
  if (/add money|fund|deposit|top up wallet/i.test(msg)) return {
    reply: "**Add money** to your Netpay wallet via bank transfer or card.",
    suggestions: ['Check Balance', 'Transfer Money', 'Pay Bills'],
    action: { type: 'navigate', route: 'add-money', label: 'Add Money →' },
  };
  if (/transaction|history|statement/i.test(msg)) return {
    reply: "View your full **transaction history** including airtime, bills, and transfers.",
    suggestions: ['Check Balance', 'Buy Airtime', 'Pay Bills'],
    action: { type: 'navigate', route: '(tabs)/transactions', label: 'View Transactions →' },
  };
  if (/bill|pay/i.test(msg)) return {
    reply: "Pay all your **bills** in one place — electricity, cable TV, water, and more.",
    suggestions: ['Electricity', 'Cable TV', 'Education', 'Betting'],
    action: { type: 'navigate', route: '(tabs)/pay-bills', label: 'Pay Bills →' },
  };
  // Default
  return {
    reply: "Hi! I'm **Netpay AI**. I can help you buy airtime, buy data, pay bills, transfer money, and check your balance. What would you like to do?",
    suggestions: ['Buy Airtime', 'Buy Data', 'Pay Bills', 'Check Balance'],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  return new Response(
    JSON.stringify({
      success: false,
      reply: 'Netpay AI is temporarily unavailable.',
      suggestions: ['Pay Bills', 'Buy Airtime', 'Check Balance'],
    }),
    { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ success: false, reply: 'AI service not configured. Please contact support.', suggestions: ['Contact Support', 'Pay Bills', 'Buy Airtime'] }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const { data: rateLimit, error: rateLimitError } = await supabase
      .rpc('enforce_ai_chat_rate_limit', {
        p_user_id: user.id,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
        p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      })
      .single();

    if (rateLimitError) {
      console.error('Failed to enforce ai chat rate limit:', rateLimitError);
      return new Response(
        JSON.stringify({ success: false, reply: 'Service temporarily unavailable. Please try again shortly.', suggestions: ['Try Again', 'Pay Bills', 'Buy Airtime'] }),
        { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (rateLimit?.allowed === false) {
      const retryAfterSeconds = Math.max(1, Number(rateLimit.retry_after_seconds ?? 1));
      return new Response(
        JSON.stringify({
          success: false,
          reply: 'You are sending messages too quickly. Please wait a moment and try again.',
          suggestions: ['Try Again', 'Buy Airtime', 'Pay Bills'],
        }),
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }

    const reqBody = await req.json();
    let messages: ChatMessage[];
    let requestTotalChars = 0;
    try {
      const validated = validateAndNormalizeMessages(reqBody?.messages);
      messages = validated.messages;
      requestTotalChars = validated.totalChars;
    } catch (validationError) {
      return new Response(
        JSON.stringify({ success: false, error: validationError instanceof Error ? validationError.message : 'Invalid request body' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!openaiResp.ok) {
      const errBody = await openaiResp.text();
      console.error('OpenAI error:', openaiResp.status, errBody);
      // Use fallback for rate limit / quota issues
      const lastUserMsg = lastUserMessage.toLowerCase();
      const fallback = getFallbackResponse(lastUserMsg);
      await writeAuditLog(supabase, {
        userId: user.id,
        requestMessageCount: messages.length,
        requestTotalChars,
        intentAction: getIntentAction(lastUserMsg),
        selectedAction: normalizeAction(fallback.action),
        modelAction: undefined,
        blockedReason: `openai_error_${openaiResp.status}`,
      });
      return new Response(
        JSON.stringify({ success: true, ...fallback }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const openaiData = await openaiResp.json();
    const rawContent = openaiData?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(rawContent);

    if (parsed?.reply) {
      const safe = buildSafeResponse(parsed, lastUserMessage);
      await writeAuditLog(supabase, {
        userId: user.id,
        requestMessageCount: messages.length,
        requestTotalChars,
        intentAction: safe.meta.intentAction,
        selectedAction: safe.response.action,
        modelAction: safe.meta.modelAction,
      });
      return new Response(
        JSON.stringify(safe.response),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback: return raw text as reply
    await writeAuditLog(supabase, {
      userId: user.id,
      requestMessageCount: messages.length,
      requestTotalChars,
      intentAction: getIntentAction(lastUserMessage),
      selectedAction: undefined,
      modelAction: undefined,
      blockedReason: 'invalid_model_json',
    });

    return new Response(
      JSON.stringify({ success: true, reply: rawContent || "I'm sorry, I couldn't generate a response. Please try again.", suggestions: ['Try Again', 'Buy Airtime', 'Pay Bills'] }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-chat function:', error);
    return new Response(
      JSON.stringify({ success: false, reply: 'An unexpected error occurred. Please try again.', suggestions: ['Try Again', 'Contact Support'] }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

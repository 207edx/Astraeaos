// =============================================================
// POST /api/ai/chat
//
// AstraeaOS AI assistant. Runs on Vercel's Edge runtime so the reply
// can be streamed to the browser token-by-token.
//
// Flow:
//   1. Verify the caller's Firebase ID token (no anonymous access).
//   2. Rate-limit and validate the request shape.
//   3. Ask Groq whether it needs live web data to answer (tool-call
//      planning pass, non-streamed, cheap).
//   4. If it does: run the search server-side (lib/webSearch.js),
//      hand the retrieved sources back to Groq as a tool result, then
//      stream the final answer. Sources are returned to the browser
//      in an X-Astra-Sources response header (base64 JSON) so the UI
//      can render "From the web" citations distinct from the prose.
//   5. If not: stream (or, for the rare non-tool immediate answer,
//      emit-once) the direct answer.
//
// GROQ_API_KEY and TAVILY_API_KEY never leave this function.
// =============================================================

import { requireUser } from '../../lib/verifyFirebaseToken.js';
import { checkRateLimit, rateLimitResponse } from '../../lib/rateLimit.js';
import { groqChat, groqChatStream, textDeltaStream, DEFAULT_MODEL } from '../../lib/groqClient.js';
import { webSearch, formatSearchContext } from '../../lib/webSearch.js';

export const config = { runtime: 'edge' };

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const MAX_APP_CONTEXT_CHARS = 2000;

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the live web for current, recent, or time-specific information that is outside your own knowledge — news, current events, prices, releases, "latest" anything, or anything the user gives a specific date/date-range for. Do not use this for general concepts, definitions, math, or JEE syllabus content you already know well.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A focused, specific search query.' },
        start_date: { type: 'string', description: 'Optional. Restrict results to on/after this date, format YYYY-MM-DD. Only set this if the user gave a date range.' },
        end_date: { type: 'string', description: 'Optional. Restrict results to on/before this date, format YYYY-MM-DD.' },
      },
      required: ['query'],
    },
  },
};

function buildSystemPrompt(appContext) {
  return [
    'You are the AI assistant built into AstraeaOS, a personal JEE (Joint Entrance Examination, India) preparation and productivity system used by one student.',
    'Be direct, concise, and encouraging without empty flattery. Use Markdown: headings sparingly, tables for comparisons/data, and fenced code blocks for anything code or formula-like.',
    'You may be given a short "AstraeaOS context" block below describing what the student is currently working on inside the app (their own data, shared to you by the app, not fetched by you). Use it only when it is actually relevant to their question — do not force it in.',
    'When you use the web_search tool, base your answer on the retrieved sources and make clear that information is from the web (not your own training) — you do not need to add manual citation markers yourself, the app displays the sources separately. Do not present retrieved web information as something you already knew. Do not present your own reasoning/analysis as if it were a retrieved fact.',
    'If asked for something dangerous, or for personal data about someone else, decline briefly and say why.',
    appContext ? `\n--- AstraeaOS context (from the student's own app data) ---\n${appContext}\n--- end context ---` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return 'messages must be a non-empty array';
  if (messages.length > MAX_MESSAGES) return `Too many messages in one request (max ${MAX_MESSAGES}). Start a new conversation.`;
  let total = 0;
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return 'Each message needs role "user" or "assistant"';
    if (typeof m.content !== 'string' || !m.content.trim()) return 'Each message needs non-empty text content';
    if (m.content.length > MAX_MESSAGE_CHARS) return `A message is too long (max ${MAX_MESSAGE_CHARS} characters)`;
    total += m.content.length;
  }
  if (total > MAX_TOTAL_CHARS) return 'This conversation has gotten too long for one request — please start a new chat.';
  return null;
}

function sourcesHeader(results) {
  const compact = results.slice(0, 5).map((r) => ({ title: r.title, url: r.url }));
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
  } catch {
    return '';
  }
}

function singleChunkStream(text) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }

  const env = process.env;
  if (!env.GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI is not configured on the server yet.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  const { user, error } = await requireUser(request, env);
  if (error) return error;

  const rl = checkRateLimit(`${user.uid}:chat`, 20, 5 * 60 * 1000);
  if (!rl.allowed) return rateLimitResponse(rl.resetMs);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed request body' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const validationError = validateMessages(body.messages);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const allowWebSearch = body.allowWebSearch !== false && !!env.TAVILY_API_KEY;
  const appContext = typeof body.appContext === 'string' ? body.appContext.slice(0, MAX_APP_CONTEXT_CHARS) : '';
  const model = env.GROQ_MODEL || DEFAULT_MODEL;

  const conversation = [{ role: 'system', content: buildSystemPrompt(appContext) }, ...body.messages];

  try {
    let sources = [];

    if (allowWebSearch) {
      // Cheap planning pass: let the model decide, in one shot, whether
      // it needs to search. Small max_tokens keeps this fast and cheap
      // even though it's non-streamed.
      const planned = await groqChat({
        apiKey: env.GROQ_API_KEY,
        model,
        messages: conversation,
        tools: [WEB_SEARCH_TOOL],
        tool_choice: 'auto',
        max_tokens: 1024,
      });

      const choice = planned.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;

      if (toolCalls && toolCalls.length) {
        const call = toolCalls[0];
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }

        const { results } = await webSearch(
          args.query || body.messages[body.messages.length - 1].content,
          { startDate: args.start_date, endDate: args.end_date, maxResults: 5 },
          env.TAVILY_API_KEY
        );
        sources = results;

        const followUp = [
          ...conversation,
          choice.message,
          {
            role: 'tool',
            tool_call_id: call.id,
            content: formatSearchContext(results),
          },
        ];

        const streamRes = await groqChatStream({ apiKey: env.GROQ_API_KEY, model, messages: followUp, max_tokens: 2048 });
        return new Response(textDeltaStream(streamRes), {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'x-astra-sources': sourcesHeader(sources),
            'cache-control': 'no-store',
          },
        });
      }

      // Model answered directly in the planning pass — no search needed.
      const directText = choice?.message?.content || "I wasn't able to generate a response. Please try again.";
      return new Response(singleChunkStream(directText), {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    // Web search disabled/unavailable — stream directly, no tool step.
    const streamRes = await groqChatStream({ apiKey: env.GROQ_API_KEY, model, messages: conversation, max_tokens: 2048 });
    return new Response(textDeltaStream(streamRes), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (e) {
    // Never leak provider error bodies (may contain account/billing details) to the browser.
    console.error('AI chat error:', e);
    return new Response(JSON.stringify({ error: "The AI assistant hit an error. Please try again in a moment." }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}

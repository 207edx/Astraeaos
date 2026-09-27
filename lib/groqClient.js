// =============================================================
// groqClient.js
//
// Thin wrapper around Groq's OpenAI-compatible Chat Completions API.
// No SDK dependency — it's one REST endpoint and the OpenAI wire
// format, so a fetch wrapper is fewer moving parts and works
// identically on Node and Edge runtimes.
//
// GROQ_API_KEY is read from process.env at call time and NEVER sent
// to, or accepted from, the browser.
// =============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Production, tool-use-capable Groq models as of this writing.
// Override with GROQ_MODEL if Groq's lineup has moved on by the time
// you deploy this — check https://console.groq.com/docs/models.
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

/**
 * Non-streaming chat completion. Used for the tool-planning step and
 * for /api/ai/report (we want the whole structured document before
 * we show it, not a half-built table).
 */
export async function groqChat({ apiKey, model, messages, tools, tool_choice, max_tokens = 1024, temperature = 0.4 }) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      tools,
      tool_choice,
      max_tokens,
      temperature,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq API error (${res.status}): ${text.slice(0, 500)}`);
  }
  return res.json();
}

/**
 * Streaming chat completion. Returns the raw fetch Response so the
 * caller can pipe its SSE body straight through to the browser
 * (see api/ai/chat.js) — we re-parse each `data: {...}` line only far
 * enough to pull out the text delta, then forward plain text chunks,
 * so the browser doesn't need any SSE-parsing logic of its own.
 */
export async function groqChatStream({ apiKey, model, messages, max_tokens = 1024, temperature = 0.4 }) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      max_tokens,
      temperature,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq API error (${res.status}): ${text.slice(0, 500)}`);
  }
  return res;
}

/**
 * Transforms a Groq/OpenAI-format SSE stream into a plain text stream
 * of just the assistant's content deltas. Runs entirely on the Edge
 * runtime's native ReadableStream/TransformStream.
 */
export function textDeltaStream(groqResponse) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return groqResponse.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          } catch {
            // Ignore malformed/partial SSE lines; next chunk usually completes them.
          }
        }
      },
    })
  );
}

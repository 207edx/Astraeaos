// =============================================================
// POST /api/ai/report
//
// Generates a structured, source-backed report: Summary, Timeline,
// Key Findings, Statistics (when applicable), Sources, Limitations,
// Conclusion — as Markdown. Always search-backed (a "report" with no
// real sources is just a guess dressed up), and honors an explicit
// date range when the caller gives one.
//
// Returned as a single JSON object (not streamed) — a structured
// report is meant to be read as a whole, not watched typing itself
// out, and this lets us validate we actually got a well-formed
// document back from the model before showing it.
// =============================================================

import { requireUser } from '../../lib/verifyFirebaseToken.js';
import { checkRateLimit, rateLimitResponse } from '../../lib/rateLimit.js';
import { groqChat, DEFAULT_MODEL } from '../../lib/groqClient.js';
import { webSearch, formatSearchContext } from '../../lib/webSearch.js';

export const config = { runtime: 'edge' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function buildReportPrompt({ topic, startDate, endDate, sourceContext }) {
  const rangeLine = startDate || endDate
    ? `The requested date range is ${startDate || 'the earliest available'} to ${endDate || 'now'}. Only use sources and information relevant to that window; say explicitly if good sources for part of the range weren't available.`
    : 'No specific date range was requested — favor the most current information available.';

  return [
    `Write a structured report on: "${topic}"`,
    rangeLine,
    '',
    'Use exactly this Markdown structure with these headings, in this order:',
    '## Summary',
    '## Timeline',
    '(chronological list of the important dated events/developments; omit this section if the topic has no meaningful timeline)',
    '## Key Findings',
    '## Statistics',
    '(a Markdown table if the sources give you real numbers; omit this section entirely if they do not — never invent figures)',
    '## Limitations & Uncertainty',
    '(what these sources do not cover, conflicting information, how current this really is)',
    '## Conclusion',
    '## Sources',
    '(numbered list matching the [n] citation markers you used in the text above, as "[n] Title — URL")',
    '',
    'Cite sources inline as [1], [2] etc. matching the numbered list below. Do not fabricate a source, a statistic, or a quote that is not in the material given to you. If the material is thin, say so plainly in Limitations rather than padding the report.',
    '',
    '--- RETRIEVED SOURCES ---',
    sourceContext,
    '--- END SOURCES ---',
  ].join('\n');
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }

  const env = process.env;
  if (!env.GROQ_API_KEY || !env.TAVILY_API_KEY) {
    return new Response(JSON.stringify({ error: 'Report generation is not fully configured on the server yet (needs GROQ_API_KEY and TAVILY_API_KEY).' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { user, error } = await requireUser(request, env);
  if (error) return error;

  const rl = checkRateLimit(`${user.uid}:report`, 5, 15 * 60 * 1000);
  if (!rl.allowed) return rateLimitResponse(rl.resetMs);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed request body' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 300) : '';
  if (!topic) return new Response(JSON.stringify({ error: 'A report topic is required.' }), { status: 400, headers: { 'content-type': 'application/json' } });

  const startDate = typeof body.startDate === 'string' && DATE_RE.test(body.startDate) ? body.startDate : undefined;
  const endDate = typeof body.endDate === 'string' && DATE_RE.test(body.endDate) ? body.endDate : undefined;
  if (startDate && endDate && startDate > endDate) {
    return new Response(JSON.stringify({ error: 'Start date must be before end date.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const model = env.GROQ_MODEL || DEFAULT_MODEL;

  try {
    const { results } = await webSearch(topic, { startDate, endDate, maxResults: 8 }, env.TAVILY_API_KEY);

    if (!results.length) {
      return new Response(
        JSON.stringify({ error: 'No web sources were found for this topic and date range. Try broadening the range or rephrasing the topic.' }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    const sourceContext = formatSearchContext(results);
    const prompt = buildReportPrompt({ topic, startDate, endDate, sourceContext });

    const completion = await groqChat({
      apiKey: env.GROQ_API_KEY,
      model,
      messages: [
        { role: 'system', content: 'You are a careful research analyst. You only state what the given sources support. You clearly separate retrieved facts from your own analysis, and you say so explicitly whenever you are drawing an inference rather than reporting a source directly.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3000,
      temperature: 0.3,
    });

    const reportMarkdown = completion.choices?.[0]?.message?.content || '';
    if (!reportMarkdown.trim()) {
      return new Response(JSON.stringify({ error: 'The AI did not return a report. Please try again.' }), { status: 502, headers: { 'content-type': 'application/json' } });
    }

    return new Response(
      JSON.stringify({
        reportMarkdown,
        sources: results.map((r) => ({ title: r.title, url: r.url, publishedDate: r.publishedDate })),
        topic,
        dateRange: { startDate: startDate || null, endDate: endDate || null },
        generatedAt: new Date().toISOString(),
      }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
    );
  } catch (e) {
    console.error('AI report error:', e);
    return new Response(JSON.stringify({ error: 'Report generation failed. Please try again in a moment.' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}

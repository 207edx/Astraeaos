// =============================================================
// webSearch.js
//
// Backend-only web search layer. Groq (or any LLM) has no live
// internet access on its own — this module is what actually goes out
// and retrieves current information, so the model is given real
// sources instead of being told to "search the internet" and left to
// guess.
//
// Provider: Tavily (https://tavily.com) — chosen because it's built
// specifically for feeding LLMs: it returns clean text snippets
// (not raw SERPs you'd have to scrape), supports a native date range
// (start_date/end_date) and a recency window (time_range), and has a
// free developer tier. TAVILY_API_KEY is required.
//
// Swapping providers later: everything outside this file only calls
// `webSearch(...)` and reads back `{title, url, snippet, publishedDate}`
// objects, so switching to Brave/Serper/Bing later means rewriting the
// body of this one function, not anything that calls it.
// =============================================================

const TAVILY_URL = 'https://api.tavily.com/search';

/**
 * @param {string} query
 * @param {object} opts
 * @param {string} [opts.startDate] - "YYYY-MM-DD", inclusive
 * @param {string} [opts.endDate] - "YYYY-MM-DD", inclusive
 * @param {number} [opts.maxResults]
 * @param {string} apiKey - TAVILY_API_KEY
 * @returns {Promise<{results: Array<{title:string,url:string,snippet:string,publishedDate:string|null}>, answer: string|null}>}
 */
export async function webSearch(query, opts = {}, apiKey) {
  if (!apiKey) throw new Error('Server misconfiguration: TAVILY_API_KEY is not set');
  if (!query || !query.trim()) throw new Error('Empty search query');

  const body = {
    query: query.trim().slice(0, 400),
    max_results: Math.min(Math.max(opts.maxResults || 5, 1), 10),
    search_depth: 'advanced',
    include_answer: false,
  };
  // Tavily's date filters: start_date/end_date bound results to a
  // published-date range when the caller (the AI, via tool-call args,
  // or a report request) specifies one.
  if (opts.startDate) body.start_date = opts.startDate;
  if (opts.endDate) body.end_date = opts.endDate;

  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Web search error (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const results = (data.results || []).map((r) => ({
    title: String(r.title || '').slice(0, 200),
    url: String(r.url || ''),
    snippet: String(r.content || '').slice(0, 800),
    publishedDate: r.published_date || null,
  }));
  return { results, answer: data.answer || null };
}

/**
 * Builds the plain-text context block handed to Groq after a search,
 * with a numbered source list the model is instructed to cite by
 * number — this is what lets the frontend show "from the web" vs
 * "AI analysis" as genuinely distinct, traceable pieces.
 */
export function formatSearchContext(results) {
  if (!results.length) return 'No web results were found for this query.';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}${r.publishedDate ? ` (published ${r.publishedDate})` : ''}\n${r.url}\n${r.snippet}`)
    .join('\n\n');
}

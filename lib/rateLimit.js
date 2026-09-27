// =============================================================
// rateLimit.js
//
// A per-user sliding-window rate limiter that lives in the memory of
// one warm Edge function isolate.
//
// HONEST LIMITATION (read this before trusting it for anything
// costly): Vercel can and will spin up multiple isolates for the same
// function under concurrent load, and any isolate can be recycled at
// any time, so this limiter's counters are NOT shared across
// instances and NOT durable. For a single-user / small-class personal
// app it is a reasonable, zero-dependency first line of defense
// against a runaway loop or a leaked tab hammering the endpoint. It
// is NOT sufficient defense against a determined abuser with many
// concurrent connections.
//
// If this app is ever exposed to a wider audience, replace the Map
// below with a durable store — Upstash Redis has a first-class
// "ratelimit" package that works natively on the Edge runtime and is
// a drop-in for the check() call below. Until then, the hard caps in
// api/ai/*.js (message length, history length, max_tokens) matter
// more than this file for controlling actual Groq/search API spend.
// =============================================================

const buckets = new Map(); // key -> number[] (timestamps, ms)

/**
 * @param {string} key - usually `${uid}:${routeName}`
 * @param {number} limit - max requests allowed in the window
 * @param {number} windowMs - window size in ms
 * @returns {{allowed: boolean, remaining: number, resetMs: number}}
 */
export function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  const allowed = arr.length < limit;
  if (allowed) arr.push(now);
  buckets.set(key, arr);

  // Opportunistic cleanup so the Map doesn't grow unbounded across a
  // long-lived warm isolate.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
    }
  }

  const resetMs = arr.length ? windowMs - (now - arr[0]) : 0;
  return { allowed, remaining: Math.max(0, limit - arr.length), resetMs };
}

export function rateLimitResponse(resetMs) {
  return new Response(
    JSON.stringify({ error: `You're sending requests too quickly. Try again in ${Math.ceil(resetMs / 1000)}s.` }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.ceil(resetMs / 1000)) } }
  );
}

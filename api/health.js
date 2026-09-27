// =============================================================
// GET /api/health
//
// Deployment sanity check. Reports which required secrets are
// present WITHOUT ever revealing their values — useful right after a
// Vercel deploy to confirm env vars actually saved, before you start
// debugging the AI feature itself.
// =============================================================

export const config = { runtime: 'edge' };

export default async function handler() {
  const env = process.env;
  return new Response(
    JSON.stringify({
      ok: true,
      configured: {
        groq: !!env.GROQ_API_KEY,
        webSearch: !!env.TAVILY_API_KEY,
        firebaseProjectId: !!env.FIREBASE_PROJECT_ID,
      },
      time: new Date().toISOString(),
    }),
    { headers: { 'content-type': 'application/json' } }
  );
}

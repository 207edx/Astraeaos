// =============================================================
// verifyFirebaseToken.js
//
// Verifies a Firebase Authentication ID token WITHOUT the Firebase
// Admin SDK. The Admin SDK needs Node.js-specific APIs and a full
// service-account key (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY),
// which is an extra long-lived secret with broad privileges sitting
// in your environment variables. Firebase ID tokens are standard
// signed JWTs, so we can verify them the same way any relying party
// verifies a Google-issued JWT: fetch Google's published public keys
// (JWKS) and check the signature + standard claims. This runs on the
// Vercel Edge runtime (Web Crypto only, no Node built-ins), which is
// also what lets /api/ai/chat stream tokens to the browser natively.
//
// Trade-off, stated plainly: this proves WHO is calling (a real,
// current Firebase user of this exact project) but does not grant a
// backend service-account identity for calling Firestore/Auth admin
// APIs. This app doesn't need that — the AI endpoints don't touch
// Firestore, and admin moderation is enforced by Firestore Rules
// (see /firestore.rules) using request.auth.token.email, which is a
// claim Firebase already puts on the ID token. If you later add a
// feature that genuinely needs server-side Firestore writes with
// elevated privilege, that's the moment to add firebase-admin and
// the three FIREBASE_* secrets — not before.
// =============================================================

import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// createRemoteJWKSet caches keys internally (in-memory, per warm Edge
// isolate) and refetches on kid-miss, so this is cheap on warm invocations.
let jwks;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URL));
  return jwks;
}

/**
 * Verify a Firebase Authentication ID token.
 * @param {string} idToken - the raw JWT (no "Bearer " prefix)
 * @param {string} projectId - your Firebase project ID (aud/iss check)
 * @returns {Promise<{uid: string, email: string|null, emailVerified: boolean, claims: object}>}
 * @throws on any verification failure (expired, wrong project, bad signature, etc.)
 */
export async function verifyFirebaseToken(idToken, projectId) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing token');
  }
  if (!projectId) {
    throw new Error('Server misconfiguration: FIREBASE_PROJECT_ID is not set');
  }

  const { payload } = await jwtVerify(idToken, getJwks(), {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  // Belt-and-suspenders on top of jose's own exp/nbf checks:
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token has no subject');
  }
  // auth_time should be in the past, not absurdly far in the future
  // (clock-skew tolerance of 5 minutes).
  if (typeof payload.auth_time === 'number' && payload.auth_time > Date.now() / 1000 + 300) {
    throw new Error('Token auth_time is in the future');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: !!payload.email_verified,
    claims: payload,
  };
}

/**
 * Pull the bearer token out of a standard Authorization header.
 */
export function extractBearerToken(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Convenience wrapper for API routes: verifies the request's bearer
 * token and returns the user, or returns a ready-to-send 401 Response.
 */
export async function requireUser(request, env) {
  const token = extractBearerToken(request);
  if (!token) {
    return { error: new Response(JSON.stringify({ error: 'Not authenticated. Sign in and try again.' }), { status: 401, headers: { 'content-type': 'application/json' } }) };
  }
  try {
    const user = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
    return { user };
  } catch (e) {
    return { error: new Response(JSON.stringify({ error: 'Your session has expired. Please sign in again.' }), { status: 401, headers: { 'content-type': 'application/json' } }) };
  }
}

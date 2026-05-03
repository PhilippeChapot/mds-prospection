/**
 * Cookie session HMAC pour le flow etape 2.
 *
 * Apres verification du DOI, on pose un cookie httpOnly contenant
 * `${signupId}.${expiresAtMs}.${hmac}` ou hmac = HMAC-SHA256(signupId|expiresAtMs, DOI_JWT_SECRET).
 *
 * Pourquoi pas un JWT comme le DOI :
 *   - on a juste besoin d'un identifier signe + expiration. Pas de claims complexes.
 *   - format compact, parseable sans dependance.
 *   - meme secret que DOI (cohesion projet, pas de nouvelle env var).
 *
 * Pourquoi un cookie plutot que le token URL :
 *   - le user clique le DOI depuis sa boite mail (potentiellement autre device).
 *   - une fois sur la page verify, on pose le cookie sur le device courant.
 *   - les requetes step2/save et step2/submit lisent le cookie -> pas
 *     besoin de balader signupId dans l'URL ou les bodies.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const STEP2_SESSION_COOKIE = 'mds_step2_session';
export const STEP2_SESSION_TTL_SECONDS = 60 * 60 * 2; // 2h pour completer l'etape 2

function getSecret(): string {
  const secret = process.env.DOI_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('DOI_JWT_SECRET must be set to a 32+ char random string.');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export interface Step2SessionValue {
  signupId: string;
  expiresAt: Date;
}

export function createStep2SessionValue(
  signupId: string,
  ttlSeconds: number = STEP2_SESSION_TTL_SECONDS,
): string {
  const expiresAtMs = Date.now() + ttlSeconds * 1000;
  const payload = `${signupId}.${expiresAtMs}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyStep2SessionValue(
  value: string | null | undefined,
): Step2SessionValue | null {
  if (!value) return null;

  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [signupId, expiresAtStr, sig] = parts;
  if (!signupId || !expiresAtStr || !sig) return null;

  const expiresAtMs = Number.parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAtMs)) return null;
  if (expiresAtMs < Date.now()) return null;

  const expectedSig = sign(`${signupId}.${expiresAtMs}`);
  // timingSafeEqual exige des buffers de meme taille.
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  return { signupId, expiresAt: new Date(expiresAtMs) };
}

/**
 * Helper symetrique pour signer un parametre court dans une URL publique
 * (ex: /merci?s=<signed-signupId>). Format `${signupId}.${sig}`.
 */
export function signPublicSignupRef(signupId: string): string {
  return `${signupId}.${sign(signupId)}`;
}

export function verifyPublicSignupRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf('.');
  if (idx < 0) return null;
  const signupId = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  if (!signupId || !sig) return null;
  const expected = sign(signupId);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  return signupId;
}

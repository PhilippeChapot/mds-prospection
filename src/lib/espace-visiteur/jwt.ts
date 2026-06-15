/**
 * JWT helpers Espace Visiteur — P15.3.VisitorPublicSpace.
 *
 * Duplique le pattern P11.x (espace-partenaire/jwt.ts) pour l'audience
 * visiteur. Deux types de tokens :
 *   - magic   : URL email "lien d'accès", TTL 15 min, type='magic'.
 *   - session : cookie HttpOnly après consommation. 8h (magic) ou 30j
 *               (login password).
 *
 * Le claim `sub` porte toujours le `visitor_id`.
 *
 * Secret : VISITOR_JWT_SECRET (32+ chars, posé en env Vercel par Phil).
 * Lib : `jose` (edge-compatible).
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

const ALG = 'HS256';
const MAGIC_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_LONG_TTL_SECONDS = 30 * 24 * 60 * 60;

export type EspaceVisiteurTokenType = 'magic' | 'session';

export interface VerifiedEspaceVisiteurClaims {
  /** visitor_id (sub). */
  visitorId: string;
  type: EspaceVisiteurTokenType;
  jti: string;
  expiresAt: Date;
}

export class EspaceVisiteurTokenError extends Error {
  code: 'expired' | 'invalid' | 'wrong-type' | 'no-secret';
  constructor(code: 'expired' | 'invalid' | 'wrong-type' | 'no-secret', message?: string) {
    super(message ?? code);
    this.name = 'EspaceVisiteurTokenError';
    this.code = code;
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.VISITOR_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new EspaceVisiteurTokenError(
      'no-secret',
      'VISITOR_JWT_SECRET must be set to a 32+ char random string.',
    );
  }
  return new TextEncoder().encode(secret);
}

async function signToken(
  visitorId: string,
  type: EspaceVisiteurTokenType,
  ttlSeconds: number,
): Promise<string> {
  const secret = getSecret();
  return await new SignJWT({ type })
    .setProtectedHeader({ alg: ALG })
    .setSubject(visitorId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function signVisitorMagicToken(visitorId: string): Promise<string> {
  return signToken(visitorId, 'magic', MAGIC_TTL_SECONDS);
}

export async function signVisitorSessionToken(visitorId: string): Promise<string> {
  return signToken(visitorId, 'session', SESSION_TTL_SECONDS);
}

/** Session longue durée (30 j) pour login par mot de passe. */
export async function signLongVisitorSessionToken(visitorId: string): Promise<string> {
  return signToken(visitorId, 'session', SESSION_LONG_TTL_SECONDS);
}

async function verifyToken(
  token: string,
  expectedType: EspaceVisiteurTokenType,
): Promise<VerifiedEspaceVisiteurClaims> {
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });

    if (!payload.sub || !payload.jti || typeof payload.exp !== 'number') {
      throw new EspaceVisiteurTokenError('invalid', 'Missing required claims');
    }
    if (payload.type !== expectedType) {
      throw new EspaceVisiteurTokenError('wrong-type');
    }

    return {
      visitorId: payload.sub,
      type: expectedType,
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch (err) {
    if (err instanceof EspaceVisiteurTokenError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new EspaceVisiteurTokenError('expired');
    }
    throw new EspaceVisiteurTokenError('invalid');
  }
}

export async function verifyVisitorMagicToken(
  token: string,
): Promise<VerifiedEspaceVisiteurClaims> {
  return verifyToken(token, 'magic');
}

export async function verifyVisitorSessionToken(
  token: string,
): Promise<VerifiedEspaceVisiteurClaims> {
  return verifyToken(token, 'session');
}

export const ESPACE_VISITEUR_SESSION_COOKIE = 'espace_visiteur_session';
export const ESPACE_VISITEUR_SESSION_MAX_AGE = SESSION_TTL_SECONDS;
export const ESPACE_VISITEUR_SESSION_LONG_MAX_AGE = SESSION_LONG_TTL_SECONDS;

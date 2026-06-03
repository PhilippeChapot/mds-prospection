/**
 * JWT helpers Espace Affilie — P7.x.1.A
 *
 * Mirror direct de `lib/espace-partenaire/jwt.ts` (P5.x.2) avec deux differences :
 *   - subject = affiliateId (au lieu de prospectId)
 *   - cookie  = `affilie_session`
 *
 * Deux types de tokens :
 *   - magic   : URL email "Recevez votre lien d'acces". TTL 15 min.
 *               Single-use cote front (consomme par /api/affilie/login).
 *   - session : pose en cookie HttpOnly Secure SameSite=Lax apres
 *               consommation du magic. TTL 8h. Refresh non implementé en
 *               foundation -- l'affilie redemande un magic-link.
 *
 * Le claim `type` distingue les deux : `verifyMagicToken` refuse un
 * token type='session' et inversement.
 *
 * Secret reuse : DOI_JWT_SECRET (32+ chars, deja en env Vercel Sensitive
 * depuis P3 M5). Memes contraintes que l'partenaire.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

const ALG = 'HS256';
const MAGIC_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type AffilieTokenType = 'magic' | 'session';

export interface AffilieTokenClaims {
  affiliateId: string;
  type: AffilieTokenType;
}

export interface VerifiedAffilieClaims extends AffilieTokenClaims {
  jti: string;
  expiresAt: Date;
}

export class AffilieTokenError extends Error {
  code: 'expired' | 'invalid' | 'wrong-type' | 'no-secret';
  constructor(code: 'expired' | 'invalid' | 'wrong-type' | 'no-secret', message?: string) {
    super(message ?? code);
    this.name = 'AffilieTokenError';
    this.code = code;
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.DOI_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new AffilieTokenError(
      'no-secret',
      'DOI_JWT_SECRET must be set to a 32+ char random string.',
    );
  }
  return new TextEncoder().encode(secret);
}

async function signToken(
  affiliateId: string,
  type: AffilieTokenType,
  ttlSeconds: number,
): Promise<string> {
  const secret = getSecret();
  return await new SignJWT({ type, scope: 'affilie' })
    .setProtectedHeader({ alg: ALG })
    .setSubject(affiliateId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function signAffilieMagicToken(affiliateId: string): Promise<string> {
  return signToken(affiliateId, 'magic', MAGIC_TTL_SECONDS);
}

export async function signAffilieSessionToken(affiliateId: string): Promise<string> {
  return signToken(affiliateId, 'session', SESSION_TTL_SECONDS);
}

async function verifyToken(
  token: string,
  expectedType: AffilieTokenType,
): Promise<VerifiedAffilieClaims> {
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (!payload.sub || !payload.jti || typeof payload.exp !== 'number') {
      throw new AffilieTokenError('invalid', 'Missing required claims');
    }
    if (payload.type !== expectedType) {
      throw new AffilieTokenError('wrong-type');
    }
    // Defense en profondeur : on verifie qu'on signe bien un token affilie
    // (scope claim) -- si DOI_JWT_SECRET fuite, un token partenaire ne peut
    // pas etre utilise comme session affilie.
    if (payload.scope !== 'affilie') {
      throw new AffilieTokenError('wrong-type', 'scope must be "affilie"');
    }
    return {
      affiliateId: payload.sub,
      type: expectedType,
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch (err) {
    if (err instanceof AffilieTokenError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new AffilieTokenError('expired');
    }
    throw new AffilieTokenError('invalid');
  }
}

export async function verifyAffilieMagicToken(token: string): Promise<VerifiedAffilieClaims> {
  return verifyToken(token, 'magic');
}

export async function verifyAffilieSessionToken(token: string): Promise<VerifiedAffilieClaims> {
  return verifyToken(token, 'session');
}

export const AFFILIE_SESSION_COOKIE = 'affilie_session';
export const AFFILIE_SESSION_MAX_AGE = SESSION_TTL_SECONDS;

/**
 * JWT signe (HS256) pour les liens de double opt-in.
 *
 * On encode : { sub: signupId, email, jti } + exp = now + 24h.
 * Token retransmis dans l'URL `/inscription-partenaire/<token>`.
 *
 * Lib choisie : `jose` (edge-compatible, ~30 KB, zero deps natives).
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

const ALG = 'HS256';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface DoiTokenClaims {
  signupId: string;
  email: string;
}

export interface SignDoiTokenInput extends DoiTokenClaims {
  ttlSeconds?: number;
  jti?: string;
}

export interface VerifiedDoiClaims extends DoiTokenClaims {
  jti: string;
  expiresAt: Date;
}

export class DoiTokenError extends Error {
  code: 'expired' | 'invalid' | 'no-secret';
  constructor(code: 'expired' | 'invalid' | 'no-secret', message?: string) {
    super(message ?? code);
    this.name = 'DoiTokenError';
    this.code = code;
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.DOI_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new DoiTokenError('no-secret', 'DOI_JWT_SECRET must be set to a 32+ char random string.');
  }
  return new TextEncoder().encode(secret);
}

export async function signDoiToken(input: SignDoiTokenInput): Promise<string> {
  const secret = getSecret();
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const jti = input.jti ?? crypto.randomUUID();

  return await new SignJWT({ email: input.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(input.signupId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret);
}

export async function verifyDoiToken(token: string): Promise<VerifiedDoiClaims> {
  const secret = getSecret();

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });

    if (!payload.sub || typeof payload.email !== 'string' || !payload.jti) {
      throw new DoiTokenError('invalid', 'Missing required claims');
    }
    if (typeof payload.exp !== 'number') {
      throw new DoiTokenError('invalid', 'Missing exp claim');
    }

    return {
      signupId: payload.sub,
      email: payload.email,
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch (err) {
    if (err instanceof DoiTokenError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new DoiTokenError('expired');
    }
    throw new DoiTokenError('invalid');
  }
}

/**
 * Calcule la date d'expiration absolue (utile pour stocker en DB
 * `doi_token_expires_at` sans avoir a decoder le JWT plus tard).
 */
export function computeDoiExpiresAt(ttlSeconds: number = DEFAULT_TTL_SECONDS): Date {
  return new Date(Date.now() + ttlSeconds * 1000);
}

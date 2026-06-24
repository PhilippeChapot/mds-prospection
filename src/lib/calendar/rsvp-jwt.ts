/**
 * P14.x.CalendarExternalInvites — JWT signé (HS256, jose) pour les liens RSVP
 * des invitations externes. Encode { eventId, email }. TTL long (l'événement
 * peut être loin). Secret : RSVP_JWT_SECRET.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

const ALG = 'HS256';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 120; // 120 jours

export interface RsvpTokenClaims {
  eventId: string;
  email: string;
}

export class RsvpTokenError extends Error {
  code: 'expired' | 'invalid' | 'no-secret';
  constructor(code: 'expired' | 'invalid' | 'no-secret', message?: string) {
    super(message ?? code);
    this.name = 'RsvpTokenError';
    this.code = code;
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.RSVP_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new RsvpTokenError('no-secret', 'RSVP_JWT_SECRET must be a 32+ char random string.');
  }
  return new TextEncoder().encode(secret);
}

export async function signRsvpToken(
  input: RsvpTokenClaims & { ttlSeconds?: number },
): Promise<string> {
  const secret = getSecret();
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  return await new SignJWT({ email: input.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(input.eventId)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret);
}

export async function verifyRsvpToken(token: string): Promise<RsvpTokenClaims> {
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (!payload.sub || typeof payload.email !== 'string') {
      throw new RsvpTokenError('invalid', 'Missing required claims');
    }
    return { eventId: payload.sub, email: payload.email };
  } catch (err) {
    if (err instanceof RsvpTokenError) throw err;
    if (err instanceof joseErrors.JWTExpired) throw new RsvpTokenError('expired');
    throw new RsvpTokenError('invalid');
  }
}

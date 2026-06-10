/**
 * JWT helpers Espace Partenaire — P5.x.2.
 *
 * Deux types de tokens :
 *   - magic   : utilise dans l'URL email "Recevez votre lien d'acces".
 *               TTL 15 minutes. Single-use cote front (consomme par
 *               /espace-partenaire/login pour set le cookie session).
 *   - session : pose en cookie HttpOnly Secure SameSite=Lax apres
 *               consommation du magic. TTL 8 heures. Refresh non
 *               implementé en MVP — au-dela, l'partenaire doit redemander
 *               un magic-link.
 *
 * Le claim `type` distingue les deux : verifyMagicToken refuse un token
 * type='session' et inversement, pour eviter qu'un attaquant qui
 * intercepte un magic-link puisse l'utiliser comme session 8h directe.
 *
 * Secret reuse : DOI_JWT_SECRET (32+ chars, deja en env Vercel Sensitive
 * depuis P3 M5). Si le secret manque ou est trop court, on throw
 * EspacePartenaireTokenError code='no-secret'.
 *
 * Lib : `jose` (edge-compatible, deja utilisee par lib/doi/jwt.ts).
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

const ALG = 'HS256';
const MAGIC_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
// P11.x — session longue durée pour login par mot de passe (30 jours).
const SESSION_LONG_TTL_SECONDS = 30 * 24 * 60 * 60;

export type EspacePartenaireTokenType = 'magic' | 'session';

/**
 * P8.2 : un token peut maintenant cibler soit un prospect (partenaire),
 * soit un contact tout court (contact simple, presse, etc.).
 *   - kind='prospect' (defaut/legacy) : sub = prospect_id.
 *   - kind='contact'  (P8.2)          : sub = contact_id.
 * Les tokens emis avant P8.2 n'ont PAS de claim 'kind' -> default
 * 'prospect' pour retro-compat (cf. verifyToken).
 */
export type EspacePartenaireSubjectKind = 'prospect' | 'contact';

export interface EspacePartenaireTokenClaims {
  /** prospect_id si kind='prospect', contact_id si kind='contact'. */
  prospectId: string;
  type: EspacePartenaireTokenType;
}

export interface VerifiedEspacePartenaireClaims extends EspacePartenaireTokenClaims {
  jti: string;
  expiresAt: Date;
  /** P8.2 : sub kind (default 'prospect' pour legacy tokens). */
  kind: EspacePartenaireSubjectKind;
}

export class EspacePartenaireTokenError extends Error {
  code: 'expired' | 'invalid' | 'wrong-type' | 'no-secret';
  constructor(code: 'expired' | 'invalid' | 'wrong-type' | 'no-secret', message?: string) {
    super(message ?? code);
    this.name = 'EspacePartenaireTokenError';
    this.code = code;
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.DOI_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new EspacePartenaireTokenError(
      'no-secret',
      'DOI_JWT_SECRET must be set to a 32+ char random string.',
    );
  }
  return new TextEncoder().encode(secret);
}

async function signToken(
  subjectId: string,
  type: EspacePartenaireTokenType,
  ttlSeconds: number,
  kind: EspacePartenaireSubjectKind = 'prospect',
): Promise<string> {
  const secret = getSecret();
  return await new SignJWT({ type, kind })
    .setProtectedHeader({ alg: ALG })
    .setSubject(subjectId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function signMagicToken(prospectId: string): Promise<string> {
  return signToken(prospectId, 'magic', MAGIC_TTL_SECONDS, 'prospect');
}

export async function signSessionToken(prospectId: string): Promise<string> {
  return signToken(prospectId, 'session', SESSION_TTL_SECONDS, 'prospect');
}

/** P8.2 — magic-link pour un contact (qu'il soit partenaire ou non). */
export async function signContactMagicToken(contactId: string): Promise<string> {
  return signToken(contactId, 'magic', MAGIC_TTL_SECONDS, 'contact');
}

/** P8.2 — session token pour un contact. */
export async function signContactSessionToken(contactId: string): Promise<string> {
  return signToken(contactId, 'session', SESSION_TTL_SECONDS, 'contact');
}

/** P11.x — session longue durée (30 j) pour login par mot de passe. */
export async function signLongContactSessionToken(contactId: string): Promise<string> {
  return signToken(contactId, 'session', SESSION_LONG_TTL_SECONDS, 'contact');
}

export const ESPACE_EXPOSANT_SESSION_LONG_MAX_AGE = SESSION_LONG_TTL_SECONDS;

async function verifyToken(
  token: string,
  expectedType: EspacePartenaireTokenType,
): Promise<VerifiedEspacePartenaireClaims> {
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });

    if (!payload.sub || !payload.jti || typeof payload.exp !== 'number') {
      throw new EspacePartenaireTokenError('invalid', 'Missing required claims');
    }
    if (payload.type !== expectedType) {
      // type swap protection : un magic ne peut pas servir de session
      // et inversement. Defense en profondeur si jamais l'API expose
      // les deux types par erreur.
      throw new EspacePartenaireTokenError('wrong-type');
    }

    // P8.2 : kind defaut 'prospect' pour les tokens legacy (sans claim).
    const kind: EspacePartenaireSubjectKind = payload.kind === 'contact' ? 'contact' : 'prospect';

    return {
      prospectId: payload.sub,
      type: expectedType,
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
      kind,
    };
  } catch (err) {
    if (err instanceof EspacePartenaireTokenError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new EspacePartenaireTokenError('expired');
    }
    throw new EspacePartenaireTokenError('invalid');
  }
}

export async function verifyMagicToken(token: string): Promise<VerifiedEspacePartenaireClaims> {
  return verifyToken(token, 'magic');
}

export async function verifySessionToken(token: string): Promise<VerifiedEspacePartenaireClaims> {
  return verifyToken(token, 'session');
}

export const ESPACE_EXPOSANT_SESSION_COOKIE = 'espace_partenaire_session';
export const ESPACE_EXPOSANT_SESSION_MAX_AGE = SESSION_TTL_SECONDS;

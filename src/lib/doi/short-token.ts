/**
 * Short token URL-safe pour le DOI.
 *
 * Format : 16 chars, alphabet sans ambiguite (pas de 0/O/I/l/1),
 * 96 bits d'entropie via crypto.randomBytes(16).
 *
 * Pourquoi ce token court remplace le JWT (~280 chars) pour la URL DOI :
 *   - le tracker de clic Brevo (custom tracking domain configure cote
 *     compte Phil) 404 sur les URLs longues. Cf. migration 0021.
 *   - le short token n'a pas besoin d'etre auto-validable : on lookup
 *     en DB par index unique. Donc pas besoin de signature crypto.
 *
 * Probabilite de collision sur N tokens generes : ~ N^2 / (54^16 * 2)
 * Pour N=100k tokens : 100k^2 / (5.4e27) = 1.85e-18, negligeable.
 */

import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const TOKEN_LENGTH = 16;
const TTL_SECONDS = 24 * 60 * 60; // 24h

export function generateShortToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  let result = '';
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}

export function computeShortTokenExpiresAt(): Date {
  return new Date(Date.now() + TTL_SECONDS * 1000);
}

export const SHORT_TOKEN_LENGTH = TOKEN_LENGTH;
export const SHORT_TOKEN_TTL_SECONDS = TTL_SECONDS;
export const SHORT_TOKEN_ALPHABET = ALPHABET;

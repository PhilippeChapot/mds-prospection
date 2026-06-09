/**
 * P14.2.SalesCalendarGoogleSync — chiffrement AES-256-GCM des refresh tokens.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure module,
 * PAS de 'use server'. Importable depuis server actions, routes et crons.
 *
 * Le refresh_token Google est un secret long-vécu : on ne le stocke JAMAIS
 * en clair en DB. AES-256-GCM fournit confidentialité + intégrité (authTag
 * détecte toute altération du ciphertext).
 *
 * Clé : dérivée de CALENDAR_OAUTH_ENCRYPTION_KEY via SHA-256 → 32 octets
 * exacts, quelle que soit la longueur/format de la valeur d'env (hex, base64,
 * passphrase). Déterministe → déchiffrable entre déploiements tant que la
 * variable ne change pas.
 *
 * Format de sortie (string unique stockée en DB) :
 *   "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *   - iv      : 12 octets (96 bits, recommandé GCM)
 *   - authTag : 16 octets
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

/** Dérive une clé 32 octets depuis la passphrase d'env (SHA-256). */
function deriveKey(): Buffer {
  const secret = process.env.CALENDAR_OAUTH_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CALENDAR_OAUTH_ENCRYPTION_KEY manquante (chiffrement OAuth impossible).');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Chiffre un plaintext (ex: refresh_token Google).
 * Retourne "iv:authTag:ciphertext" en hex.
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error('encryptToken: plaintext vide.');
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Déchiffre une valeur produite par encryptToken.
 * Throw si le format est invalide ou l'authTag ne matche pas (altération /
 * mauvaise clé).
 */
export function decryptToken(payload: string): string {
  if (!payload) throw new Error('decryptToken: payload vide.');
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptToken: format invalide (attendu iv:authTag:ciphertext).');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = deriveKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Génère un secret aléatoire (hex) — utilisé pour le webhook_token (validation
 * du header X-Goog-Channel-Token) et les channel_id de watch().
 */
export function generateRandomSecret(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}

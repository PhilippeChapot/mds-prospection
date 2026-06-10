/**
 * P11.x.PartnerPasswordOptional — helpers bcrypt (pas de 'use server').
 *
 * Importé par les server actions auth (jamais côté client).
 * cost=12 : ~250ms sur Vercel, acceptable pour un login.
 */

import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Retourne null si valide, sinon un message d'erreur localisé FR. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (password.length > 200) return 'Le mot de passe est trop long.';
  return null;
}

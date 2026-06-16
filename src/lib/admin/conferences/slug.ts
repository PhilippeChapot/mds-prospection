/**
 * P16.3 — slugify titre conférence (URL publique programme P16.5).
 * Module pur (pas 'use server') pour rester importable + testable.
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

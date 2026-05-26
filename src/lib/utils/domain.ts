/**
 * P5.x.23-quater — helpers domaine pour DomainTagsInput + server actions.
 *
 * Pas de check DNS (trop coûteux + pas pertinent — on valide juste le format).
 */

const DOMAIN_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\.[a-z]{2,}$/i;
const SIMPLE_DOMAIN_REGEX = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/**
 * Normalise un domaine saisi par l'utilisateur :
 *   - lowercase
 *   - trim whitespace
 *   - strip protocole (http:// https://)
 *   - strip www. en tête
 *   - strip tout ce qui suit le premier / (path/query)
 *   - strip port :NNNN
 *   - strip fragment #fragment (P5.x.Apollo-bis)
 */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .split(':')[0]
    .trim();
}

/**
 * Vérifie qu'un domaine a un format syntaxiquement plausible.
 * Tolérant (V1) — accepte la plupart des TLD modernes (.fr, .com, .tv, .audio, etc.).
 */
export function isValidDomain(d: string): boolean {
  if (!d || d.length > 253) return false;
  // Use the simple regex first (cheaper); fallback to strict.
  return SIMPLE_DOMAIN_REGEX.test(d) || DOMAIN_REGEX.test(d);
}

/**
 * Nettoie un tableau de domaines : normalise + dédup case-insensitive + filtre valides.
 * Ordre préservé (premier gagne).
 */
export function cleanDomainList(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const n = normalizeDomain(r);
    if (!n || !isValidDomain(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Extrait le domaine d'un email (partie après @, lowercase, normalisée).
 * Retourne null si l'email est invalide (pas de @, partie locale vide,
 * partie domaine vide ou syntaxiquement invalide).
 *
 * Utilisé par P5.x.23-quinquies (auto-suggestion alternate_domain).
 */
export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const raw = email.slice(at + 1);
  const domain = normalizeDomain(raw);
  if (!domain || !isValidDomain(domain)) return null;
  return domain;
}

/**
 * Extrait l'IP cliente depuis les headers d'une requete.
 *
 * Sur Vercel, l'IP est dans `x-forwarded-for` (premier element de la liste)
 * ou `x-real-ip`. On fallback sur "unknown" si rien.
 *
 * IMPORTANT : ne pas trust ces headers en local pour la securite — ils sont
 * faciles a spoofer si pas derriere un proxy de confiance. Vercel les set
 * lui-meme et drop ceux du client, donc OK en prod.
 */

export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}

/**
 * Fetch un logo distant et l'encode en data URL pour l'embedder
 * directement dans un PNG genere par next/og (Satori).
 *
 * P5.x.14 — extrait depuis /api/badge/[companyId]/badge.png.
 *
 * Pourquoi cote serveur : Satori a parfois du mal a fetch les URLs
 * externes (notamment Supabase Storage signe ou avec headers
 * specifiques). Le prefetch server-side garantit le rendu.
 *
 * Best-effort : si la fetch echoue (logo URL invalide, 404, timeout),
 * retourne null. Le caller doit gerer le fallback (typiquement :
 * afficher le nom societe en gros texte).
 */

const LOG_PREFIX = '[social-assets/fetch-logo]';

export async function fetchLogoAsDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('%s fetch-logo-failed status=%d url=%s', LOG_PREFIX, res.status, logoUrl);
      return null;
    }
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') ?? 'image/png';
    const base64 = Buffer.from(buf).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(
      '%s fetch-logo-error url=%s msg=%s',
      LOG_PREFIX,
      logoUrl,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * URLs absolues des logos events (MDS, PRS) version "badge" blanche
 * 1600x1600 PNG (4x DPI pour rendu net a 400x400 ou 160x160).
 *
 * P5.x.14 — extrait depuis /api/badge/[companyId]/badge.png.
 *
 * IMPORTANT: necessite une URL absolue (Satori ne resout pas les chemins
 * relatifs cote serveur). Toujours appeler avec NEXT_PUBLIC_APP_URL.
 */

export function getEventLogos(baseUrl: string): { mds: string; prs: string } {
  return {
    mds: `${baseUrl}/brand/MDSLogo_final_blanc_rond.png`,
    prs: `${baseUrl}/brand/PRS-LogoBlanc-badge.png`,
  };
}

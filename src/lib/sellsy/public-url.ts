/**
 * P5.x.SellsyInvoiceCreationFixes — extraction robuste de l'URL publique
 * partageable d'un document Sellsy V2 (devis / proforma / facture).
 *
 * Sellsy V2 (GET /estimates|/proformas|/invoices/{id}) renvoie le lien public
 * sous DEUX shapes possibles :
 *   - shape RÉELLE (confirmée par curl prod, juin 2026) :
 *       public_link: { enabled: boolean, url: string }
 *   - shape plate (legacy / mocks de test) :
 *       public_link: string  +  public_link_enabled: boolean
 *
 * `pdf_link` (https://file.sellsy.com/?id=...) est le DERNIER recours, mais il
 * est INACCESSIBLE tant que la facture est en brouillon : le PDF n'est généré
 * qu'à la finalisation (validate). Lire pdf_link sur un brouillon produit le
 * fameux « Oups, aucun fichier n'a été trouvé ! ». On préfère donc toujours
 * `public_link.url` (URL sellsy.link courte et stable) quand elle est activée.
 *
 * ⚠ Conséquence directe : ne JAMAIS lire l'URL publique d'une facture avant de
 * l'avoir finalisée (cf. Fix 1 — POST /invoices/{id}/validate).
 */

export interface SellsyDocLinkFields {
  /** Objet { enabled, url } (réel) OU string (legacy). */
  public_link?: unknown;
  /** Flag plat associé au public_link string (legacy). */
  public_link_enabled?: boolean;
  /** Lien PDF signé file.sellsy.com — cassé tant que le doc est en brouillon. */
  pdf_link?: string | null;
}

/**
 * Retourne l'URL publique exploitable du document, ou null si aucune n'est
 * disponible. Gère les deux shapes Sellsy ; tombe sur pdf_link en dernier
 * recours (utile pour les docs déjà finalisés où le PDF existe).
 */
export function extractSellsyPublicUrl(d: SellsyDocLinkFields | null | undefined): string | null {
  if (!d) return null;
  const pl = d.public_link;
  if (pl && typeof pl === 'object') {
    // Shape réelle Sellsy V2 : { enabled, url }
    const o = pl as { enabled?: boolean; url?: unknown };
    if (o.enabled && typeof o.url === 'string' && o.url) return o.url;
  } else if (typeof pl === 'string' && pl) {
    // Shape plate (legacy / mocks) : string + public_link_enabled
    if (d.public_link_enabled) return pl;
  }
  return d.pdf_link ?? null;
}

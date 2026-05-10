/**
 * Documents + Kit communication pour l'Espace Exposant V1.1 — P5.x.10.
 *
 * Pure functions : pas d'IO. Recoivent le `prospect` (lu cote
 * session.ts) et le `locale`, retournent les URLs / contenus a afficher.
 *
 * Guide exposant PDF + plan de salle PDF : `null` tant que les assets
 * ne sont pas finalises. Le composant UI affiche un placeholder
 * "Disponible prochainement" quand null.
 *
 * Signature email HTML : inline-styled table 100% width, compatible
 * Gmail / Outlook (pas de CSS externe, pas de flexbox).
 */

export interface DocumentLinks {
  /** PDF guide exposant. null tant que le PDF n'est pas livre. */
  guidePdfUrl: string | null;
  /** PDF plan de salle MDS 2026. null tant que pas livre. */
  floorPlanPdfUrl: string | null;
  /** Lien public Sellsy du devis (deja persiste sur prospects). */
  devisUrl: string | null;
  /** Lien public Sellsy de la facture. null tant que pas emise. */
  invoiceUrl: string | null;
}

export interface DocumentLinksInput {
  sellsyDevisPublicUrl?: string | null;
  sellsyInvoicePublicUrl?: string | null;
}

/**
 * Construit le bloc Documents du dashboard exposant.
 *
 * Env vars optionnelles :
 *   - EXHIBITOR_GUIDE_PDF_URL : URL du guide exposant PDF
 *   - EXHIBITOR_FLOOR_PLAN_URL : URL du plan de salle PDF
 *
 * Si non posees, on retourne null -> placeholder UI "Disponible
 * prochainement". Permet a Phil de pousser les PDFs en prod sans
 * code change.
 */
export function getDocumentLinks(input: DocumentLinksInput): DocumentLinks {
  return {
    guidePdfUrl: process.env.EXHIBITOR_GUIDE_PDF_URL || null,
    floorPlanPdfUrl: process.env.EXHIBITOR_FLOOR_PLAN_URL || null,
    devisUrl: input.sellsyDevisPublicUrl ?? null,
    invoiceUrl: input.sellsyInvoicePublicUrl ?? null,
  };
}

export interface CommunicationKit {
  logoMdsSvgUrl: string;
  logoMdsPngUrl: string;
  logoPrsSvgUrl: string;
  logoPrsPngUrl: string;
  /** Badge "J'expose chez MDS 2026" pour LinkedIn/Twitter. null si pas pret. */
  badgeJexposeUrl: string | null;
  /** Signature email HTML pre-rendue, prete a coller. */
  emailSignatureHtml: string;
}

const BRAND_BASE = '/brand';

export function getCommunicationKit(locale: 'fr' | 'en' = 'fr'): CommunicationKit {
  return {
    logoMdsSvgUrl: `${BRAND_BASE}/MDS-LogoBleu2026.svg`,
    // PNG haute-res non disponible cote brand assets — on fallback sur
    // la version blanche email (160x160 retina) en attendant une vraie
    // version couleur. A remplacer quand un asset PNG bleu sera livre.
    logoMdsPngUrl: `${BRAND_BASE}/MDS-LogoBlanc2026-email.png`,
    logoPrsSvgUrl: `${BRAND_BASE}/PRS-LogoBleu2026.svg`,
    logoPrsPngUrl: `${BRAND_BASE}/PRS-LogoBlanc2026-email.png`,
    badgeJexposeUrl: process.env.EXHIBITOR_BADGE_URL || null,
    emailSignatureHtml: buildEmailSignatureHtml(locale),
  };
}

function buildEmailSignatureHtml(locale: 'fr' | 'en'): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const logoUrl = `${baseUrl}/brand/MDS-LogoBleu2026.svg`;
  const tagline =
    locale === 'en'
      ? 'Find me at MDS Solutions 2026 — Paris, December 15'
      : 'Retrouvez-moi à MDS Solutions 2026 — Paris, 15 décembre';

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1F2240;">
  <tr>
    <td style="padding-right:14px;border-right:1px solid #E5E9F5;">
      <img src="${logoUrl}" alt="MediaDays Solutions 2026" width="80" height="80" style="display:block;" />
    </td>
    <td style="padding-left:14px;font-size:13px;line-height:1.4;">
      <strong style="color:#294294;font-size:14px;">${escapeHtml(tagline)}</strong><br/>
      <a href="${baseUrl}" style="color:#294294;text-decoration:none;">${baseUrl.replace(/^https?:\/\//, '')}</a>
    </td>
  </tr>
</table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

/** Categorie tarifaire de la company (cf. enum DB `category_tarif`). */
export type CategoryTarif = 'prs_exhibitor' | 'standard' | 'non_eligible';

/**
 * Construit le Kit communication a afficher cote Espace Exposant.
 *
 * P5.x.10.bis : la signature email est differenciee selon la categorie
 * tarifaire de la company :
 *   - prs_exhibitor    -> logo Paris Radio Show + wording "Retrouvez-nous
 *                         au Paris Radio Show / MediaDays Solutions"
 *   - standard / non_eligible / null -> logo MediaDays Solutions + wording
 *                         "Retrouvez-nous aux MediaDays Solutions"
 *
 * Doctrine branding : "MediaDays Solutions" (D majuscule, jamais "MDS
 * Solutions"), "Paris Radio Show" (pas "PRS" user-facing), "Retrouvez-
 * nous" (pluriel — signature de societe).
 */
export function getCommunicationKit(
  locale: 'fr' | 'en' = 'fr',
  category: CategoryTarif | null = null,
): CommunicationKit {
  const isPrsExhibitor = category === 'prs_exhibitor';
  return {
    logoMdsSvgUrl: `${BRAND_BASE}/MDS-LogoBleu2026.svg`,
    // PNG haute-res couleur non disponible — fallback sur la version
    // blanche email (160x160 retina) en attendant une vraie version
    // couleur. A remplacer quand un PNG bleu sera livre.
    logoMdsPngUrl: `${BRAND_BASE}/MDS-LogoBlanc2026-email.png`,
    logoPrsSvgUrl: `${BRAND_BASE}/PRS-LogoBleu2026.svg`,
    logoPrsPngUrl: `${BRAND_BASE}/PRS-LogoBlanc2026-email.png`,
    badgeJexposeUrl: process.env.EXHIBITOR_BADGE_URL || null,
    emailSignatureHtml: getEmailSignatureHtml(locale, isPrsExhibitor),
  };
}

/**
 * Exporte pour tests Vitest (verifie les 4 variants FR/EN x PRS/MDS).
 */
export function getEmailSignatureHtml(locale: 'fr' | 'en', isPrsExhibitor: boolean): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  // Le logo couleur n'est pas dispo en PNG ; le SVG sur baseUrl est compatible
  // Gmail webmail / Apple Mail / Outlook 365 web. Outlook desktop legacy
  // tombe sur l'alt text — acceptable pour MVP.
  const logoUrl = isPrsExhibitor
    ? `${baseUrl}/brand/PRS-LogoBleu2026.svg`
    : `${baseUrl}/brand/MDS-LogoBleu2026.svg`;
  const logoAlt = isPrsExhibitor ? 'Paris Radio Show 2026' : 'MediaDays Solutions 2026';

  // Tagline + sub-line selon variant (4 combinaisons).
  let tagline: string;
  let subline: string;
  if (isPrsExhibitor && locale === 'fr') {
    tagline = 'Retrouvez-nous au Paris Radio Show / MediaDays Solutions 2026';
    subline = 'Paris, 15 décembre et/ou Marseille, 10 décembre';
  } else if (isPrsExhibitor && locale === 'en') {
    tagline = 'Find us at Paris Radio Show / MediaDays Solutions 2026';
    subline = 'Paris, December 15 and/or Marseille, December 10';
  } else if (locale === 'en') {
    tagline = 'Find us at MediaDays Solutions 2026';
    subline = 'Paris and/or Marseille';
  } else {
    tagline = 'Retrouvez-nous aux MediaDays Solutions 2026';
    subline = 'Paris et/ou Marseille';
  }

  // P5.x.10.ter : double lien footer (exhibitor + visitor) avec
  // target=_blank + rel=noopener (anti-tabnabbing) sur chaque ancre.
  // Liens hardcodes : mediadays.solutions = B2B exposants, mediadays.net
  // = B2C visiteurs (independants de NEXT_PUBLIC_APP_URL qui pointe
  // sur le sous-domaine du repo courant).
  const exhibitorLabel = locale === 'en' ? 'Exhibitor info:' : 'Infos exposants :';
  const visitorLabel = locale === 'en' ? 'Visitor info:' : 'Infos visiteurs :';

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;color:#1F2240;">
  <tr>
    <td style="padding-right:16px;border-right:1px solid #E5E7EB;vertical-align:middle;">
      <img src="${logoUrl}" alt="${escapeAttr(logoAlt)}" width="120" height="120" style="display:block;width:120px;height:auto;" />
    </td>
    <td style="padding-left:16px;vertical-align:middle;">
      <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#294294;line-height:1.4;">
        ${escapeHtml(tagline)}
      </p>
      <p style="margin:0 0 8px 0;font-size:13px;color:#5A6080;line-height:1.4;">
        ${escapeHtml(subline)}
      </p>
      <p style="margin:0 0 2px 0;font-size:13px;color:#294294;line-height:1.4;">
        ${escapeHtml(exhibitorLabel)} <a href="https://mediadays.solutions" target="_blank" rel="noopener noreferrer" style="color:#294294;text-decoration:none;font-weight:600;">mediadays.solutions</a>
      </p>
      <p style="margin:0;font-size:13px;color:#294294;line-height:1.4;">
        ${escapeHtml(visitorLabel)} <a href="https://mediadays.net" target="_blank" rel="noopener noreferrer" style="color:#294294;text-decoration:none;font-weight:600;">mediadays.net</a>
      </p>
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

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

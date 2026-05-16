/**
 * P6.x.1a-quater — auto-classification déterministe des produits Sellsy
 * par regex sur leur référence (SKU).
 *
 * Hypothèse : les références Sellsy MDS-* suivent une convention stricte
 * `MDS-{type}-{detail}-{venue}` qui suffit à inférer (category, sub_category)
 * sans IA. Phil peut toujours override manuellement après l'auto-classif.
 *
 * Règles ordonnées : les patterns plus spécifiques d'abord (LOGO-GOLD avant
 * LOGO- générique). Premier match gagne, retour immédiat.
 *
 * Vrais SKUs audités le 2026-05-16 (36 produits actifs) — patterns alignés
 * sur les références réelles, pas sur les exemples du brief :
 *   - PACK-STD-* / PACK-PRSEXH-* (pas STANDARD / PRS)
 *   - OPT-{STD|PRSEXH}-*-MARSEILLE = complément Marseille → classé en pack
 *   - 14 sous-types ADDON (LOGO, LANYARDS, PUBRE, WIRED, WIFI, ELEC, SCREEN,
 *     PANEL, VISUEL, KAKEMONO, EMAIL, CASINO, DEJEUNER, MASTERCLASS, PRIVATE, VIP)
 */

import type { TarifCategory } from './types';

export type ClassificationConfidence = 'high' | 'medium' | 'low';

export interface Classification {
  category: TarifCategory;
  sub_category: string | null;
  confidence: ClassificationConfidence;
  matched_pattern: string;
  label: string;
}

interface RulePattern {
  pattern: RegExp;
  category: TarifCategory;
  sub_category: string | null;
  label: string;
}

// IMPORTANT : ordre = priorité. Patterns spécifiques avant fallbacks.
const RULES: RulePattern[] = [
  // ───────── Packs Paris ─────────
  {
    pattern: /^MDS-PACK-STD\b/i,
    category: 'pack',
    sub_category: 'standard',
    label: 'Pack Standard Paris',
  },
  {
    pattern: /^MDS-PACK-PRSEXH\b/i,
    category: 'pack',
    sub_category: 'prs',
    label: 'Pack Exposant PRS Paris',
  },
  // Variantes futures plausibles (au cas où Phil renomme un jour) :
  {
    pattern: /^MDS-PACK-STANDARD\b/i,
    category: 'pack',
    sub_category: 'standard',
    label: 'Pack Standard',
  },
  { pattern: /^MDS-PACK-PRS\b/i, category: 'pack', sub_category: 'prs', label: 'Pack PRS' },
  {
    pattern: /^MDS-PACK-PREMIUM\b/i,
    category: 'pack',
    sub_category: 'premium',
    label: 'Pack Premium',
  },
  {
    pattern: /^MDS-PACK-ACCESS\b/i,
    category: 'pack',
    sub_category: 'access',
    label: 'Pack Access',
  },
  { pattern: /^MDS-PACK-/i, category: 'pack', sub_category: null, label: 'Pack (générique)' },

  // ───────── Compléments Marseille (sémantiquement = pack) ─────────
  {
    pattern: /^MDS-OPT-STD-.*-MARSEILLE/i,
    category: 'pack',
    sub_category: 'marseille_std',
    label: 'Complément Marseille Standard',
  },
  {
    pattern: /^MDS-OPT-PRSEXH-.*-MARSEILLE/i,
    category: 'pack',
    sub_category: 'marseille_prs',
    label: 'Complément Marseille PRS',
  },

  // ───────── Sponsors (visibilité branding) ─────────
  {
    pattern: /^MDS-ADDON-LOGO-GOLD\b/i,
    category: 'sponsor',
    sub_category: 'or',
    label: 'Sponsor Or',
  },
  {
    pattern: /^MDS-ADDON-LOGO-SILVER\b/i,
    category: 'sponsor',
    sub_category: 'argent',
    label: 'Sponsor Argent',
  },
  {
    pattern: /^MDS-ADDON-LOGO-BRONZE\b/i,
    category: 'sponsor',
    sub_category: 'bronze',
    label: 'Sponsor Bronze',
  },
  {
    pattern: /^MDS-ADDON-LOGO-PLATINUM\b/i,
    category: 'sponsor',
    sub_category: 'platinum',
    label: 'Sponsor Platinum',
  },
  {
    pattern: /^MDS-ADDON-LOGO-/i,
    category: 'sponsor',
    sub_category: null,
    label: 'Sponsor logo (générique)',
  },
  {
    pattern: /^MDS-ADDON-LANYARDS\b/i,
    category: 'sponsor',
    sub_category: 'lanyards',
    label: 'Lanyards sponsorisés',
  },
  {
    pattern: /^MDS-ADDON-LANYARD\b/i,
    category: 'sponsor',
    sub_category: 'lanyard',
    label: 'Lanyard sponsorisé',
  },
  {
    pattern: /^MDS-ADDON-BADGE\b/i,
    category: 'sponsor',
    sub_category: 'badge',
    label: 'Badge sponsorisé',
  },
  {
    pattern: /^MDS-ADDON-PUBRE\b/i,
    category: 'sponsor',
    sub_category: 'pub_redactionnelle',
    label: 'Pub rédactionnelle',
  },

  // ───────── Options techniques (équipement stand / connectivité) ─────────
  {
    pattern: /^MDS-ADDON-WIRED\b/i,
    category: 'option',
    sub_category: 'wifi',
    label: 'Internet filaire',
  },
  { pattern: /^MDS-ADDON-WIFI\b/i, category: 'option', sub_category: 'wifi', label: 'WiFi' },
  { pattern: /^MDS-ADDON-ELEC\b/i, category: 'option', sub_category: 'elec', label: 'Électricité' },
  { pattern: /^MDS-ADDON-SCREEN\b/i, category: 'option', sub_category: 'ecran', label: 'Écran' },
  {
    pattern: /^MDS-ADDON-PANEL\b/i,
    category: 'option',
    sub_category: 'panneau',
    label: 'Panneau cloison',
  },
  {
    pattern: /^MDS-ADDON-VISUEL\b/i,
    category: 'option',
    sub_category: 'visuel',
    label: 'Impression visuel',
  },
  {
    pattern: /^MDS-ADDON-KAKEMONO\b/i,
    category: 'option',
    sub_category: 'kakemono',
    label: 'Kakemono',
  },
  { pattern: /^MDS-ADDON-M2\b/i, category: 'option', sub_category: 'm2', label: 'Surface m²' },
  {
    pattern: /^MDS-ADDON-MOBILIER\b/i,
    category: 'option',
    sub_category: 'mobilier',
    label: 'Mobilier',
  },

  // ───────── Services (animation, restauration, accueil) ─────────
  {
    pattern: /^MDS-ADDON-EMAIL\b/i,
    category: 'service',
    sub_category: 'emailing',
    label: 'Emailing',
  },
  { pattern: /^MDS-ADDON-CASINO\b/i, category: 'service', sub_category: 'casino', label: 'Casino' },
  {
    pattern: /^MDS-ADDON-DEJEUNER\b/i,
    category: 'service',
    sub_category: 'dejeuner',
    label: 'Déjeuner VIP',
  },
  {
    pattern: /^MDS-ADDON-MASTERCLASS\b/i,
    category: 'service',
    sub_category: 'masterclass',
    label: 'Masterclass',
  },
  {
    pattern: /^MDS-ADDON-PRIVATE\b/i,
    category: 'service',
    sub_category: 'private_room',
    label: 'Salle privative',
  },
  { pattern: /^MDS-ADDON-VIP\b/i, category: 'service', sub_category: 'vip', label: 'Accueil VIP' },
  {
    pattern: /^MDS-ADDON-COFFEE\b/i,
    category: 'service',
    sub_category: 'coffee',
    label: 'Coffee corner',
  },
  {
    pattern: /^MDS-ADDON-TRAITEUR\b/i,
    category: 'service',
    sub_category: 'traiteur',
    label: 'Traiteur',
  },
  {
    pattern: /^MDS-ADDON-HOTESSE\b/i,
    category: 'service',
    sub_category: 'hotesse',
    label: 'Hôtesse',
  },
  {
    pattern: /^MDS-ADDON-SECURITE\b/i,
    category: 'service',
    sub_category: 'securite',
    label: 'Sécurité',
  },

  // ───────── Fallback générique ADDON ─────────
  { pattern: /^MDS-ADDON-/i, category: 'autre', sub_category: null, label: 'Addon non classifié' },
];

export function classifyByReference(reference: string | null | undefined): Classification | null {
  if (!reference) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(reference)) {
      return {
        category: rule.category,
        sub_category: rule.sub_category,
        // 'high' si on a une sub_category (= règle spécifique), 'medium' sinon
        confidence: rule.sub_category ? 'high' : rule.category === 'autre' ? 'low' : 'medium',
        matched_pattern: rule.pattern.source,
        label: rule.label,
      };
    }
  }
  return null;
}

/** Pour debug : liste les règles publiquement (utilisé par tests). */
export function getClassificationRules(): ReadonlyArray<{
  pattern: string;
  category: TarifCategory;
  sub_category: string | null;
  label: string;
}> {
  return RULES.map((r) => ({
    pattern: r.pattern.source,
    category: r.category,
    sub_category: r.sub_category,
    label: r.label,
  }));
}

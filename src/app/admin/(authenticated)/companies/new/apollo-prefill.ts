/**
 * P5.x.CompanyNewApolloEnrich — mapping Apollo → champs formulaire société +
 * détection de conflits. Module pur (testable, importé côté server ET client).
 *
 * Limite plan Apollo : seul /organizations/enrich (par domaine) est disponible
 * — pas de recherche fuzzy/multi par nom (cf. en-tête apollo/client.ts). On
 * enrichit donc à partir d'un domaine ou d'une URL ; un nom seul est refusé.
 */

import { normalizeCountryToIso } from '@/lib/format/country';
import type { ApolloOrganization } from '@/lib/apollo/client';

/** Champs réellement présents dans le formulaire de création société. */
export interface CompanyPrefill {
  name: string | null;
  primary_domain: string | null;
  country: string | null; // ISO 2
  apolloOrganizationId: string;
  /** Infos additionnelles Apollo (affichage seul — pas de colonne dédiée). */
  info: {
    industry: string | null;
    employees: number | null;
    city: string | null;
    foundedYear: number | null;
    linkedinUrl: string | null;
    description: string | null;
  };
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Extrait un domaine enrichissable depuis la saisie (domaine nu ou URL).
 * Renvoie null pour un nom seul ou une URL LinkedIn (non enrichissable par
 * /organizations/enrich qui prend un domaine).
 */
export function extractDomainFromQuery(query: string): string | null {
  const s = query.trim();
  if (!s || s.includes(' ')) return null;
  if (/^https?:\/\//i.test(s)) {
    const host = hostFromUrl(s);
    if (!host || /linkedin\.com$/i.test(host)) return null;
    return host;
  }
  // Domaine nu : au moins un point + TLD alpha.
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s)) {
    return s.replace(/^www\./i, '').toLowerCase();
  }
  return null;
}

export function mapOrgToPrefill(org: ApolloOrganization): CompanyPrefill {
  const primaryDomain =
    (org.primary_domain as string | null | undefined) ?? hostFromUrl(org.website_url);
  return {
    name: org.name?.trim() || null,
    primary_domain: primaryDomain,
    country: normalizeCountryToIso(org.country),
    apolloOrganizationId: org.id,
    info: {
      industry: org.industry ?? null,
      employees: org.estimated_num_employees ?? null,
      city: org.city ?? null,
      foundedYear: org.founded_year ?? null,
      linkedinUrl: org.linkedin_url ?? null,
      description: org.short_description ?? null,
    },
  };
}

export interface CurrentValues {
  name: string;
  primary_domain: string;
  country: string;
}

export interface ConflictField {
  field: 'name' | 'primary_domain' | 'country';
  label: string;
  from: string;
  to: string;
}

const FIELD_LABELS: Record<ConflictField['field'], string> = {
  name: 'Nom',
  primary_domain: 'Domaine',
  country: 'Pays',
};

/**
 * Conflits = champs déjà renseignés (non vides) dont la valeur Apollo (non
 * vide) diffère. Les champs vides seront remplis sans confirmation.
 */
export function detectConflicts(current: CurrentValues, next: CompanyPrefill): ConflictField[] {
  const out: ConflictField[] = [];
  const fields: ConflictField['field'][] = ['name', 'primary_domain', 'country'];
  for (const field of fields) {
    const cur = (current[field] ?? '').trim();
    const nextVal = (next[field] ?? '') as string;
    const to = (nextVal ?? '').trim();
    if (cur && to && cur.toLowerCase() !== to.toLowerCase()) {
      out.push({ field, label: FIELD_LABELS[field], from: cur, to });
    }
  }
  return out;
}

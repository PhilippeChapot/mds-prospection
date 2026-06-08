/**
 * P5.x.SearchFuzzy — wrapper TS autour des RPC SQL search_*_fuzzy.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pas de
 * 'use server' ici, async pure fonctions. Importable de server actions
 * ET server components.
 *
 * Les RPC SQL gerent unaccent+lower + pg_trgm en une seule call → on
 * retourne `{ exact, suggestions }` typees pour l UI.
 *
 * Pour V1 : pas de filtres complementaires (pole, status, etc.) dans la
 * RPC. La query principale (listProspectsPaginated etc.) garde son
 * comportement avec filtres complexes ; cette helper sert uniquement a
 * recuperer les suggestions "vouliez-vous dire" affichees sous le tableau.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type SearchSuggestion = {
  id: string;
  label: string;
  score: number;
};

export type FuzzySearchResult = {
  exact: SearchSuggestion[];
  suggestions: SearchSuggestion[];
  query: string;
};

export interface FuzzySearchOptions {
  limitExact?: number;
  limitFuzzy?: number;
}

const DEFAULT_LIMIT_EXACT = 50;
const DEFAULT_LIMIT_FUZZY = 5;

/**
 * Recherche fuzzy sur companies. La RPC retourne 2 sets (exact match
 * substring insensible + fuzzy trgm). On split ici pour l UI.
 */
export async function searchCompaniesFuzzy(
  query: string,
  options: FuzzySearchOptions = {},
): Promise<FuzzySearchResult> {
  const supabase = await createSupabaseServerClient();
  const q = (query ?? '').trim();
  if (q.length < 2) return { exact: [], suggestions: [], query: q };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = supabase as any;
  const { data, error } = await supa.rpc('search_companies_fuzzy', {
    p_query: q,
    p_limit_exact: options.limitExact ?? DEFAULT_LIMIT_EXACT,
    p_limit_fuzzy: options.limitFuzzy ?? DEFAULT_LIMIT_FUZZY,
  });
  if (error) {
    console.error('[searchCompaniesFuzzy]', error.message);
    return { exact: [], suggestions: [], query: q };
  }

  type Row = {
    id: string;
    name: string;
    primary_domain: string | null;
    website: string | null;
    match_type: 'exact' | 'fuzzy';
    score: number;
  };
  const rows: Row[] = (data ?? []) as Row[];
  return splitExactAndSuggestions(rows, (r) => ({ id: r.id, label: r.name, score: r.score }), q);
}

export async function searchContactsFuzzy(
  query: string,
  options: FuzzySearchOptions = {},
): Promise<FuzzySearchResult> {
  const supabase = await createSupabaseServerClient();
  const q = (query ?? '').trim();
  if (q.length < 2) return { exact: [], suggestions: [], query: q };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = supabase as any;
  const { data, error } = await supa.rpc('search_contacts_fuzzy', {
    p_query: q,
    p_limit_exact: options.limitExact ?? DEFAULT_LIMIT_EXACT,
    p_limit_fuzzy: options.limitFuzzy ?? DEFAULT_LIMIT_FUZZY,
  });
  if (error) {
    console.error('[searchContactsFuzzy]', error.message);
    return { exact: [], suggestions: [], query: q };
  }

  type Row = {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    match_type: 'exact' | 'fuzzy';
    score: number;
  };
  const rows: Row[] = (data ?? []) as Row[];
  return splitExactAndSuggestions(
    rows,
    (r) => ({
      id: r.id,
      label: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.email,
      score: r.score,
    }),
    q,
  );
}

export async function searchProspectsFuzzy(
  query: string,
  options: FuzzySearchOptions = {},
): Promise<FuzzySearchResult> {
  const supabase = await createSupabaseServerClient();
  const q = (query ?? '').trim();
  if (q.length < 2) return { exact: [], suggestions: [], query: q };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = supabase as any;
  const { data, error } = await supa.rpc('search_prospects_fuzzy', {
    p_query: q,
    p_limit_exact: options.limitExact ?? DEFAULT_LIMIT_EXACT,
    p_limit_fuzzy: options.limitFuzzy ?? DEFAULT_LIMIT_FUZZY,
  });
  if (error) {
    console.error('[searchProspectsFuzzy]', error.message);
    return { exact: [], suggestions: [], query: q };
  }

  type Row = {
    id: string;
    company_id: string;
    company_name: string;
    match_type: 'exact' | 'fuzzy';
    score: number;
  };
  const rows: Row[] = (data ?? []) as Row[];
  return splitExactAndSuggestions(
    rows,
    (r) => ({ id: r.id, label: r.company_name, score: r.score }),
    q,
  );
}

/**
 * Split la sortie RPC en exact + suggestions + de-dup les labels pour
 * eviter "Mediarun" affiche 3 fois dans suggestions si plusieurs companies
 * ont le meme nom (rare).
 */
function splitExactAndSuggestions<T extends { match_type: 'exact' | 'fuzzy' }>(
  rows: T[],
  toSuggestion: (r: T) => SearchSuggestion,
  query: string,
): FuzzySearchResult {
  const exact: SearchSuggestion[] = [];
  const suggestionsRaw: SearchSuggestion[] = [];
  for (const r of rows) {
    const s = toSuggestion(r);
    if (r.match_type === 'exact') exact.push(s);
    else suggestionsRaw.push(s);
  }
  // De-dup suggestions par label normalise.
  const seen = new Set<string>();
  const suggestions = suggestionsRaw.filter((s) => {
    const key = s.label.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { exact, suggestions, query };
}

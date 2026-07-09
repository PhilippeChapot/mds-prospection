import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import {
  listContactsPaginated,
  getContactsKpis,
  type ContactListFilters,
} from '@/lib/contacts/admin-queries';
import { ContactsTable } from './_components/ContactsTable';
import { ContactsKpisCards } from './_components/ContactsKpisCards';
import { ExportContactsButton } from './ExportContactsButton';
import { searchContactsFuzzy } from '@/lib/admin/search/fuzzy-search';
import { SearchSuggestions } from '@/components/admin/SearchSuggestions';

export const metadata = { title: 'Contacts' };

const PER_PAGE = 50;

type SearchParams = Promise<{
  q?: string;
  pole?: string;
  language?: string;
  brevoSync?: string;
  lifecycle?: string;
  marketing?: string;
  companyId?: string;
  /** P5.x.ProspectionIndicators */
  prospect?: string;
  page?: string;
}>;

export default async function AdminContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  const params = await searchParams;

  const q = params.q?.trim() ?? '';
  const poleFilter: PoleCode | '' =
    params.pole && POLE_CODES.includes(params.pole as PoleCode) ? (params.pole as PoleCode) : '';
  const language = params.language === 'FR' || params.language === 'EN' ? params.language : '';
  const brevoSync =
    params.brevoSync === 'synced' || params.brevoSync === 'unsynced' ? params.brevoSync : '';
  const lifecycle =
    params.lifecycle === 'enabled' || params.lifecycle === 'disabled' ? params.lifecycle : '';
  const marketing =
    params.marketing === 'opted_in' || params.marketing === 'opted_out' ? params.marketing : '';
  const companyId = params.companyId?.trim() ?? '';
  const prospectFilter =
    params.prospect === 'prospect_only' || params.prospect === 'non_prospect'
      ? params.prospect
      : '';
  const page = Math.max(1, Number(params.page ?? '1'));

  const filters: ContactListFilters = {
    q: q || undefined,
    poleCode: poleFilter || null,
    language: language || null,
    brevoSync: brevoSync || null,
    lifecycle: lifecycle || null,
    marketing: marketing || null,
    companyId: companyId || null,
    prospectFilter:
      prospectFilter === 'prospect_only' || prospectFilter === 'non_prospect'
        ? prospectFilter
        : null,
    page,
    perPage: PER_PAGE,
  };

  const [{ rows, total }, kpis, fuzzyResults] = await Promise.all([
    listContactsPaginated(filters),
    getContactsKpis(),
    // P5.x.SearchFuzzy : suggestions "vouliez-vous dire" si q >= 2 chars.
    q.length >= 2
      ? searchContactsFuzzy(q, { limitFuzzy: 5 })
      : Promise.resolve({ exact: [], suggestions: [], query: q }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilters = Boolean(
    q ||
    poleFilter ||
    language ||
    brevoSync ||
    lifecycle ||
    marketing ||
    companyId ||
    prospectFilter,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Contacts · {total}
          </h1>
          <p className="text-md-text-muted text-sm">
            Vue globale des contacts, filtres + recherche. Pour ajouter / modifier un contact,
            passer par la fiche société.
          </p>
        </div>
        {isSuperAdmin(profile.role) && <ExportContactsButton filters={filters} />}
      </div>

      <ContactsKpisCards kpis={kpis} />

      <form
        method="get"
        className="bg-card border-md-border flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[260px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par email, prénom, nom…"
            className="pl-9"
          />
        </div>

        <select
          name="pole"
          defaultValue={poleFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous pôles</option>
          {POLE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <select
          name="language"
          defaultValue={language}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Toutes langues</option>
          <option value="FR">FR</option>
          <option value="EN">EN</option>
        </select>

        <select
          name="brevoSync"
          defaultValue={brevoSync}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Brevo : tous</option>
          <option value="synced">Synchronisés</option>
          <option value="unsynced">Non sync</option>
        </select>

        <select
          name="lifecycle"
          defaultValue={lifecycle}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Lifecycle : tous</option>
          <option value="enabled">Activé</option>
          <option value="disabled">Désactivé</option>
        </select>

        <select
          name="marketing"
          defaultValue={marketing}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Marketing : tous</option>
          <option value="opted_in">Opt-in</option>
          <option value="opted_out">Opt-out</option>
        </select>

        {/* P5.x.ProspectionIndicators */}
        <select
          name="prospect"
          defaultValue={prospectFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Prospect : tous</option>
          <option value="prospect_only">✅ Prospect uniquement</option>
          <option value="non_prospect">— Non prospect</option>
        </select>

        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>

        {hasFilters && (
          <Link
            href="/admin/contacts"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      <ContactsTable rows={rows} />

      {fuzzyResults.suggestions.length > 0 ? (
        <SearchSuggestions suggestions={fuzzyResults.suggestions} />
      ) : null}

      {totalPages > 1 ? (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          buildHref={(p) => buildContactsHref({ ...params, page: String(p) })}
        />
      ) : null}
    </div>
  );
}

function buildContactsHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/admin/contacts?${qs}` : '/admin/contacts';
}

function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  const prev = Math.max(1, currentPage - 1);
  const next = Math.min(totalPages, currentPage + 1);
  return (
    <nav className="text-md-text-muted flex items-center justify-between text-xs">
      <Link
        href={buildHref(prev)}
        aria-disabled={currentPage === 1}
        className={`rounded-md border px-3 py-1.5 ${currentPage === 1 ? 'pointer-events-none opacity-50' : 'border-md-border hover:bg-muted/30'}`}
      >
        ← Précédent
      </Link>
      <span>
        Page <strong>{currentPage}</strong> / {totalPages}
      </span>
      <Link
        href={buildHref(next)}
        aria-disabled={currentPage === totalPages}
        className={`rounded-md border px-3 py-1.5 ${currentPage === totalPages ? 'pointer-events-none opacity-50' : 'border-md-border hover:bg-muted/30'}`}
      >
        Suivant →
      </Link>
    </nav>
  );
}

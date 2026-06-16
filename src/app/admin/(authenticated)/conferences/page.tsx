import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import {
  listConferencesAction,
  getConferenceStatsAction,
} from '@/lib/admin/conferences/crud-actions';
import {
  CONFERENCE_TYPES,
  CONFERENCE_TYPE_LABEL,
  CONFERENCE_CITIES,
} from '@/lib/conferences/constants';
import { ConferencesListClient } from './ConferencesListClient';

export const metadata = { title: 'Conférences' };

type SearchParams = Promise<{
  city?: string;
  type?: string;
  published?: string;
  featured?: string;
}>;

export default async function ConferencesPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  const params = await searchParams;

  const city =
    params.city && (CONFERENCE_CITIES as readonly string[]).includes(params.city)
      ? params.city
      : '';
  const type =
    params.type && (CONFERENCE_TYPES as readonly string[]).includes(params.type) ? params.type : '';
  const published = params.published === '1' ? true : params.published === '0' ? false : null;
  const featured = params.featured === '1' ? true : null;

  const [rows, stats] = await Promise.all([
    listConferencesAction({
      city: city || null,
      conferenceType: type || null,
      isPublished: published,
      featured,
    }),
    getConferenceStatsAction(),
  ]);

  const hasFilters = Boolean(city || type || params.published || featured);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Conférences · {stats.total}
          </h1>
          <p className="text-md-text-muted text-sm">
            Programme MDS 2026 (Marseille · Bruxelles · Paris).
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/conferences/new">
            <Plus className="size-4" aria-hidden />
            Nouvelle conférence
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Publiées" value={stats.published} emoji="🟢" />
        <StatCard label="Featured" value={stats.featured} emoji="⭐" />
        {CONFERENCE_CITIES.map((c) => (
          <StatCard key={c} label={c} value={stats.byCity[c] ?? 0} />
        ))}
      </div>

      <form
        method="get"
        className="bg-card border-md-border flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm"
      >
        <select
          name="city"
          defaultValue={city}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Toutes villes</option>
          {CONFERENCE_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={type}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous types</option>
          {CONFERENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONFERENCE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          name="published"
          defaultValue={params.published ?? ''}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous statuts</option>
          <option value="1">Publiées</option>
          <option value="0">Brouillons</option>
        </select>
        <label className="text-md-text-muted inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            name="featured"
            value="1"
            defaultChecked={featured === true}
            className="size-3.5"
          />
          Featured
        </label>
        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>
        {hasFilters && (
          <Link
            href="/admin/conferences"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Reinitialiser
          </Link>
        )}
      </form>

      <ConferencesListClient rows={rows} currentRole={profile.role} />
    </div>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: number; emoji?: string }) {
  return (
    <div className="bg-card border-md-border rounded-xl border p-4 shadow-sm">
      <div className="text-md-text-muted text-xs font-semibold tracking-wide uppercase">
        {emoji ? <span className="mr-1">{emoji}</span> : null}
        {label}
      </div>
      <div className="text-md-blue-dark mt-1 text-2xl font-extrabold">{value}</div>
    </div>
  );
}

import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { listSpeakersAction, getSpeakerStatsAction } from '@/lib/admin/speakers/list-actions';
import {
  SPEAKER_TYPES,
  SPEAKER_TYPE_LABEL,
  SPEAKER_STATUSES,
  SPEAKER_STATUS_LABEL,
} from '@/lib/speakers/constants';
import { VISITOR_LANGUAGES, VISITOR_LANGUAGE_LABEL } from '@/lib/visitors/constants';
import { SpeakersListClient } from './SpeakersListClient';

export const metadata = { title: 'Speakers' };

type SearchParams = Promise<{
  q?: string;
  status?: string;
  type?: string;
  language?: string;
}>;

export default async function SpeakersPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  const params = await searchParams;

  const q = params.q?.trim() ?? '';
  const status =
    params.status && (SPEAKER_STATUSES as readonly string[]).includes(params.status)
      ? params.status
      : '';
  const type =
    params.type && (SPEAKER_TYPES as readonly string[]).includes(params.type) ? params.type : '';
  const language =
    params.language && (VISITOR_LANGUAGES as readonly string[]).includes(params.language)
      ? params.language
      : '';

  const [{ rows }, stats] = await Promise.all([
    listSpeakersAction({
      query: q || undefined,
      status: status || null,
      speakerType: type || null,
      language: language || null,
    }),
    getSpeakerStatsAction(),
  ]);

  const hasFilters = Boolean(q || status || type || language);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Speakers · {stats.total}
          </h1>
          <p className="text-md-text-muted text-sm">Intervenants conférences MDS 2026.</p>
        </div>
        <Button asChild>
          <Link href="/admin/speakers/new">
            <Plus className="size-4" aria-hidden />
            Nouveau speaker
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Confirmés" value={stats.confirmed} emoji="🟢" />
        <StatCard label="En attente" value={stats.proposed} emoji="🟡" />
        <StatCard label="Contactés" value={stats.contacted} emoji="🔵" />
      </div>

      <form
        method="get"
        className="bg-card border-md-border flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par nom ou email…"
            className="pl-9"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous statuts</option>
          {SPEAKER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SPEAKER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={type}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous types</option>
          {SPEAKER_TYPES.map((t) => (
            <option key={t} value={t}>
              {SPEAKER_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          name="language"
          defaultValue={language}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Toutes langues</option>
          {VISITOR_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {VISITOR_LANGUAGE_LABEL[l]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>
        {hasFilters && (
          <Link
            href="/admin/speakers"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Reinitialiser
          </Link>
        )}
      </form>

      <SpeakersListClient rows={rows} currentRole={profile.role} />
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

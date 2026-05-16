/**
 * P6.x.4-a — page admin pour gérer les demandes Institutionnel/École
 * captées depuis la landing publique.
 *
 * Filtres : type (institutionnel|ecole|all), status (workflow commercial).
 * Pas de RLS publique : reads via service-role + UI restreinte aux admins.
 */

import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { RequestRow, type RequestRowData } from './RequestRow';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Demandes tarif spécial' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ type?: string; status?: string }>;

const TYPE_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'institutionnel', label: 'Institutionnels' },
  { value: 'ecole', label: 'Écoles' },
] as const;

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'new', label: 'Nouvelles' },
  { value: 'contacted', label: 'Contactées' },
  { value: 'devis_sent', label: 'Devis envoyé' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
] as const;

export default async function DemandesPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    redirect('/admin?error=demandes_admin_only');
  }
  const { type, status } = await searchParams;
  const typeFilter = TYPE_FILTERS.some((t) => t.value === type)
    ? (type as 'institutionnel' | 'ecole' | 'all')
    : 'all';
  const statusFilter = STATUS_FILTERS.some((s) => s.value === status)
    ? (status as 'new' | 'contacted' | 'devis_sent' | 'won' | 'lost' | 'all')
    : 'all';

  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from('institutionnel_ecole_requests')
    .select(
      'id, type, org_name, contact_name, contact_email, contact_phone, website, message, status, admin_notes, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (typeFilter !== 'all') query = query.eq('type', typeFilter);
  if (statusFilter !== 'all') query = query.eq('status', statusFilter);
  const { data, error } = await query;
  const requests = (data ?? []) as RequestRowData[];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark text-2xl font-extrabold">Demandes tarif spécial</h1>
          <p className="text-md-text-muted text-sm">
            Institutionnels & Syndicats (famille 11) · Écoles & Formation (famille 13) — captés
            depuis la landing.
          </p>
        </div>
        <div className="text-md-text-muted text-sm">{requests.length} demande(s)</div>
      </header>

      <div className="space-y-3">
        <FilterRow
          label="Type"
          options={[...TYPE_FILTERS]}
          activeValue={typeFilter}
          buildHref={(v) =>
            `/admin/demandes-institutionnel-ecole?${new URLSearchParams({
              ...(v === 'all' ? {} : { type: v }),
              ...(statusFilter === 'all' ? {} : { status: statusFilter }),
            }).toString()}`
          }
        />
        <FilterRow
          label="Status"
          options={[...STATUS_FILTERS]}
          activeValue={statusFilter}
          buildHref={(v) =>
            `/admin/demandes-institutionnel-ecole?${new URLSearchParams({
              ...(typeFilter === 'all' ? {} : { type: typeFilter }),
              ...(v === 'all' ? {} : { status: v }),
            }).toString()}`
          }
        />
      </div>

      {error ? (
        <p className="text-md-magenta text-sm">Erreur lors du chargement : {error.message}</p>
      ) : null}

      {requests.length === 0 ? (
        <div className="border-md-border text-md-text-muted bg-muted/30 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Inbox className="size-8 opacity-60" aria-hidden />
          <p className="text-sm">Aucune demande pour ces filtres.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  activeValue,
  buildHref,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  activeValue: string;
  buildHref: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-md-text-muted text-[10px] font-bold tracking-wide uppercase">
        {label}
      </span>
      {options.map((opt) => (
        <Link
          key={opt.value}
          href={buildHref(opt.value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold transition',
            opt.value === activeValue
              ? 'bg-md-magenta text-white'
              : 'border-md-border text-md-text hover:bg-muted border bg-white',
          )}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}

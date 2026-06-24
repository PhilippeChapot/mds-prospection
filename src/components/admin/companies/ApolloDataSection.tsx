'use client';

/**
 * P5.x.ApolloEnrichFixes — carte "Données Apollo" sur la fiche société.
 * Affiche le payload Apollo persisté (apollo_raw_data) + le raisonnement de la
 * classification IA. Bouton "Rafraîchir" (super_admin) → refreshApolloDataAction.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatDateTimeShortFr } from '@/lib/format/dates';
import { refreshApolloDataAction } from '@/lib/admin/smart-add/apollo-actions';

type ApolloRaw = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="space-y-0.5">
      <p className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">{label}</p>
      <p className="text-sm break-words text-slate-800">{value}</p>
    </div>
  );
}

function LinkField({ label, value }: { label: string; value: unknown }) {
  const url = str(value);
  if (!url) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">{label}</p>
      <a
        href={url.startsWith('http') ? url : `https://${url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-md-blue text-sm break-all hover:underline"
      >
        {url}
      </a>
    </div>
  );
}

export function ApolloDataSection({
  apolloData,
  apolloEnrichedAt,
  poleConfidence,
  poleReasoning,
  companyId,
  isSuperAdmin = false,
}: {
  apolloData: ApolloRaw | null;
  apolloEnrichedAt: string | null;
  poleConfidence: number | null;
  poleReasoning: string | null;
  companyId: string;
  isSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!apolloData) return null;

  const keywords = Array.isArray(apolloData.keywords) ? (apolloData.keywords as string[]) : [];
  const technologies = Array.isArray(apolloData.technologies)
    ? (apolloData.technologies as Array<{ name?: string; uid?: string }>)
    : [];

  function refresh() {
    start(async () => {
      const r = await refreshApolloDataAction(companyId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.pole_code
          ? `Apollo rafraîchi · pôle ${r.pole_code} (${Math.round((r.confidence ?? 0) * 100)}%)`
          : 'Apollo rafraîchi.',
      );
      router.refresh();
    });
  }

  return (
    <section className="bg-card border-md-border space-y-4 rounded-xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          🚀 Données Apollo
          {apolloEnrichedAt && (
            <span className="text-md-text-muted ml-2 text-[11px] font-normal normal-case">
              Enrichi le {formatDateTimeShortFr(apolloEnrichedAt)}
            </span>
          )}
        </h2>
        {isSuperAdmin && (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={refresh}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Rafraîchir
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Field label="Effectif estimé" value={num(apolloData.estimated_num_employees)} />
        <Field label="Année fondation" value={num(apolloData.founded_year)} />
        <Field label="Industrie" value={str(apolloData.industry)} />
        <Field label="Pays" value={str(apolloData.country)} />
        <Field label="Ville" value={str(apolloData.city)} />
        <Field label="Code postal" value={str(apolloData.postal_code)} />
        <LinkField label="Site web" value={apolloData.website_url} />
        <LinkField label="LinkedIn" value={apolloData.linkedin_url} />
        <LinkField label="Twitter" value={apolloData.twitter_url} />
        <LinkField label="Facebook" value={apolloData.facebook_url} />
      </div>

      {str(apolloData.short_description) && (
        <div className="space-y-0.5">
          <p className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">
            Description Apollo
          </p>
          <p className="text-sm text-slate-700">{str(apolloData.short_description)}</p>
        </div>
      )}

      {keywords.length > 0 && (
        <div className="space-y-1">
          <p className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">
            Mots-clés
          </p>
          <div className="flex flex-wrap gap-1">
            {keywords.slice(0, 30).map((k) => (
              <span
                key={k}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {technologies.length > 0 && (
        <div className="space-y-1">
          <p className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">
            Technologies détectées
          </p>
          <div className="flex flex-wrap gap-1">
            {technologies.slice(0, 40).map((t, i) => (
              <span
                key={t.uid ?? t.name ?? i}
                className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600"
              >
                {t.name ?? '—'}
              </span>
            ))}
          </div>
        </div>
      )}

      {poleReasoning && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs text-blue-700">
            <strong>🤖 Classification IA</strong> (confiance :{' '}
            {Math.round((poleConfidence ?? 0) * 100)}%)
          </p>
          <p className="mt-0.5 text-sm text-blue-900">{poleReasoning}</p>
        </div>
      )}
    </section>
  );
}

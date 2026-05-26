'use client';

/**
 * P5.x.Apollo — Section "Enrichir avec Apollo" en amont du QuickAddWizard.
 *
 * Affichée uniquement si `apolloEnabled` côté server (cf. page.tsx).
 *
 * Flow :
 *   1. Admin tape un domaine -> bouton "Enrichir"
 *   2. enrichApolloAction renvoie mapping + existing (si dédup)
 *   3. Card preview : nom, employés, revenue, parent, adresse, description
 *   4. Formulaire optionnel contact (email/prénom/nom/role)
 *   5. Choix pôle MDS + catégorie tarifaire
 *   6. Bouton "Créer le prospect" -> createProspectFromApolloAction -> redirect /admin/prospects/{id}
 *
 * Compteur crédits Apollo affiché en badge (fetch au mount + après chaque enrich).
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ExternalLink, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  enrichApolloAction,
  getApolloCreditUsageAction,
  createProspectFromApolloAction,
} from '@/lib/admin/smart-add/apollo-actions';
// P5.x.Apollo fix : types importés depuis apollo-mapping (pas apollo-actions
// qui est 'use server' et ne doit ré-exporter QUE des async functions).
import type { EnrichApolloResult } from '@/lib/admin/smart-add/apollo-mapping';

const POLE_OPTIONS = [
  'AUDIO_RADIO',
  'VIDEO_CTV',
  'REGIES_RETAIL_MEDIA',
  'DIFFUSION_INFRA',
  'DATA_ADTECH',
  'OUTDOOR_DOOH',
  'INCONNU',
] as const;

type Pole = (typeof POLE_OPTIONS)[number];
type Category = 'standard' | 'prs_exhibitor' | 'non_eligible';

export function ApolloEnrichSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Extract<EnrichApolloResult, { ok: true }> | null>(null);
  const [enrichPending, startEnrich] = useTransition();
  const [createPending, startCreate] = useTransition();
  const [credits, setCredits] = useState<{
    used: number;
    granted: number;
    remaining: number;
  } | null>(null);

  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [pole, setPole] = useState<Pole>('INCONNU');
  const [category, setCategory] = useState<Category>('standard');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await getApolloCreditUsageAction();
      if (cancelled) return;
      if (r.ok && r.usage) {
        setCredits({ used: r.usage.used, granted: r.usage.granted, remaining: r.usage.remaining });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function reset() {
    setQuery('');
    setResult(null);
    setContactFirstName('');
    setContactLastName('');
    setContactEmail('');
    setContactRole('');
    setPole('INCONNU');
    setCategory('standard');
  }

  function handleEnrich() {
    if (!query.trim()) {
      toast.error('Saisis un domaine (ex. tf1pub.fr).');
      return;
    }
    startEnrich(async () => {
      const r = await enrichApolloAction({ query: query.trim() });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult(r);
      // Pré-remplir le pôle "INCONNU" mais l'admin peut ajuster.
      // Pré-remplir le mapping company name uniquement (visuel).
      toast.success(`Apollo : ${r.apolloOrg.name ?? query} trouvé.`);
      // Refresh credits (1 crédit dépensé si hit).
      void (async () => {
        const c = await getApolloCreditUsageAction();
        if (c.ok && c.usage) {
          setCredits({
            used: c.usage.used,
            granted: c.usage.granted,
            remaining: c.usage.remaining,
          });
        }
      })();
    });
  }

  function handleCreate() {
    if (!result) return;
    startCreate(async () => {
      const r = await createProspectFromApolloAction({
        mapped: result.mapped,
        existing_company_id: result.existing?.id ?? null,
        contact:
          contactEmail.trim().length > 0
            ? {
                first_name: contactFirstName.trim() || undefined,
                last_name: contactLastName.trim() || undefined,
                email: contactEmail.trim(),
                role: contactRole.trim() || undefined,
              }
            : undefined,
        pole_code: pole,
        category,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Prospect créé via Apollo. Redirection…');
      router.push(`/admin/prospects/${r.prospect_id}`);
    });
  }

  return (
    <section
      className="border-md-magenta/30 bg-md-magenta/5 space-y-3 rounded-xl border p-5 shadow-sm"
      data-testid="apollo-section"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-md-blue-dark flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
            <Search className="size-4" aria-hidden /> 0. Enrichir avec Apollo
          </h2>
          <p className="text-md-text-muted text-xs">
            Coût : <strong>1 crédit Apollo</strong> par société trouvée. Pré-remplit le prospect
            sans avoir à coller un texte.
          </p>
        </div>
        <CreditsBadge credits={credits} />
      </div>

      {!result ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <Label htmlFor="apollo-query" className="text-xs">
              Domaine
            </Label>
            <Input
              id="apollo-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ex: tf1pub.fr, dailymotion.com…"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleEnrich();
                }
              }}
            />
            <p className="text-md-text-muted mt-1 text-[10px]">
              V1 Free tier : recherche par <strong>domaine uniquement</strong>. La recherche par nom
              nécessite un upgrade Apollo Basic.
            </p>
          </div>
          <Button onClick={handleEnrich} disabled={enrichPending || !query.trim()}>
            {enrichPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            Enrichir
          </Button>
        </div>
      ) : (
        <EnrichedPreview
          result={result}
          contactFirstName={contactFirstName}
          contactLastName={contactLastName}
          contactEmail={contactEmail}
          contactRole={contactRole}
          setContactFirstName={setContactFirstName}
          setContactLastName={setContactLastName}
          setContactEmail={setContactEmail}
          setContactRole={setContactRole}
          pole={pole}
          setPole={setPole}
          category={category}
          setCategory={setCategory}
          onCancel={reset}
          onCreate={handleCreate}
          createPending={createPending}
        />
      )}
    </section>
  );
}

function CreditsBadge({
  credits,
}: {
  credits: { used: number; granted: number; remaining: number } | null;
}) {
  if (!credits) return null;
  const color =
    credits.remaining > 20
      ? 'bg-emerald-100 text-emerald-800'
      : credits.remaining > 10
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800';
  return (
    <span
      className={cn('rounded-full px-3 py-1 text-[11px] font-semibold tabular-nums', color)}
      title={`${credits.remaining} crédits restants sur ${credits.granted}`}
    >
      🪙 Apollo : {credits.remaining}/{credits.granted}
    </span>
  );
}

function EnrichedPreview({
  result,
  contactFirstName,
  contactLastName,
  contactEmail,
  contactRole,
  setContactFirstName,
  setContactLastName,
  setContactEmail,
  setContactRole,
  pole,
  setPole,
  category,
  setCategory,
  onCancel,
  onCreate,
  createPending,
}: {
  result: Extract<EnrichApolloResult, { ok: true }>;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactRole: string;
  setContactFirstName: (v: string) => void;
  setContactLastName: (v: string) => void;
  setContactEmail: (v: string) => void;
  setContactRole: (v: string) => void;
  pole: Pole;
  setPole: (v: Pole) => void;
  category: Category;
  setCategory: (v: Category) => void;
  onCancel: () => void;
  onCreate: () => void;
  createPending: boolean;
}) {
  const m = result.mapped;
  const ex = result.existing;
  return (
    <div className="space-y-4">
      {ex ? (
        <div className="border-md-warning/40 bg-md-warning/10 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <AlertTriangle className="text-md-warning size-4 shrink-0" aria-hidden />
          <div>
            <p className="text-md-text font-semibold">
              Société déjà en base : {ex.name}{' '}
              <span className="text-md-text-muted font-mono">({ex.id.slice(0, 8)}…)</span>
            </p>
            <p className="text-md-text-muted">
              Le bouton « Créer » mettra à jour cette ligne avec les données Apollo (apollo_*,
              employee_count, revenue, parent_company). Aucune duplication ne sera créée.
            </p>
          </div>
        </div>
      ) : (
        <div className="border-md-success/30 bg-md-success/5 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <Sparkles className="text-md-success size-4 shrink-0" aria-hidden />
          <p className="text-md-text font-semibold">
            Nouvelle société — une ligne sera créée dans <code>companies</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label="Nom">{m.name}</Field>
        <Field label="Domaine">{m.primary_domain ?? '—'}</Field>
        <Field label="Industrie">{m.industry ?? '—'}</Field>
        <Field label="Employés">{m.employee_count ?? '—'}</Field>
        <Field label="Revenue">
          {m.estimated_revenue_eur
            ? new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              }).format(m.estimated_revenue_eur)
            : '—'}
        </Field>
        <Field label="Maison mère">{m.parent_company ?? '—'}</Field>
        <Field label="Année fondation">{m.founded_year ?? '—'}</Field>
        <Field label="Adresse" wide>
          {m.raw_address ??
            (`${m.city ?? ''} ${m.postal_code ?? ''} ${m.country ?? ''}`.trim() || '—')}
        </Field>
        {m.linkedin_url && (
          <Field label="LinkedIn" wide>
            <a
              href={m.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-md-blue inline-flex items-center gap-1 hover:underline"
            >
              {m.linkedin_url} <ExternalLink className="size-3" aria-hidden />
            </a>
          </Field>
        )}
        {m.description && (
          <Field label="Description" wide>
            <span className="text-md-text-muted line-clamp-3">{m.description}</span>
          </Field>
        )}
      </div>

      <hr className="border-md-border" />

      <div className="space-y-2">
        <h3 className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          Contact (optionnel)
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input
            placeholder="Prénom"
            value={contactFirstName}
            onChange={(e) => setContactFirstName(e.target.value)}
          />
          <Input
            placeholder="Nom"
            value={contactLastName}
            onChange={(e) => setContactLastName(e.target.value)}
          />
          <Input
            type="email"
            placeholder="email@…"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
          <Input
            placeholder="Fonction"
            value={contactRole}
            onChange={(e) => setContactRole(e.target.value)}
          />
        </div>
        <p className="text-md-text-muted text-[10px]">
          Si tu remplis un email, un contact sera créé et lié au prospect comme primary_contact.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Pôle MDS</Label>
          <select
            value={pole}
            onChange={(e) => setPole(e.target.value as Pole)}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
          >
            {POLE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Catégorie tarifaire</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
          >
            <option value="standard">Standard</option>
            <option value="prs_exhibitor">PRS Exhibitor</option>
            <option value="non_eligible">Non éligible</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={createPending}>
          <RefreshCw className="size-3.5" aria-hidden /> Réinitialiser
        </Button>
        <Button onClick={onCreate} disabled={createPending}>
          {createPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {ex ? 'Mettre à jour + créer prospect' : 'Créer le prospect'}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">{label}</dt>
      <dd className="text-md-text mt-0.5">{children}</dd>
    </div>
  );
}

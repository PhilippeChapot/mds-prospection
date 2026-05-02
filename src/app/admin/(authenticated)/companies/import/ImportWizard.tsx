'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { POLE_CODES } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import {
  parseImportFileAction,
  checkDuplicateDomainsAction,
  confirmImportAction,
  type ExistingCompany,
  type ImportMapping,
  type ImportResult,
  type ImportRowAction,
} from './actions';
import type { ParsedFile } from '@/lib/import/parse-file';
import { toast } from 'sonner';

type Step = 'upload' | 'mapping' | 'dedup' | 'running' | 'result';

const FIELD_HINTS: Record<keyof ImportMapping, string[]> = {
  name: ['name', 'nom', 'company', 'company_name', 'societe', 'société', 'raison_sociale'],
  primary_domain: ['domain', 'domaine', 'primary_domain', 'website', 'site', 'url'],
  country: ['country', 'pays', 'nationality'],
  category: ['category', 'categorie', 'catégorie', 'type'],
  pole_code: ['pole', 'pôle', 'pole_code', 'sector', 'secteur'],
};

function autoDetect(headers: string[]): ImportMapping {
  const out: ImportMapping = { name: '' };
  for (const field of Object.keys(FIELD_HINTS) as (keyof ImportMapping)[]) {
    for (const h of headers) {
      const hl = h.toLowerCase().trim();
      if (FIELD_HINTS[field].some((hint) => hl === hint || hl.includes(hint))) {
        out[field] = h;
        break;
      }
    }
  }
  return out;
}

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({ name: '' });
  const [duplicates, setDuplicates] = useState<Record<string, ExistingCompany>>({});
  const [actions, setActions] = useState<ImportRowAction[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleUpload(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await parseImportFileAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setParsed(res.data);
      setMapping(autoDetect(res.data.headers));
      setStep('mapping');
    });
  }

  function handleMappingContinue() {
    if (!parsed || !mapping.name) {
      setError('Mappe au minimum la colonne "name".');
      return;
    }
    setError(null);
    startTransition(async () => {
      const domains: string[] = [];
      if (mapping.primary_domain) {
        for (const row of parsed.rows) {
          const d = row[mapping.primary_domain!]?.trim().toLowerCase();
          if (d) domains.push(d);
        }
      }
      const dups = domains.length > 0 ? await checkDuplicateDomainsAction(domains) : {};
      setDuplicates(dups);
      // Action par defaut : update si match domain, create sinon
      const defaultActions: ImportRowAction[] = parsed.rows.map((row) => {
        if (!mapping.primary_domain) return 'create';
        const d = row[mapping.primary_domain]?.trim().toLowerCase();
        return d && dups[d] ? 'update' : 'create';
      });
      setActions(defaultActions);
      setStep('dedup');
    });
  }

  function handleConfirm() {
    if (!parsed) return;
    setStep('running');
    setError(null);
    startTransition(async () => {
      try {
        const res = await confirmImportAction({
          fileName: parsed.fileName,
          rows: parsed.rows,
          mapping,
          actions,
        });
        setResult(res);
        setStep('result');
        toast.success(
          `Import termine : ${res.created} cree(s), ${res.updated} mise(s) a jour, ${res.skipped} ignore(s).`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'import.");
        setStep('dedup');
      }
    });
  }

  function reset() {
    setStep('upload');
    setParsed(null);
    setMapping({ name: '' });
    setDuplicates({});
    setActions([]);
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <Stepper current={step} />

      {error ? (
        <p
          role="alert"
          className="border-md-danger/40 bg-md-danger/15 text-md-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      {step === 'upload' && <UploadStep onSubmit={handleUpload} pending={pending} />}

      {step === 'mapping' && parsed && (
        <MappingStep
          parsed={parsed}
          mapping={mapping}
          onChange={setMapping}
          onBack={() => setStep('upload')}
          onContinue={handleMappingContinue}
          pending={pending}
        />
      )}

      {step === 'dedup' && parsed && (
        <DedupStep
          parsed={parsed}
          mapping={mapping}
          duplicates={duplicates}
          actions={actions}
          onChangeAction={(idx, a) => {
            const next = [...actions];
            next[idx] = a;
            setActions(next);
          }}
          onBack={() => setStep('mapping')}
          onConfirm={handleConfirm}
          pending={pending}
        />
      )}

      {step === 'running' && (
        <div className="bg-card border-md-border flex flex-col items-center gap-3 rounded-xl border p-12 text-center shadow-sm">
          <Loader2 className="text-md-blue size-8 animate-spin" aria-hidden />
          <p className="text-md-text font-semibold">Import en cours…</p>
          <p className="text-md-text-muted text-sm">
            Traitement de {parsed?.rows.length ?? 0} lignes par chunks de 50.
          </p>
        </div>
      )}

      {step === 'result' && result && (
        <ResultStep
          result={result}
          fileName={parsed?.fileName ?? ''}
          onReset={reset}
          onGoToList={() => router.push('/admin/companies')}
        />
      )}
    </div>
  );
}

/* ----------------------------- Stepper ----------------------------- */

function Stepper({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: '1. Fichier' },
    { key: 'mapping', label: '2. Mapping' },
    { key: 'dedup', label: '3. Dedup' },
    { key: 'result', label: '4. Resultat' },
  ];
  const currentIdx = steps.findIndex(
    (s) => s.key === current || (current === 'running' && s.key === 'result'),
  );
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-3 py-1 font-semibold',
              i < currentIdx
                ? 'bg-md-success/15 text-md-success'
                : i === currentIdx
                  ? 'bg-md-magenta/15 text-md-magenta'
                  : 'bg-muted text-md-text-muted',
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-md-text-muted">›</span>}
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------- Step 1 — Upload ----------------------------- */

function UploadStep({ onSubmit, pending }: { onSubmit: (fd: FormData) => void; pending: boolean }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="bg-card border-md-border space-y-4 rounded-xl border p-6 shadow-sm"
    >
      <div className="text-md-text-muted bg-muted/30 rounded-md p-3 text-xs">
        <strong className="text-md-text">Format attendu :</strong> CSV (UTF-8, en-tetes en premiere
        ligne) ou XLSX (1ere feuille). Max 5 Mo, 2000 lignes par import.
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="file-input">Fichier a importer</Label>
        <Input
          id="file-input"
          name="file"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Upload className="size-4" aria-hidden />
          {pending ? 'Analyse…' : 'Analyser le fichier'}
        </Button>
      </div>
    </form>
  );
}

/* ----------------------------- Step 2 — Mapping ----------------------------- */

function MappingStep({
  parsed,
  mapping,
  onChange,
  onBack,
  onContinue,
  pending,
}: {
  parsed: ParsedFile;
  mapping: ImportMapping;
  onChange: (m: ImportMapping) => void;
  onBack: () => void;
  onContinue: () => void;
  pending: boolean;
}) {
  const previewRows = parsed.rows.slice(0, 5);
  const FIELDS: { key: keyof ImportMapping; label: string; required?: boolean; hint?: string }[] = [
    { key: 'name', label: 'Nom de la societe', required: true },
    { key: 'primary_domain', label: 'Domaine', hint: 'Sert au dedup automatique' },
    { key: 'country', label: 'Pays (ISO 2)' },
    { key: 'category', label: 'Categorie tarifaire' },
    { key: 'pole_code', label: 'Pole thematique' },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileSpreadsheet className="text-md-blue size-5" aria-hidden />
          <div>
            <p className="text-md-text font-semibold">{parsed.fileName}</p>
            <p className="text-md-text-muted text-xs">
              {parsed.rows.length} lignes · {parsed.headers.length} colonnes
            </p>
          </div>
        </div>

        <h3 className="text-md-blue-dark mb-3 text-sm font-bold tracking-wide uppercase">
          Mapper les colonnes
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label>
                {f.label}
                {f.required ? <span className="text-md-magenta ml-0.5">*</span> : null}
              </Label>
              <select
                value={mapping[f.key] ?? ''}
                onChange={(e) =>
                  onChange({
                    ...mapping,
                    [f.key]: e.target.value || undefined,
                  } as ImportMapping)
                }
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                <option value="">— ignore —</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              {f.hint && <p className="text-md-text-muted text-[11px]">{f.hint}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <h3 className="text-md-blue-dark border-md-border border-b px-5 py-3 text-sm font-bold tracking-wide uppercase">
          Apercu (5 premieres lignes)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-md-text-muted text-[10px] font-bold tracking-wider uppercase">
              <tr>
                {parsed.headers.map((h) => (
                  <th key={h} className="px-3 py-2 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-md-border border-t">
                  {parsed.headers.map((h) => (
                    <td key={h} className="text-md-text px-3 py-2 whitespace-nowrap">
                      {row[h] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          ← Retour
        </Button>
        <Button onClick={onContinue} disabled={pending || !mapping.name}>
          {pending ? 'Verification dedup…' : 'Continuer vers dedup'}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- Step 3 — Dedup ----------------------------- */

function DedupStep({
  parsed,
  mapping,
  duplicates,
  actions,
  onChangeAction,
  onBack,
  onConfirm,
  pending,
}: {
  parsed: ParsedFile;
  mapping: ImportMapping;
  duplicates: Record<string, ExistingCompany>;
  actions: ImportRowAction[];
  onChangeAction: (idx: number, a: ImportRowAction) => void;
  onBack: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const stats = useMemo(() => {
    const c = { create: 0, update: 0, skip: 0 };
    for (const a of actions) c[a] += 1;
    return c;
  }, [actions]);

  return (
    <div className="space-y-4">
      <div className="bg-card border-md-border flex flex-wrap items-center gap-4 rounded-xl border p-4 shadow-sm">
        <Stat label="A creer" count={stats.create} tone="success" />
        <Stat label="A mettre a jour" count={stats.update} tone="info" />
        <Stat label="A ignorer" count={stats.skip} tone="muted" />
        <span className="text-md-text-muted ml-auto text-xs">
          {Object.keys(duplicates).length} domaines deja en base
        </span>
      </div>

      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-md-text-muted sticky top-0 text-[10px] font-bold tracking-wider uppercase">
              <tr>
                <th className="px-3 py-2">Ligne</th>
                <th className="px-3 py-2">Nom</th>
                <th className="px-3 py-2">Domaine</th>
                <th className="px-3 py-2">Match existant</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {parsed.rows.map((row, i) => {
                const name = row[mapping.name] ?? '';
                const domain = mapping.primary_domain
                  ? (row[mapping.primary_domain] ?? '').trim().toLowerCase()
                  : '';
                const match = domain ? duplicates[domain] : undefined;
                return (
                  <tr key={i} className="border-md-border hover:bg-muted/30 border-t">
                    <td className="text-md-text-muted px-3 py-2 font-mono text-xs">{i + 1}</td>
                    <td className="text-md-text px-3 py-2 font-semibold">{name || '—'}</td>
                    <td className="text-md-text px-3 py-2 font-mono text-xs">{domain || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {match ? (
                        <span className="text-md-blue">{match.name}</span>
                      ) : (
                        <span className="text-md-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ActionRadioGroup
                        value={actions[i] ?? 'create'}
                        hasMatch={Boolean(match)}
                        onChange={(a) => onChangeAction(i, a)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          ← Retour
        </Button>
        <Button onClick={onConfirm} disabled={pending}>
          {pending ? 'Import en cours…' : `Confirmer (${stats.create + stats.update} ligne(s))`}
        </Button>
      </div>
    </div>
  );
}

function ActionRadioGroup({
  value,
  hasMatch,
  onChange,
}: {
  value: ImportRowAction;
  hasMatch: boolean;
  onChange: (a: ImportRowAction) => void;
}) {
  const options: { v: ImportRowAction; label: string; disabled?: boolean }[] = [
    { v: 'create', label: 'Creer' },
    { v: 'update', label: 'Mettre a jour', disabled: !hasMatch },
    { v: 'skip', label: 'Ignorer' },
  ];
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            'rounded-md border px-2 py-1 text-[11px] font-semibold transition',
            value === o.v
              ? 'border-md-magenta/40 bg-md-magenta/10 text-md-magenta'
              : 'border-md-border hover:bg-muted bg-white',
            o.disabled && 'cursor-not-allowed opacity-40',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'success' | 'info' | 'muted';
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-md px-2.5 py-1 font-[family-name:var(--font-montserrat)] text-base font-extrabold',
          tone === 'success' && 'bg-md-success/15 text-md-success',
          tone === 'info' && 'bg-md-blue/15 text-md-blue',
          tone === 'muted' && 'bg-muted text-md-text-muted',
        )}
      >
        {count}
      </span>
      <span className="text-md-text-muted text-xs">{label}</span>
    </div>
  );
}

/* ----------------------------- Step 4 — Result ----------------------------- */

function ResultStep({
  result,
  fileName,
  onReset,
  onGoToList,
}: {
  result: ImportResult;
  fileName: string;
  onReset: () => void;
  onGoToList: () => void;
}) {
  // POLE_CODES referenced ailleurs dans le wizard mais pas ici — touch pour lint
  void POLE_CODES;
  return (
    <div className="bg-card border-md-border space-y-4 rounded-xl border p-6 shadow-sm">
      <div>
        <span className="text-md-magenta text-xs font-bold tracking-[0.25em] uppercase">
          Import termine
        </span>
        <h2 className="text-md-blue-dark mt-1 font-[family-name:var(--font-montserrat)] text-xl font-extrabold">
          {fileName}
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Crees" count={result.created} tone="success" />
        <SummaryCard label="Mises a jour" count={result.updated} tone="info" />
        <SummaryCard label="Ignorees" count={result.skipped} tone="muted" />
      </div>

      {result.errors.length > 0 && (
        <details className="border-md-danger/40 bg-md-danger/5 rounded-md border p-3 text-sm">
          <summary className="text-md-danger cursor-pointer font-semibold">
            {result.errors.length} erreur(s)
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {result.errors.slice(0, 50).map((e, i) => (
              <li key={i} className="text-md-text">
                <span className="text-md-text-muted font-mono">L.{e.rowIndex + 1}</span>{' '}
                <strong>{e.companyName}</strong> — {e.message}
              </li>
            ))}
            {result.errors.length > 50 && (
              <li className="text-md-text-muted">…et {result.errors.length - 50} autre(s)</li>
            )}
          </ul>
        </details>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onReset}>
          Importer un autre fichier
        </Button>
        <Button onClick={onGoToList}>Retour aux societes</Button>
      </div>

      <div className="text-md-text-muted border-md-border border-t pt-3 text-xs">
        Toutes les operations sont tracees dans l&apos;audit log.{' '}
        <Link href="/admin/audit-log" className="text-md-blue underline">
          Voir l&apos;audit
        </Link>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'success' | 'info' | 'muted';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 text-center',
        tone === 'success' && 'border-md-success/40 bg-md-success/10',
        tone === 'info' && 'border-md-blue/40 bg-md-blue/10',
        tone === 'muted' && 'border-md-border bg-muted/30',
      )}
    >
      <div
        className={cn(
          'font-[family-name:var(--font-montserrat)] text-3xl font-extrabold',
          tone === 'success' && 'text-md-success',
          tone === 'info' && 'text-md-blue',
          tone === 'muted' && 'text-md-text-muted',
        )}
      >
        {count}
      </div>
      <div className="text-md-text-muted mt-1 text-[10px] font-bold tracking-widest uppercase">
        {label}
      </div>
    </div>
  );
}

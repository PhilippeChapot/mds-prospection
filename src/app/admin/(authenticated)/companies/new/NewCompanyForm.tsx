'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { POLE_CODES } from '@/lib/design-tokens';
import { useFieldErrors } from '@/components/admin/use-field-errors';
import { CompanyApolloEnrichSection } from '@/components/admin/companies/CompanyApolloEnrichSection';
import { createCompanyAction, type CreateCompanyState } from './actions';
import { detectConflicts, type CompanyPrefill, type ConflictField } from './apollo-prefill';

const initialState: CreateCompanyState = {};

export function NewCompanyForm({ apolloEnabled = false }: { apolloEnabled?: boolean }) {
  const [state, formAction] = useActionState(createCompanyAction, initialState);
  const { errors, clear } = useFieldErrors(state.fieldErrors);

  // P5.x — champs pré-remplissables par Apollo → contrôlés.
  const [name, setName] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [country, setCountry] = useState('FR');
  const [overrideModal, setOverrideModal] = useState<{
    conflicts: ConflictField[];
    match: CompanyPrefill;
  } | null>(null);

  function handleAnyChange(e: React.ChangeEvent<HTMLFormElement>) {
    const t = e.target as Partial<{ name: string }>;
    if (t.name) clear(t.name);
  }

  function applyPrefill(match: CompanyPrefill) {
    if (match.name) setName(match.name);
    if (match.primary_domain) setPrimaryDomain(match.primary_domain);
    if (match.country) setCountry(match.country);
    toast.success(`Société enrichie via Apollo : ${match.name ?? 'OK'}`);
  }

  function handleApolloEnrich(match: CompanyPrefill) {
    const conflicts = detectConflicts({ name, primary_domain: primaryDomain, country }, match);
    if (conflicts.length > 0) {
      setOverrideModal({ conflicts, match });
    } else {
      applyPrefill(match);
    }
  }

  return (
    <>
      {apolloEnabled && <CompanyApolloEnrichSection onEnrich={handleApolloEnrich} />}

      <form action={formAction} onChange={handleAnyChange} className="space-y-6">
        <Section title="Identite">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Nom" required error={errors.name}>
              <Input
                name="name"
                required
                placeholder="NRJ Group"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Domaine principal" error={errors.primary_domain}>
              <Input
                name="primary_domain"
                placeholder="nrj.fr"
                value={primaryDomain}
                onChange={(e) => setPrimaryDomain(e.target.value)}
              />
            </Field>
            <Field label="Pays (ISO 2)" required error={errors.country}>
              <Input
                name="country"
                placeholder="FR"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </Section>

        <Section title="Classification">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Categorie" required error={errors.category}>
              <select
                name="category"
                required
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Choisir…
                </option>
                <option value="prs_exhibitor">PRS partenaire</option>
                <option value="standard">Standard</option>
                <option value="non_eligible">Non eligible</option>
              </select>
            </Field>
            <Field label="Pole" required error={errors.pole_code}>
              <select
                name="pole_code"
                required
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Choisir…
                </option>
                {POLE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Partenaire PRS 2026 ?">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="was_prs_2026_exhibitor" value="on" />
                <span>Oui — figurer dans la liste de reference PRS 2026</span>
              </label>
            </Field>
          </div>
        </Section>

        <Section title="Notes">
          <Field label="Notes libres" error={errors.notes}>
            <Textarea name="notes" rows={3} placeholder="Contexte, contacts cles, opportunites…" />
          </Field>
        </Section>

        {state.error ? (
          <p
            role="alert"
            className="border-md-danger/40 bg-md-danger/15 text-md-danger rounded-md border px-3 py-2 text-sm"
          >
            {state.error}
            {state.duplicateCompanyId ? (
              <>
                {' '}
                <Link
                  className="font-bold underline"
                  href={`/admin/companies/${state.duplicateCompanyId}`}
                >
                  Voir la societe existante
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button asChild variant="ghost">
            <Link href="/admin/companies">Annuler</Link>
          </Button>
          <SubmitButton />
        </div>
      </form>

      {/* P5.x — confirmation avant d'écraser des champs déjà saisis. */}
      <Dialog open={!!overrideModal} onOpenChange={(o) => !o && setOverrideModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>⚠️ Remplacer les valeurs actuelles ?</DialogTitle>
            <DialogDescription>
              Apollo a trouvé : <strong>{overrideModal?.match.name ?? '—'}</strong>
            </DialogDescription>
          </DialogHeader>
          {overrideModal && (
            <ul className="space-y-1.5 text-sm">
              {overrideModal.conflicts.map((cf) => (
                <li key={cf.field}>
                  • <span className="font-medium">{cf.label}</span> :{' '}
                  <span className="text-md-text-muted line-through">{cf.from}</span> →{' '}
                  <span className="font-semibold">{cf.to}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOverrideModal(null)}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (overrideModal) applyPrefill(overrideModal.match);
                setOverrideModal(null);
              }}
            >
              Remplacer tout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Creation…' : 'Creer la societe'}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-md-magenta ml-0.5">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-md-danger text-xs">{error}</p> : null}
    </div>
  );
}

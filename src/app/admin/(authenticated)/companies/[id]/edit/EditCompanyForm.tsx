'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DomainTagsInput } from '@/components/ui/DomainTagsInput';
import { POLE_CODES } from '@/lib/design-tokens';
import { useFieldErrors } from '@/components/admin/use-field-errors';
import { updateCompanyAction, type UpdateCompanyState } from './actions';

const initialState: UpdateCompanyState = {};

export type EditableCompany = {
  id: string;
  name: string;
  primary_domain: string | null;
  alternate_domains: string[];
  country: string | null;
  category: 'prs_exhibitor' | 'standard' | 'non_eligible';
  pole_code: string;
  was_prs_2026_exhibitor: boolean;
};

export function EditCompanyForm({ company }: { company: EditableCompany }) {
  const [state, formAction] = useActionState(updateCompanyAction, initialState);
  const { errors, clear } = useFieldErrors(state.fieldErrors);
  const [primaryDomain, setPrimaryDomain] = useState<string>(company.primary_domain ?? '');
  const [alternateDomains, setAlternateDomains] = useState<string[]>(company.alternate_domains);

  function handleAnyChange(e: React.ChangeEvent<HTMLFormElement>) {
    const t = e.target as Partial<{ name: string }>;
    if (t.name) clear(t.name);
  }

  return (
    <form action={formAction} onChange={handleAnyChange} className="space-y-6">
      <input type="hidden" name="company_id" value={company.id} />

      <Section title="Identite">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nom" required error={errors.name}>
            <Input name="name" required defaultValue={company.name} />
          </Field>
          <Field label="Domaine principal" error={errors.primary_domain}>
            <Input
              name="primary_domain"
              value={primaryDomain}
              onChange={(e) => setPrimaryDomain(e.target.value)}
            />
          </Field>
          <Field label="Pays (ISO 2)" required error={errors.country}>
            <Input
              name="country"
              maxLength={2}
              defaultValue={company.country ?? 'FR'}
              placeholder="FR"
            />
          </Field>
          <Field label="Domaines alternatifs" error={errors.alternate_domains}>
            <DomainTagsInput
              name="alternate_domains"
              value={alternateDomains}
              onChange={setAlternateDomains}
              excludeDomains={primaryDomain ? [primaryDomain] : []}
              placeholder="Ex: francetelevisions.fr (Entrée pour valider)"
            />
            <p className="text-md-text-muted mt-1 text-xs">
              Domaines historiques, filiales ou alias officiels. Strip auto de <code>https://</code>{' '}
              et <code>www.</code>.
            </p>
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
              defaultValue={company.category}
            >
              <option value="prs_exhibitor">PRS exposant</option>
              <option value="standard">Standard</option>
              <option value="non_eligible">Non eligible</option>
            </select>
          </Field>
          <Field label="Pole" required error={errors.pole_code}>
            <select
              name="pole_code"
              required
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              defaultValue={company.pole_code}
            >
              {POLE_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Exposant PRS 2026 ?">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="was_prs_2026_exhibitor"
                value="on"
                defaultChecked={company.was_prs_2026_exhibitor}
              />
              <span>Oui — figurer dans la liste de reference PRS 2026</span>
            </label>
          </Field>
        </div>
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
          <Link href={`/admin/companies/${company.id}`}>Annuler</Link>
        </Button>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Sauvegarde…' : 'Sauvegarder'}
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

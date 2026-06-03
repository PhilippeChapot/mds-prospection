'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { POLE_CODES } from '@/lib/design-tokens';
import { useFieldErrors } from '@/components/admin/use-field-errors';
import { createCompanyAction, type CreateCompanyState } from './actions';

const initialState: CreateCompanyState = {};

export function NewCompanyForm() {
  const [state, formAction] = useActionState(createCompanyAction, initialState);
  const { errors, clear } = useFieldErrors(state.fieldErrors);

  function handleAnyChange(e: React.ChangeEvent<HTMLFormElement>) {
    const t = e.target as Partial<{ name: string }>;
    if (t.name) clear(t.name);
  }

  return (
    <form action={formAction} onChange={handleAnyChange} className="space-y-6">
      <Section title="Identite">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nom" required error={errors.name}>
            <Input name="name" required placeholder="NRJ Group" />
          </Field>
          <Field label="Domaine principal" error={errors.primary_domain}>
            <Input name="primary_domain" placeholder="nrj.fr" />
          </Field>
          <Field label="Pays (ISO 2)" required error={errors.country}>
            <Input name="country" placeholder="FR" maxLength={2} defaultValue="FR" />
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

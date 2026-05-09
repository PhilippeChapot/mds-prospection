'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFieldErrors } from '@/components/admin/use-field-errors';
import { updateProspectAction, type UpdateProspectState } from './actions';

type Owner = { id: string; label: string };

const initialState: UpdateProspectState = {};

export type EditableProspect = {
  id: string;
  pack_code: 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR';
  status:
    | 'lead'
    | 'contact'
    | 'devis_envoye'
    | 'acompte_paye'
    | 'paye_integral'
    | 'signe'
    | 'perdu';
  estimated_amount: number | null;
  owner_id: string | null;
  notes: string | null;
  company: { id: string; name: string };
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    role: string | null;
  } | null;
};

export function EditProspectForm({
  prospect,
  owners,
  currentUser,
}: {
  prospect: EditableProspect;
  owners: Owner[];
  currentUser: { id: string; full_name: string | null; email: string; role: 'admin' | 'sales' };
}) {
  const [state, formAction] = useActionState(updateProspectAction, initialState);
  const { errors, clear } = useFieldErrors(state.fieldErrors);

  function handleAnyChange(e: React.ChangeEvent<HTMLFormElement>) {
    const t = e.target as Partial<{ name: string }>;
    if (t.name) clear(t.name);
  }

  return (
    <form action={formAction} onChange={handleAnyChange} className="space-y-6">
      <input type="hidden" name="prospect_id" value={prospect.id} />

      <Section title="Societe">
        <p className="text-md-text-muted text-sm">
          La societe rattachee est <strong>{prospect.company.name}</strong>. Pour la changer,
          supprimez ce prospect et creez-en un nouveau.
        </p>
      </Section>

      {prospect.contact ? (
        <Section title="Contact principal">
          <input type="hidden" name="contact_id" value={prospect.contact.id} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Prenom">
              <Input name="contact_first_name" defaultValue={prospect.contact.first_name ?? ''} />
            </Field>
            <Field label="Nom">
              <Input name="contact_last_name" defaultValue={prospect.contact.last_name ?? ''} />
            </Field>
            <Field label="Email" required error={errors.contact_email}>
              <Input
                name="contact_email"
                type="email"
                defaultValue={prospect.contact.email}
                required
              />
            </Field>
            <Field label="Telephone">
              <Input name="contact_phone" type="tel" defaultValue={prospect.contact.phone ?? ''} />
            </Field>
            <Field label="Fonction / role">
              <Input name="contact_role" defaultValue={prospect.contact.role ?? ''} />
            </Field>
          </div>
        </Section>
      ) : null}

      <Section title="Prospect">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Pack">
            <select
              name="pack_code"
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              defaultValue={prospect.pack_code}
            >
              <option value="A_DEFINIR">A definir</option>
              <option value="ACCESS">ACCESS</option>
              <option value="CLASSIC">CLASSIC</option>
              <option value="PREMIUM">PREMIUM</option>
            </select>
          </Field>

          <Field label="Statut">
            <select
              name="status"
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              defaultValue={prospect.status}
            >
              <option value="lead">Lead</option>
              <option value="contact">En contact</option>
              <option value="devis_envoye">Devis envoye</option>
              <option value="acompte_paye">Acompte paye</option>
              <option value="paye_integral">Paye integral</option>
              <option value="signe">Signe</option>
              <option value="perdu">Perdu</option>
            </select>
          </Field>

          <Field label="Montant estime (€ HT)">
            <Input
              name="estimated_amount"
              defaultValue={prospect.estimated_amount?.toString() ?? ''}
              inputMode="decimal"
            />
          </Field>

          {currentUser.role === 'admin' ? (
            <Field label="Owner" required>
              <select
                name="owner_id"
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                defaultValue={prospect.owner_id ?? currentUser.id}
              >
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Owner">
              <input type="hidden" name="owner_id" value={currentUser.id} />
              <div className="border-md-border bg-muted/40 rounded-md border px-3 py-2 text-sm">
                {currentUser.full_name?.trim() || currentUser.email}{' '}
                <span className="text-md-text-muted text-xs">(toi · sales)</span>
              </div>
            </Field>
          )}
        </div>

        <Field label="Notes">
          <Textarea name="notes" rows={4} defaultValue={prospect.notes ?? ''} />
        </Field>
      </Section>

      {state.error ? (
        <p
          role="alert"
          className="border-md-danger/40 bg-md-danger/15 text-md-danger rounded-md border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button asChild variant="ghost">
          <Link href={`/admin/prospects/${prospect.id}`}>Annuler</Link>
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
      {pending ? 'Sauvegarde…' : 'Sauvegarder les modifications'}
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

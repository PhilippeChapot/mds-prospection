'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CompanyCombobox } from '@/components/admin/CompanyCombobox';
import { ContactCombobox, type ContactOption } from '@/components/admin/ContactCombobox';
import { useFieldErrors } from '@/components/admin/use-field-errors';
import { POLE_CODES } from '@/lib/design-tokens';
import { createProspectAction, type CreateProspectState } from './actions';

type Owner = { id: string; label: string };

const initialState: CreateProspectState = {};

export type PrefillContact = ContactOption;
export type PrefillCompany = { id: string; name: string; primary_domain: string | null };

export function NewProspectForm({
  owners,
  currentUser,
  prefillContact,
  prefillCompany,
  alreadyProspectIds,
}: {
  owners: Owner[];
  currentUser: { id: string; full_name: string | null; email: string; role: 'admin' | 'sales' };
  prefillContact: PrefillContact | null;
  prefillCompany: PrefillCompany | null;
  alreadyProspectIds: string[];
}) {
  const [state, formAction] = useActionState(createProspectAction, initialState);
  const { errors, clear } = useFieldErrors(state.fieldErrors);

  // Mode société : prefilled si on a un contact ou une company en query param.
  const initialCompanyId = prefillContact?.company_id ?? prefillCompany?.id ?? undefined;
  const initialCompanyName = prefillContact?.company_name ?? prefillCompany?.name ?? undefined;
  const [companyMode, setCompanyMode] = useState<'existing' | 'new'>('existing');
  const [companyId, setCompanyId] = useState<string | undefined>(initialCompanyId);

  // Mode contact : 'existing' si on a un prefill ; sinon 'new' (saisie manuelle).
  const [contactMode, setContactMode] = useState<'existing' | 'new'>(
    prefillContact ? 'existing' : 'new',
  );
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(
    prefillContact ?? null,
  );

  function handleAnyChange(e: React.ChangeEvent<HTMLFormElement>) {
    const t = e.target as Partial<{ name: string }>;
    if (t.name) clear(t.name);
  }

  return (
    <form action={formAction} onChange={handleAnyChange} className="space-y-6">
      {/* Edge case : contact deja prospect */}
      {prefillContact && alreadyProspectIds.length > 0 ? (
        <div className="border-md-warning/40 bg-md-warning/15 flex items-start gap-2 rounded-md border p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="text-md-text font-semibold">
              Ce contact est déjà lié à {alreadyProspectIds.length} prospect
              {alreadyProspectIds.length > 1 ? 's' : ''}.
            </p>
            <p className="text-md-text-muted text-xs">
              Tu peux quand même créer un nouveau prospect (cas multi-saison ou pack différent).
              Sinon :{' '}
              {alreadyProspectIds.slice(0, 3).map((id, idx) => (
                <span key={id}>
                  {idx > 0 ? ', ' : ''}
                  <Link
                    href={`/admin/prospects/${id}`}
                    className="text-md-blue font-medium hover:underline"
                  >
                    voir #{id.slice(0, 8)}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}

      {/* SECTION SOCIETE */}
      <Section title="Societe">
        <Field label="Societe" htmlFor="company-trigger" error={errors.company_id}>
          <CompanyCombobox
            initialId={initialCompanyId}
            initialName={initialCompanyName}
            onModeChange={setCompanyMode}
            onSelect={(c) => setCompanyId(c?.id)}
          />
        </Field>

        {companyMode === 'new' && (
          <div className="bg-muted/30 border-md-border space-y-3 rounded-md border border-dashed p-3">
            <p className="text-md-text-muted text-xs">
              Nouvelle societe : ces champs creeront une ligne dans <code>companies</code>.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Nom" required error={errors.company_name}>
                <Input name="company_name" placeholder="NRJ Group" />
              </Field>
              <Field label="Domaine principal" error={errors.company_primary_domain}>
                <Input name="company_primary_domain" placeholder="nrj.fr" />
              </Field>
              <Field label="Pays (ISO 2)" required error={errors.company_country}>
                <Input name="company_country" placeholder="FR" maxLength={2} defaultValue="FR" />
              </Field>
              <Field label="Categorie" required error={errors.company_category}>
                <select
                  name="company_category"
                  className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                  defaultValue="standard"
                >
                  <option value="standard">Standard</option>
                  <option value="prs_exhibitor">PRS exposant</option>
                  <option value="non_eligible">Non eligible</option>
                </select>
              </Field>
              <Field label="Pole" required error={errors.company_pole_code}>
                <select
                  name="company_pole_code"
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
            </div>
          </div>
        )}
      </Section>

      {/* SECTION CONTACT */}
      <Section title="Contact principal">
        <Field label="Sélectionner un contact existant" error={errors.contact_id}>
          <ContactCombobox
            initial={prefillContact ?? null}
            filterByCompanyId={companyMode === 'existing' ? companyId : null}
            onSelect={(c) => setSelectedContact(c)}
            onCreateNew={() => setSelectedContact(null)}
            onModeChange={setContactMode}
          />
        </Field>

        {contactMode === 'new' || !selectedContact ? (
          <div className="bg-muted/30 border-md-border space-y-3 rounded-md border border-dashed p-3">
            <p className="text-md-text-muted text-xs">
              Saisie manuelle : si l&apos;email correspond à un contact existant, il sera rattaché.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Prenom" error={errors.contact_first_name}>
                <Input name="contact_first_name" />
              </Field>
              <Field label="Nom" error={errors.contact_last_name}>
                <Input name="contact_last_name" />
              </Field>
              <Field label="Email" required error={errors.contact_email}>
                <Input name="contact_email" type="email" required />
              </Field>
              <Field label="Telephone" error={errors.contact_phone}>
                <Input name="contact_phone" type="tel" />
              </Field>
              <Field label="Fonction / role" error={errors.contact_role}>
                <Input name="contact_role" placeholder="Direction marketing" />
              </Field>
            </div>
          </div>
        ) : (
          // Mode existing : on injecte des hidden inputs pour le contact_email
          // (validation Zod requiert un email côté action). Les autres champs
          // sont juste descriptifs ici, le contact existant est utilisé tel
          // quel via contact_id.
          <div className="bg-md-blue/5 border-md-blue/30 space-y-1 rounded-md border p-3 text-sm">
            <p className="text-md-text font-semibold">
              {[selectedContact.first_name, selectedContact.last_name]
                .filter(Boolean)
                .join(' ')
                .trim() || selectedContact.email}
            </p>
            <p className="text-md-text-muted text-xs">
              <span className="font-mono">{selectedContact.email}</span>
              {selectedContact.role ? <> · {selectedContact.role}</> : null}
              {selectedContact.is_primary ? ' · ★ primary' : null}
            </p>
            <p className="text-md-text-muted text-[11px]">
              Société : {selectedContact.company_name}
            </p>
            {/* Hidden inputs pour passer email + nom au server action.
                Email obligatoire (validation Zod). */}
            <input type="hidden" name="contact_email" value={selectedContact.email} />
            <input
              type="hidden"
              name="contact_first_name"
              value={selectedContact.first_name ?? ''}
            />
            <input type="hidden" name="contact_last_name" value={selectedContact.last_name ?? ''} />
            <input type="hidden" name="contact_phone" value={selectedContact.phone ?? ''} />
            <input type="hidden" name="contact_role" value={selectedContact.role ?? ''} />
          </div>
        )}
      </Section>

      {/* SECTION PROSPECT */}
      <Section title="Prospect">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Pack" error={errors.pack_code}>
            <select
              name="pack_code"
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              defaultValue="A_DEFINIR"
            >
              <option value="A_DEFINIR">A definir</option>
              <option value="ACCESS">ACCESS</option>
              <option value="CLASSIC">CLASSIC</option>
              <option value="PREMIUM">PREMIUM</option>
            </select>
          </Field>

          <Field label="Statut initial" error={errors.status}>
            <select
              name="status"
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              defaultValue="lead"
            >
              <option value="lead">Lead</option>
              <option value="contact">En contact</option>
              <option value="devis_envoye">Devis envoye</option>
              <option value="acompte_paye">Acompte paye</option>
              <option value="signe">Signe</option>
              <option value="perdu">Perdu</option>
            </select>
          </Field>

          <Field label="Montant estime (€ HT)" error={errors.estimated_amount}>
            <Input name="estimated_amount" placeholder="5 975" inputMode="decimal" />
          </Field>

          {currentUser.role === 'admin' ? (
            <Field label="Owner" required error={errors.owner_id}>
              <select
                name="owner_id"
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                defaultValue={currentUser.id}
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

        <Field label="Notes" error={errors.notes}>
          <Textarea name="notes" rows={3} placeholder="Contexte, prochaine action…" />
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
          <Link href="/admin/prospects">Annuler</Link>
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
      {pending ? 'Creation…' : 'Creer le prospect'}
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
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-md-magenta ml-0.5">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-md-danger text-xs">{error}</p> : null}
    </div>
  );
}

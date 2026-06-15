'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ContactCombobox, type ContactOption } from '@/components/admin/ContactCombobox';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { POLE_CODES } from '@/lib/design-tokens';
import {
  VISITOR_TYPES,
  VISITOR_TYPE_LABEL,
  VISITOR_STATUSES,
  VISITOR_STATUS_LABEL,
  VISITOR_LANGUAGES,
  VISITOR_LANGUAGE_LABEL,
} from '@/lib/visitors/constants';
import { createVisitorAction, type CreateVisitorInput } from '@/lib/admin/visitors/create-actions';

type Owner = { id: string; label: string };

export function NewVisitorForm({
  owners,
  currentUser,
}: {
  owners: Owner[];
  currentUser: {
    id: string;
    full_name: string | null;
    email: string;
    role: 'admin' | 'sales' | 'super_admin';
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [contactMode, setContactMode] = useState<'existing' | 'new'>('existing');
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);

  // New-contact fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Visitor fields
  const [pole, setPole] = useState('');
  const [visitorType, setVisitorType] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [status, setStatus] = useState('lead');
  const [language, setLanguage] = useState('fr');
  const [ownerId, setOwnerId] = useState(currentUser.id);
  const [notes, setNotes] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const base = {
      pole: pole ? (pole as CreateVisitorInput['pole']) : null,
      visitor_type: visitorType ? (visitorType as CreateVisitorInput['visitor_type']) : null,
      is_vip: isVip,
      status: status as CreateVisitorInput['status'],
      language: language as CreateVisitorInput['language'],
      owner_user_id: hasAdminAccess(currentUser.role) ? ownerId : currentUser.id,
      notes: notes.trim() || undefined,
    };

    let input: CreateVisitorInput;
    if (contactMode === 'existing' && selectedContact) {
      input = { ...base, contact_id: selectedContact.id };
    } else {
      if (!email.trim() || !firstName.trim() || !lastName.trim()) {
        setError('Prénom, nom et email sont requis pour un nouveau contact.');
        return;
      }
      input = {
        ...base,
        new_contact: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone_mobile: phone.trim() || undefined,
          role: contactRole.trim() || undefined,
          new_company_name: companyName.trim() || undefined,
        },
      };
    }

    startTransition(async () => {
      try {
        const res = await createVisitorAction(input);
        toast.success('Visiteur créé.');
        router.push(`/admin/visitors/${res.visitor_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur création visiteur.');
      }
    });
  }

  const usingExisting = contactMode === 'existing' && selectedContact;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* SECTION CONTACT */}
      <Section title="Contact">
        <Field label="Sélectionner un contact existant">
          <ContactCombobox
            onSelect={(c) => setSelectedContact(c)}
            onCreateNew={() => {
              setSelectedContact(null);
              setContactMode('new');
            }}
            onModeChange={setContactMode}
            emitHiddenInputs={false}
          />
        </Field>

        {!usingExisting ? (
          <div className="bg-muted/30 border-md-border space-y-3 rounded-md border border-dashed p-3">
            <p className="text-md-text-muted text-xs">
              Nouveau contact : si l&apos;email existe déjà, le contact sera réutilisé.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Prénom" required>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Nom" required>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Téléphone mobile">
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Fonction / rôle">
                <Input
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  placeholder="Direction marketing"
                />
              </Field>
              <Field label="Société (créée si inexistante)">
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="NRJ Group"
                />
              </Field>
            </div>
          </div>
        ) : (
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
            </p>
            <p className="text-md-text-muted text-[11px]">
              Société : {selectedContact.company_name}
            </p>
          </div>
        )}
      </Section>

      {/* SECTION VISITEUR */}
      <Section title="Visiteur">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Pôle">
            <select
              value={pole}
              onChange={(e) => setPole(e.target.value)}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              <option value="">—</option>
              {POLE_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Type">
            <select
              value={visitorType}
              onChange={(e) => setVisitorType(e.target.value)}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              <option value="">—</option>
              {VISITOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VISITOR_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Statut initial">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              {VISITOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VISITOR_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Langue">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              {VISITOR_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {VISITOR_LANGUAGE_LABEL[l]}
                </option>
              ))}
            </select>
          </Field>

          {hasAdminAccess(currentUser.role) ? (
            <Field label="Owner">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
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
              <div className="border-md-border bg-muted/40 rounded-md border px-3 py-2 text-sm">
                {currentUser.full_name?.trim() || currentUser.email}{' '}
                <span className="text-md-text-muted text-xs">(toi · sales)</span>
              </div>
            </Field>
          )}

          <Field label="VIP">
            <label className="border-md-border inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm">
              <input
                type="checkbox"
                checked={isVip}
                onChange={(e) => setIsVip(e.target.checked)}
                className="size-4"
              />
              Marquer comme VIP 🌟
            </label>
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Contexte, prochaine action…"
          />
        </Field>
      </Section>

      {error ? (
        <p
          role="alert"
          className="border-md-danger/40 bg-md-danger/15 text-md-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button asChild variant="ghost" type="button">
          <Link href="/admin/visitors">Annuler</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Création…' : 'Créer le visiteur'}
        </Button>
      </div>
    </form>
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-md-magenta ml-0.5">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

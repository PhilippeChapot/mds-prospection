'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Plus,
  Star,
  Mail,
  Pencil,
  Trash2,
  ArrowRight,
  Settings2,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addContactAction,
  updateContactAction,
  markAsPrimaryAction,
  toggleLifecycleAction,
  deleteContactAction,
} from '@/lib/contacts/admin-actions';
import type { CompanyContactRow } from '@/lib/contacts/admin-queries';
import { listContactPreferencesByCompanyAction } from '@/lib/admin/contact-preferences/actions';
import type { ContactPreferencesRow } from '@/lib/admin/contact-preferences/types';
import { ContactPreferencesDrawer } from './ContactPreferencesDrawer';
import { contactConversionLink } from './contact-conversion';

interface Props {
  companyId: string;
  contacts: CompanyContactRow[];
  canDelete: boolean;
}

export function CompanyContactsSection({ companyId, contacts, canDelete }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CompanyContactRow | null>(null);
  // P8.1 — drawer Préférences pour 1 contact a la fois.
  const [prefsContact, setPrefsContact] = useState<CompanyContactRow | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsRow, setPrefsRow] = useState<ContactPreferencesRow | null>(null);

  function refresh() {
    router.refresh();
  }

  async function openPrefsDrawer(c: CompanyContactRow) {
    setPrefsContact(c);
    setPrefsLoading(true);
    setPrefsRow(null);
    try {
      const list = await listContactPreferencesByCompanyAction({ company_id: companyId });
      const me = list.find((x) => x.contact_id === c.id);
      setPrefsRow(me?.preferences ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chargement des préférences impossible.');
    } finally {
      setPrefsLoading(false);
    }
  }

  function handleMarkPrimary(contactId: string) {
    start(async () => {
      const result = await markAsPrimaryAction({ contact_id: contactId });
      if (result.ok) {
        toast.success('Contact marqué primary');
        refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleToggleLifecycle(contactId: string, enabled: boolean) {
    start(async () => {
      const result = await toggleLifecycleAction({ contact_id: contactId, enabled });
      if (result.ok) {
        toast.success(enabled ? 'Lifecycle activé' : 'Lifecycle désactivé');
        refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete(contactId: string, email: string) {
    if (!confirm(`Supprimer le contact ${email} ?`)) return;
    start(async () => {
      const result = await deleteContactAction({ contact_id: contactId });
      if (result.ok) {
        toast.success('Contact supprimé');
        refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <div className="border-md-border bg-muted/30 rounded-md border p-4 text-sm">
          <p className="text-md-text-muted">Aucun contact pour cette société.</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-md-blue mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            <Plus className="size-3" aria-hidden />
            Ajouter un contact
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-md-text-muted text-[10px] font-semibold tracking-wider uppercase">
                <tr>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Rôle</th>
                  <th className="px-3 py-2">Lang</th>
                  <th className="px-3 py-2">Primary</th>
                  <th className="px-3 py-2">Lifecycle</th>
                  <th className="px-3 py-2">Brevo</th>
                  <th className="px-3 py-2">Préférences</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    id={`contact-${c.id}`}
                    className="border-md-border hover:bg-muted/30 scroll-mt-20 border-t"
                  >
                    <td className="text-md-text px-3 py-2 font-medium">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ') || (
                        <span className="text-md-text-muted italic">(générique)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`mailto:${c.email}`}
                        className="text-md-blue inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        <Mail className="size-3" aria-hidden />
                        {c.email}
                      </a>
                    </td>
                    <td className="text-md-text-muted px-3 py-2 text-xs">
                      {c.role ?? <span className="text-md-text-muted">—</span>}
                    </td>
                    <td className="text-md-text px-3 py-2 font-mono text-xs">{c.language}</td>
                    <td className="px-3 py-2">
                      {c.is_primary ? (
                        <span className="bg-md-blue/10 text-md-blue inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                          <Star className="size-2.5" aria-hidden /> Primary
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMarkPrimary(c.id)}
                          disabled={pending}
                          className="text-md-blue text-[10px] font-semibold hover:underline disabled:opacity-50"
                        >
                          Marquer primary
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleToggleLifecycle(c.id, !c.lifecycle_emails_enabled)}
                        disabled={pending}
                        className={`text-[10px] font-semibold ${c.lifecycle_emails_enabled ? 'text-emerald-600' : 'text-amber-600'} hover:underline disabled:opacity-50`}
                      >
                        {c.lifecycle_emails_enabled ? '✓ on' : '✗ off'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.brevo_contact_id ? (
                        <span className="text-emerald-600">✓ sync</span>
                      ) : (
                        <span className="text-amber-600">— not sync</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => openPrefsDrawer(c)}
                        disabled={pending}
                        className="text-md-blue hover:text-md-blue-dark inline-flex items-center gap-1 font-semibold hover:underline disabled:opacity-50"
                        title="Gérer les 7 préférences de communication"
                      >
                        <Settings2 className="size-3" aria-hidden />
                        Gérer ({c.prefs_active_count}/7)
                        {c.prefs_locked_count > 0 ? (
                          <span
                            title={`${c.prefs_locked_count} verrouillage(s) admin`}
                            className="text-md-warning"
                          >
                            <Lock className="size-3" aria-hidden />
                          </span>
                        ) : null}
                        {c.prefs_unsubscribed ? (
                          <span title="Désinscrit (RGPD)" className="text-md-danger">
                            <AlertTriangle className="size-3" aria-hidden />
                          </span>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {/* P5.x — déjà converti → badge vers la fiche prospect (évite le doublon). */}
                        {(() => {
                          const conv = contactConversionLink(c);
                          return conv.converted ? (
                            <Link
                              href={conv.href}
                              title="Voir le prospect"
                              className="text-md-text-muted hover:text-md-text inline-flex items-center gap-0.5 text-[10px] font-semibold"
                            >
                              {conv.label}
                            </Link>
                          ) : (
                            <Link
                              href={conv.href}
                              title="Convertir en prospect"
                              className="text-md-blue hover:text-md-blue-dark inline-flex items-center gap-0.5 text-[10px] font-semibold"
                            >
                              <ArrowRight className="size-3" aria-hidden />
                              {conv.label}
                            </Link>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          disabled={pending}
                          className="text-md-text-muted hover:text-md-text disabled:opacity-50"
                          aria-label="Modifier"
                          title="Modifier"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id, c.email)}
                            disabled={pending}
                            className="text-md-text-muted hover:text-red-600 disabled:opacity-50"
                            aria-label="Supprimer"
                            title="Supprimer"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-md-blue inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              <Plus className="size-3" aria-hidden />
              Ajouter un contact
            </button>
          ) : null}
        </>
      )}

      {showForm && !editing ? (
        <ContactForm
          companyId={companyId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
        />
      ) : null}

      {editing ? (
        <ContactForm
          companyId={companyId}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}

      {prefsContact ? (
        <ContactPreferencesDrawer
          open={Boolean(prefsContact)}
          onOpenChange={(o) => {
            if (!o) setPrefsContact(null);
          }}
          contactId={prefsContact.id}
          contactName={
            [prefsContact.first_name, prefsContact.last_name].filter(Boolean).join(' ') || ''
          }
          contactEmail={prefsContact.email}
          initialPreferences={prefsLoading ? null : prefsRow}
          onSaved={() => {
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ContactForm({
  companyId,
  editing,
  onClose,
  onSaved,
}: {
  companyId: string;
  editing?: CompanyContactRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const isEdit = Boolean(editing);

  return (
    <form
      className="border-md-border bg-muted/20 space-y-3 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const payload = {
          ...(isEdit ? { contact_id: editing!.id } : { company_id: companyId }),
          email: String(fd.get('email') ?? ''),
          first_name: String(fd.get('first_name') ?? '') || null,
          last_name: String(fd.get('last_name') ?? '') || null,
          phone: String(fd.get('phone') ?? '') || null,
          role: String(fd.get('role') ?? '') || null,
          language: (fd.get('language') === 'EN' ? 'EN' : 'FR') as 'FR' | 'EN',
          ...(isEdit
            ? {}
            : {
                is_primary: fd.get('is_primary') === 'on',
                marketing_consent: fd.get('marketing_consent') === 'on',
                lifecycle_emails_enabled: fd.get('lifecycle_emails_enabled') === 'on',
              }),
        };

        start(async () => {
          const action = isEdit ? updateContactAction : addContactAction;
          const result = await action(payload);
          if (result.ok) {
            toast.success(isEdit ? 'Contact mis à jour' : 'Contact ajouté');
            onSaved();
          } else {
            toast.error(result.error);
          }
        });
      }}
    >
      <h3 className="text-md-blue-dark text-xs font-bold tracking-wider uppercase">
        {isEdit ? 'Modifier le contact' : 'Nouveau contact'}
      </h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Email" required>
          <Input
            name="email"
            type="email"
            required
            defaultValue={editing?.email ?? ''}
            placeholder="prenom.nom@societe.com"
          />
        </Field>
        <Field label="Téléphone">
          <Input name="phone" defaultValue={editing?.phone ?? ''} placeholder="+33 1 23 45 67 89" />
        </Field>
        <Field label="Prénom">
          <Input name="first_name" defaultValue={editing?.first_name ?? ''} />
        </Field>
        <Field label="Nom">
          <Input name="last_name" defaultValue={editing?.last_name ?? ''} />
        </Field>
        <Field label="Rôle">
          <Input name="role" defaultValue={editing?.role ?? ''} placeholder="CEO, Marketing, ..." />
        </Field>
        <Field label="Langue">
          <select
            name="language"
            defaultValue={editing?.language ?? 'FR'}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
          >
            <option value="FR">FR</option>
            <option value="EN">EN</option>
          </select>
        </Field>
      </div>

      {!isEdit ? (
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="text-md-text inline-flex items-center gap-2">
            <input type="checkbox" name="is_primary" />
            Marquer comme primary
          </label>
          <label className="text-md-text inline-flex items-center gap-2">
            <input type="checkbox" name="marketing_consent" defaultChecked />
            Marketing opt-in
          </label>
          <label className="text-md-text inline-flex items-center gap-2">
            <input type="checkbox" name="lifecycle_emails_enabled" defaultChecked />
            Lifecycle emails
          </label>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {isEdit ? 'Enregistrer' : 'Ajouter'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Annuler
        </Button>
      </div>
    </form>
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
    <label className="block">
      <span className="text-md-text-muted mb-1 block text-[10px] font-semibold tracking-wider uppercase">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

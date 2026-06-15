'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { cn } from '@/lib/utils';
import type { PoleCode } from '@/lib/design-tokens';
import { POLE_CODES } from '@/lib/design-tokens';
import {
  VISITOR_TYPES,
  VISITOR_TYPE_LABEL,
  VISITOR_STATUSES,
  VISITOR_STATUS_LABEL,
  VISITOR_STATUS_CLASS,
  VISITOR_LANGUAGES,
  VISITOR_LANGUAGE_LABEL,
  VISITOR_SOURCE_LABEL,
  VISA_STATUS_LABEL,
  type VisitorStatus,
  type VisitorType,
  type VisitorLanguage,
  type VisitorSource,
  type VisaStatus,
} from '@/lib/visitors/constants';
import { updateVisitorAction, deleteVisitorAction } from '@/lib/admin/visitors/mutate-actions';
import { AudienceConverterMenu } from '@/components/admin/AudienceConverterMenu';

export type VisitorDetail = {
  id: string;
  pole: string | null;
  visitor_type: string | null;
  is_vip: boolean;
  source: string;
  status: string;
  language: string;
  notes: string | null;
  is_big_company: boolean;
  brevo_synced_at: string | null;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    phone_mobile: string | null;
    role: string | null;
  } | null;
  company: { id: string; name: string; website: string | null; city: string | null } | null;
  owner: { id: string; full_name: string | null; email: string } | null;
  invitation_data: {
    passport_number: string | null;
    passport_country: string | null;
    passport_expiry: string | null;
    arrival_date: string | null;
    departure_date: string | null;
    hotel_name: string | null;
    visa_status: string | null;
    approval_status: string | null;
    pdf_storage_path: string | null;
  } | null;
  visitor_account: {
    id: string;
    email: string;
    password_set_at: string | null;
    last_login_at: string | null;
  } | null;
};

export type VisitorTimelineEntry = {
  id: string;
  action: string;
  kind: string | null;
  created_at: string;
  actor_name: string;
};

type Owner = { id: string; label: string };

function fullName(c: VisitorDetail['contact']): string {
  if (!c) return '—';
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email;
}

function fmtDate(input: string | null): string {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return input.slice(0, 10);
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        VISITOR_STATUS_CLASS[status as VisitorStatus] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {VISITOR_STATUS_LABEL[status as VisitorStatus] ?? status}
    </span>
  );
}

export function VisitorDetailClient({
  visitor,
  timeline,
  owners,
  currentRole,
  alreadySpeaker,
}: {
  visitor: VisitorDetail;
  timeline: VisitorTimelineEntry[];
  owners: Owner[];
  currentRole: 'admin' | 'sales' | 'super_admin';
  alreadySpeaker?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  // Edit state
  const [pole, setPole] = useState(visitor.pole ?? '');
  const [visitorType, setVisitorType] = useState(visitor.visitor_type ?? '');
  const [isVip, setIsVip] = useState(visitor.is_vip);
  const [status, setStatus] = useState(visitor.status);
  const [language, setLanguage] = useState(visitor.language);
  const [ownerId, setOwnerId] = useState(visitor.owner?.id ?? '');
  const [notes, setNotes] = useState(visitor.notes ?? '');

  function handleSave() {
    startTransition(async () => {
      try {
        await updateVisitorAction(visitor.id, {
          pole: pole ? (pole as PoleCode) : null,
          visitor_type: visitorType ? (visitorType as VisitorType) : null,
          is_vip: isVip,
          status: status as VisitorStatus,
          language: language as VisitorLanguage,
          owner_user_id: ownerId || null,
          notes: notes.trim() || null,
        });
        toast.success('Visiteur mis à jour.');
        setEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur mise à jour');
      }
    });
  }

  function handleDelete() {
    if (!window.confirm('Supprimer ce visiteur ? Action définitive.')) return;
    startTransition(async () => {
      try {
        await deleteVisitorAction(visitor.id);
        toast.success('Visiteur supprimé.');
        router.push('/admin/visitors');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur suppression');
      }
    });
  }

  const name = fullName(visitor.contact);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
              {name}
            </h1>
            {visitor.is_vip ? <span title="VIP">🌟</span> : null}
            {visitor.is_big_company ? <span title="Grand compte">🐳</span> : null}
            <StatusBadge status={visitor.status} />
          </div>
          <p className="text-md-text-muted text-sm">
            {visitor.contact?.email}
            {visitor.company ? <> · {visitor.company.name}</> : null} ·{' '}
            {VISITOR_SOURCE_LABEL[visitor.source as VisitorSource] ?? visitor.source}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visitor.contact ? (
            <AudienceConverterMenu
              source="visitor"
              sourceId={visitor.id}
              alreadySpeaker={alreadySpeaker}
            />
          ) : null}
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil className="size-4" aria-hidden />
              Éditer
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={pending}>
            <Trash2 className="size-4" aria-hidden />
            Supprimer
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">📋 Infos générales</TabsTrigger>
          <TabsTrigger value="visa">🛂 Invitation visa</TabsTrigger>
          <TabsTrigger value="prefs">📧 Préférences</TabsTrigger>
          <TabsTrigger value="timeline">📜 Timeline</TabsTrigger>
        </TabsList>

        {/* ── INFOS GÉNÉRALES ── */}
        <TabsContent value="general" className="space-y-4">
          <Card title="Contact">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Nom">{name}</Row>
              <Row label="Email">{visitor.contact?.email ?? '—'}</Row>
              <Row label="Téléphone">
                {visitor.contact?.phone_mobile || visitor.contact?.phone || '—'}
              </Row>
              <Row label="Fonction">{visitor.contact?.role ?? '—'}</Row>
              <Row label="Société">
                {visitor.company ? (
                  <Link
                    href={`/admin/companies/${visitor.company.id}`}
                    className="text-md-blue hover:underline"
                  >
                    {visitor.company.name}
                  </Link>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Ville">{visitor.company?.city ?? '—'}</Row>
            </dl>
          </Card>

          <Card title="Visiteur">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EditField label="Pôle">
                    <select
                      value={pole}
                      onChange={(e) => setPole(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {POLE_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="Type">
                    <select
                      value={visitorType}
                      onChange={(e) => setVisitorType(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {VISITOR_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {VISITOR_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="Statut">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={selectCls}
                    >
                      {VISITOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {VISITOR_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="Langue">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className={selectCls}
                    >
                      {VISITOR_LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {VISITOR_LANGUAGE_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="Owner">
                    <select
                      value={ownerId}
                      onChange={(e) => setOwnerId(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="VIP">
                    <label className="border-md-border inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm">
                      <input
                        type="checkbox"
                        checked={isVip}
                        onChange={(e) => setIsVip(e.target.checked)}
                        className="size-4"
                      />
                      VIP 🌟
                    </label>
                  </EditField>
                </div>
                <EditField label="Notes">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </EditField>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={pending}
                  >
                    Annuler
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={pending}>
                    {pending ? 'Enregistrement…' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Pôle">
                  {visitor.pole ? <PoleBadge code={visitor.pole as PoleCode} /> : '—'}
                </Row>
                <Row label="Type">
                  {visitor.visitor_type
                    ? (VISITOR_TYPE_LABEL[visitor.visitor_type as VisitorType] ??
                      visitor.visitor_type)
                    : '—'}
                </Row>
                <Row label="Statut">
                  <StatusBadge status={visitor.status} />
                </Row>
                <Row label="VIP">{visitor.is_vip ? 'Oui 🌟' : 'Non'}</Row>
                <Row label="Langue">
                  {VISITOR_LANGUAGE_LABEL[visitor.language as VisitorLanguage] ?? visitor.language}
                </Row>
                <Row label="Owner">
                  {visitor.owner?.full_name?.trim() || visitor.owner?.email || '—'}
                </Row>
                <Row label="Source">
                  {VISITOR_SOURCE_LABEL[visitor.source as VisitorSource] ?? visitor.source}
                </Row>
                <Row label="Ajouté le">{fmtDate(visitor.created_at)}</Row>
                <Row label="Notes" full>
                  {visitor.notes || '—'}
                </Row>
              </dl>
            )}
          </Card>

          {/* Auth visiteur */}
          <Card title="🔐 Authentification visiteur">
            {visitor.visitor_account ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Email compte">{visitor.visitor_account.email}</Row>
                <Row label="Mot de passe">
                  {visitor.visitor_account.password_set_at ? '✓ défini' : '— non défini'}
                </Row>
                <Row label="Dernière connexion">
                  {fmtDate(visitor.visitor_account.last_login_at)}
                </Row>
              </dl>
            ) : (
              <p className="text-md-text-muted text-sm">
                Aucun compte visiteur. La création de compte + l&apos;espace visiteur public
                arrivent en P15.3.
              </p>
            )}
          </Card>
        </TabsContent>

        {/* ── INVITATION VISA ── */}
        <TabsContent value="visa">
          <Card title="🛂 Invitation visa">
            {visitor.invitation_data ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Passeport n°">{visitor.invitation_data.passport_number ?? '—'}</Row>
                <Row label="Pays passeport">{visitor.invitation_data.passport_country ?? '—'}</Row>
                <Row label="Expiration">{visitor.invitation_data.passport_expiry ?? '—'}</Row>
                <Row label="Arrivée">{visitor.invitation_data.arrival_date ?? '—'}</Row>
                <Row label="Départ">{visitor.invitation_data.departure_date ?? '—'}</Row>
                <Row label="Hôtel">{visitor.invitation_data.hotel_name ?? '—'}</Row>
                <Row label="Statut visa">
                  {visitor.invitation_data.visa_status
                    ? (VISA_STATUS_LABEL[visitor.invitation_data.visa_status as VisaStatus] ??
                      visitor.invitation_data.visa_status)
                    : '—'}
                </Row>
                <Row label="Lettre PDF">
                  {visitor.invitation_data.pdf_storage_path ? 'Générée' : '— pas encore'}
                </Row>
              </dl>
            ) : (
              <p className="text-md-text-muted text-sm">
                Aucune demande de lettre d&apos;invitation. Le visiteur pourra la faire depuis son
                espace (P15.3). La génération PDF + workflow d&apos;approbation arrivent en P15.4.
              </p>
            )}
          </Card>
        </TabsContent>

        {/* ── PRÉFÉRENCES ── */}
        <TabsContent value="prefs">
          <Card title="📧 Préférences contenu">
            <p className="text-md-text-muted text-sm">
              Les préférences de contenu (newsletter, sujets, opt-in Brevo) seront éditables depuis
              l&apos;espace visiteur en P15.3 et synchronisées Brevo en P15.5.
            </p>
          </Card>
        </TabsContent>

        {/* ── TIMELINE ── */}
        <TabsContent value="timeline">
          <Card title="📜 Timeline">
            {timeline.length === 0 ? (
              <p className="text-md-text-muted text-sm">Aucune activité enregistrée.</p>
            ) : (
              <ul className="space-y-3">
                {timeline.map((t) => (
                  <li
                    key={t.id}
                    className="border-md-border flex items-start gap-3 border-l-2 pl-3"
                  >
                    <div>
                      <p className="text-md-text text-sm font-medium">{t.kind ?? t.action}</p>
                      <p className="text-md-text-muted text-xs">
                        {t.actor_name} · {fmtDate(t.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const selectCls = 'border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <dt className="text-md-text-muted text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-md-text mt-0.5">{children}</dd>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import { formatParisDateTime } from '@/lib/format/dates';
import {
  SPEAKER_TYPES,
  SPEAKER_TYPE_LABEL,
  SPEAKER_STATUSES,
  SPEAKER_STATUS_LABEL,
  SPEAKER_STATUS_CLASS,
  type SpeakerType,
  type SpeakerStatus,
} from '@/lib/speakers/constants';
import { VISITOR_LANGUAGES, VISITOR_LANGUAGE_LABEL } from '@/lib/visitors/constants';
import {
  updateSpeakerAction,
  confirmSpeakerAction,
  declineSpeakerAction,
  deleteSpeakerAction,
} from '@/lib/admin/speakers/mutate-actions';
import { validateSpeakerAction } from '@/lib/admin/programs/validation-actions';
import { formatParisDate } from '@/lib/format/dates';

type ContactObj = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  phone_mobile: string | null;
  role: string | null;
} | null;

export type SpeakerDetail = {
  id: string;
  speaker_type: string | null;
  status: string;
  language: string;
  notes: string | null;
  bio_short: string | null;
  bio_long: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  topics: string[] | null;
  is_validated: boolean;
  imported_at: string | null;
  created_at: string;
  contact: ContactObj;
  company: { id: string; name: string; website: string | null; city: string | null } | null;
  owner: { id: string; full_name: string | null; email: string } | null;
  conference_speakers: Array<{
    role: string | null;
    speaking_order: number | null;
    conference: {
      id: string;
      title_fr: string;
      title_en: string | null;
      start_at: string | null;
      room: string | null;
      city: string | null;
      conference_type: string | null;
      is_published: boolean;
    } | null;
  }> | null;
};

export type TimelineEntry = {
  id: string;
  action: string;
  kind: string | null;
  created_at: string;
  actor_name: string;
};

type Owner = { id: string; label: string };
const selectCls = 'border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm';

function fullName(c: ContactObj): string {
  if (!c) return '—';
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email;
}

export function SpeakerDetailClient({
  speaker,
  timeline,
  owners,
  currentRole,
}: {
  speaker: SpeakerDetail;
  timeline: TimelineEntry[];
  owners: Owner[];
  currentRole: 'admin' | 'sales' | 'super_admin';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const [speakerType, setSpeakerType] = useState(speaker.speaker_type ?? '');
  const [status, setStatus] = useState(speaker.status);
  const [language, setLanguage] = useState(speaker.language);
  const [ownerId, setOwnerId] = useState(speaker.owner?.id ?? '');
  const [notes, setNotes] = useState(speaker.notes ?? '');
  const [bioShort, setBioShort] = useState(speaker.bio_short ?? '');
  const [bioLong, setBioLong] = useState(speaker.bio_long ?? '');
  const [photoUrl, setPhotoUrl] = useState(speaker.photo_url ?? '');
  const [linkedin, setLinkedin] = useState(speaker.linkedin_url ?? '');
  const [twitter, setTwitter] = useState(speaker.twitter_handle ?? '');
  const [topics, setTopics] = useState<string[]>(speaker.topics ?? []);
  const [topicInput, setTopicInput] = useState('');

  function addTopic() {
    const t = topicInput.trim();
    if (t && !topics.includes(t) && topics.length < 20) setTopics([...topics, t]);
    setTopicInput('');
  }

  function save() {
    startTransition(async () => {
      try {
        await updateSpeakerAction(speaker.id, {
          speaker_type: speakerType ? (speakerType as SpeakerType) : null,
          status: status as SpeakerStatus,
          language: language as (typeof VISITOR_LANGUAGES)[number],
          owner_user_id: ownerId || null,
          notes: notes.trim() || null,
          bio_short: bioShort.trim() || null,
          bio_long: bioLong.trim() || null,
          photo_url: photoUrl.trim() || null,
          linkedin_url: linkedin.trim() || null,
          twitter_handle: twitter.trim() || null,
          topics,
        });
        toast.success('Speaker mis à jour.');
        setEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur mise à jour');
      }
    });
  }

  function runStatus(fn: () => Promise<unknown>, msg: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(msg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function handleDelete() {
    if (!window.confirm('Supprimer ce speaker ? Action définitive.')) return;
    startTransition(async () => {
      try {
        await deleteSpeakerAction(speaker.id);
        toast.success('Speaker supprimé.');
        router.push('/admin/speakers');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  const name = fullName(speaker.contact);
  const confs = speaker.conference_speakers ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {speaker.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={speaker.photo_url} alt="" className="size-12 rounded-full object-cover" />
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
                {name}
              </h1>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  SPEAKER_STATUS_CLASS[speaker.status as SpeakerStatus] ??
                    'bg-slate-100 text-slate-700',
                )}
              >
                {SPEAKER_STATUS_LABEL[speaker.status as SpeakerStatus] ?? speaker.status}
              </span>
            </div>
            <p className="text-md-text-muted text-sm">
              {speaker.contact?.email}
              {speaker.company ? <> · {speaker.company.name}</> : null}
            </p>
            {!speaker.is_validated ? (
              <span className="bg-md-warning/15 text-md-warning mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                ⚠️ Importé non validé
                {speaker.imported_at ? ` · ${formatParisDate(speaker.imported_at)}` : ''}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!speaker.is_validated ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => runStatus(() => validateSpeakerAction(speaker.id), 'Speaker validé.')}
            >
              <Check className="size-4" aria-hidden />
              Valider
            </Button>
          ) : null}
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil className="size-4" aria-hidden />
              Éditer
            </Button>
          ) : null}
          {speaker.status !== 'confirmed' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => runStatus(() => confirmSpeakerAction(speaker.id), 'Confirmé.')}
            >
              <Check className="size-4" aria-hidden />
              Confirmer
            </Button>
          ) : null}
          {speaker.status !== 'declined' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => runStatus(() => declineSpeakerAction(speaker.id), 'Décliné.')}
            >
              <X className="size-4" aria-hidden />
              Décliner
            </Button>
          ) : null}
          {isSuperAdmin(currentRole) ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={handleDelete}
              className="text-md-danger border-md-danger/30 hover:bg-md-danger/5"
            >
              <Trash2 className="size-4" aria-hidden />
              Supprimer
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="infos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="infos">📋 Infos générales</TabsTrigger>
          <TabsTrigger value="bio">📝 Bio & médias</TabsTrigger>
          <TabsTrigger value="confs">📅 Conférences animées</TabsTrigger>
          <TabsTrigger value="timeline">📜 Timeline</TabsTrigger>
        </TabsList>

        {/* INFOS */}
        <TabsContent value="infos" className="space-y-4">
          <Card title="Contact">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Nom">{name}</Row>
              <Row label="Email">{speaker.contact?.email ?? '—'}</Row>
              <Row label="Téléphone">
                {speaker.contact?.phone_mobile || speaker.contact?.phone || '—'}
              </Row>
              <Row label="Société">
                {speaker.company ? (
                  <Link
                    href={`/admin/companies/${speaker.company.id}`}
                    className="text-md-blue hover:underline"
                  >
                    {speaker.company.name}
                  </Link>
                ) : (
                  '—'
                )}
              </Row>
            </dl>
          </Card>

          <Card title="Speaker">
            {editing ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <EditField label="Type">
                  <select
                    value={speakerType}
                    onChange={(e) => setSpeakerType(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">—</option>
                    {SPEAKER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SPEAKER_TYPE_LABEL[t]}
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
                    {SPEAKER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {SPEAKER_STATUS_LABEL[s]}
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
                <EditField label="Notes" full>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </EditField>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Type">
                  {speaker.speaker_type
                    ? (SPEAKER_TYPE_LABEL[speaker.speaker_type as SpeakerType] ??
                      speaker.speaker_type)
                    : '—'}
                </Row>
                <Row label="Langue">
                  {VISITOR_LANGUAGE_LABEL[speaker.language as (typeof VISITOR_LANGUAGES)[number]] ??
                    speaker.language}
                </Row>
                <Row label="Owner">
                  {speaker.owner?.full_name?.trim() || speaker.owner?.email || '—'}
                </Row>
                <Row label="Ajouté le">
                  {formatParisDateTime(speaker.created_at, 'fr', { dateStyle: 'medium' })}
                </Row>
                <Row label="Notes" full>
                  {speaker.notes || '—'}
                </Row>
              </dl>
            )}
          </Card>

          {editing ? (
            <SaveBar pending={pending} onSave={save} onCancel={() => setEditing(false)} />
          ) : null}
        </TabsContent>

        {/* BIO & MÉDIAS */}
        <TabsContent value="bio" className="space-y-4">
          <Card title="Bio & médias">
            {editing ? (
              <div className="space-y-3">
                <EditField label="Bio courte (max 500)">
                  <Textarea
                    value={bioShort}
                    onChange={(e) => setBioShort(e.target.value)}
                    rows={2}
                    maxLength={500}
                  />
                </EditField>
                <EditField label="Bio longue">
                  <Textarea value={bioLong} onChange={(e) => setBioLong(e.target.value)} rows={5} />
                </EditField>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <EditField label="Photo URL">
                    <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
                  </EditField>
                  <EditField label="LinkedIn">
                    <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
                  </EditField>
                  <EditField label="Twitter / X">
                    <Input value={twitter} onChange={(e) => setTwitter(e.target.value)} />
                  </EditField>
                </div>
                <EditField label="Topics">
                  {topics.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {topics.map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setTopics(topics.filter((x) => x !== t))}
                        >
                          {t} ✕
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTopic();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addTopic}>
                      + Ajouter
                    </Button>
                  </div>
                </EditField>
                <SaveBar pending={pending} onSave={save} onCancel={() => setEditing(false)} />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {speaker.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={speaker.photo_url} alt="" className="size-24 rounded-lg object-cover" />
                ) : null}
                <Row label="Bio courte">{speaker.bio_short || '—'}</Row>
                <Row label="Bio longue">{speaker.bio_long || '—'}</Row>
                <Row label="LinkedIn">{speaker.linkedin_url || '—'}</Row>
                <Row label="Twitter / X">{speaker.twitter_handle || '—'}</Row>
                <Row label="Topics">{topics.length ? topics.join(' · ') : '—'}</Row>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* CONFÉRENCES */}
        <TabsContent value="confs">
          <Card title="Conférences animées">
            {confs.length === 0 ? (
              <p className="text-md-text-muted text-sm">
                Aucune conférence. Rattachez ce speaker depuis la fiche d&apos;une conférence.
              </p>
            ) : (
              <ul className="space-y-2">
                {confs.map((cs) =>
                  cs.conference ? (
                    <li
                      key={cs.conference.id}
                      className="border-md-border flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div>
                        <Link
                          href={`/admin/conferences/${cs.conference.id}`}
                          className="text-md-text font-semibold hover:underline"
                        >
                          {cs.conference.title_fr}
                        </Link>
                        <div className="text-md-text-muted text-xs">
                          {cs.conference.start_at
                            ? formatParisDateTime(cs.conference.start_at, 'fr', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '— date à définir'}
                          {cs.conference.room ? ` · ${cs.conference.room}` : ''}
                          {cs.conference.city ? ` · ${cs.conference.city}` : ''}
                          {cs.role ? ` · ${cs.role}` : ''}
                        </div>
                      </div>
                      <span className="text-md-text-muted text-xs">
                        {cs.conference.is_published ? 'Publiée' : 'Brouillon'}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline">
          <Card title="Timeline">
            {timeline.length === 0 ? (
              <p className="text-md-text-muted text-sm">Aucune activité.</p>
            ) : (
              <ul className="space-y-3">
                {timeline.map((t) => (
                  <li key={t.id} className="border-md-border border-l-2 pl-3">
                    <p className="text-md-text text-sm font-medium">{t.kind ?? t.action}</p>
                    <p className="text-md-text-muted text-xs">
                      {t.actor_name} ·{' '}
                      {formatParisDateTime(t.created_at, 'fr', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
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

function SaveBar({
  pending,
  onSave,
  onCancel,
}: {
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
        Annuler
      </Button>
      <Button size="sm" onClick={onSave} disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </div>
  );
}

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
      <dt className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">{label}</dt>
      <dd className="text-md-text mt-0.5">{children}</dd>
    </div>
  );
}

function EditField({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', full && 'sm:col-span-2')}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

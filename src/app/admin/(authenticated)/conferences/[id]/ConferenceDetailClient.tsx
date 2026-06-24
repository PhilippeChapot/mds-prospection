'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Eye, EyeOff, Trash2, BadgeCheck, Wand2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import { formatParisDateTime, formatParisDate } from '@/lib/format/dates';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import {
  CONFERENCE_TYPES,
  CONFERENCE_TYPE_LABEL,
  CONFERENCE_CITIES,
  type ConferenceType,
} from '@/lib/conferences/constants';
import {
  updateConferenceAction,
  publishConferenceAction,
  deleteConferenceAction,
  type ConferenceInput,
} from '@/lib/admin/conferences/crud-actions';
import { ConferenceSpeakersManager, type ManagedSpeaker } from './ConferenceSpeakersManager';
import { validateConferenceAction } from '@/lib/admin/programs/validation-actions';
import { KeyFiguresInput } from '../_components/KeyFiguresInput';
import { TranslateConferenceButton } from '../TranslateButtons';
import { translateConferenceFieldAction } from '@/lib/admin/conferences/translate-actions';

export type AttachedSpeaker = ManagedSpeaker;

export type ConferenceDetail = {
  id: string;
  title_fr: string;
  title_en: string | null;
  description_fr: string | null;
  description_en: string | null;
  target_audience_fr: string | null;
  target_audience_en: string | null;
  key_figures_fr: string[] | null;
  key_figures_en: string[] | null;
  conference_type: string | null;
  start_at: string | null;
  end_at: string | null;
  room: string | null;
  city: string | null;
  capacity: number | null;
  poles: string[] | null;
  is_published: boolean;
  featured: boolean;
  slug: string | null;
  is_validated: boolean;
  imported_at: string | null;
};

export type TimelineEntry = {
  id: string;
  action: string;
  kind: string | null;
  created_at: string;
  actor_name: string;
};

const selectCls = 'border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm';

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function ConferenceDetailClient({
  conference,
  speakers,
  timeline,
  currentRole,
}: {
  conference: ConferenceDetail;
  speakers: AttachedSpeaker[];
  timeline: TimelineEntry[];
  currentRole: 'admin' | 'sales' | 'super_admin';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const [titleFr, setTitleFr] = useState(conference.title_fr);
  const [titleEn, setTitleEn] = useState(conference.title_en ?? '');
  const [type, setType] = useState(conference.conference_type ?? '');
  const [descFr, setDescFr] = useState(conference.description_fr ?? '');
  const [descEn, setDescEn] = useState(conference.description_en ?? '');
  const [audienceFr, setAudienceFr] = useState(conference.target_audience_fr ?? '');
  const [audienceEn, setAudienceEn] = useState(conference.target_audience_en ?? '');
  const [keyFiguresFr, setKeyFiguresFr] = useState<string[]>(conference.key_figures_fr ?? []);
  const [keyFiguresEn, setKeyFiguresEn] = useState<string[]>(conference.key_figures_en ?? []);
  const [translatingField, setTranslatingField] = useState<string | null>(null);

  // P16.x — traduit un champ FR (valeur à l'écran) → remplit le champ EN.
  function translateField(
    field: 'title' | 'description' | 'target_audience' | 'key_figures',
    payload: { source_text?: string; source_list?: string[] },
    apply: (text: string, list: string[]) => void,
  ) {
    setTranslatingField(field);
    startTransition(async () => {
      const r = await translateConferenceFieldAction({ field, ...payload });
      setTranslatingField(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      apply(r.text ?? '', r.list ?? []);
    });
  }
  const [startAt, setStartAt] = useState(isoToLocalInput(conference.start_at));
  const [endAt, setEndAt] = useState(isoToLocalInput(conference.end_at));
  const [room, setRoom] = useState(conference.room ?? '');
  const [city, setCity] = useState(conference.city ?? '');
  const [capacity, setCapacity] = useState(conference.capacity ? String(conference.capacity) : '');
  const [poles, setPoles] = useState<PoleCode[]>((conference.poles ?? []) as PoleCode[]);
  const [featured, setFeatured] = useState(conference.featured);

  function togglePole(p: PoleCode) {
    setPoles((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function save() {
    const input: ConferenceInput = {
      title_fr: titleFr.trim(),
      title_en: titleEn.trim() || undefined,
      description_fr: descFr.trim() || undefined,
      description_en: descEn.trim() || undefined,
      target_audience_fr: audienceFr.trim() || undefined,
      target_audience_en: audienceEn.trim() || undefined,
      key_figures_fr: keyFiguresFr.length ? keyFiguresFr : null,
      key_figures_en: keyFiguresEn.length ? keyFiguresEn : null,
      conference_type: type ? (type as ConferenceInput['conference_type']) : null,
      start_at: localToIso(startAt),
      end_at: localToIso(endAt),
      room: room.trim() || null,
      city: city ? (city as ConferenceInput['city']) : null,
      capacity: capacity ? Number(capacity) : null,
      poles: poles.length ? poles : null,
      is_published: conference.is_published,
      featured,
    };
    startTransition(async () => {
      try {
        await updateConferenceAction(conference.id, input);
        toast.success('Conférence mise à jour.');
        setEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function runStatus(fn: () => Promise<unknown>, msg: string, redirect?: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(msg);
        if (redirect) router.push(redirect);
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
              {conference.featured ? '⭐ ' : ''}
              {conference.title_fr}
            </h1>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                conference.is_published
                  ? 'bg-md-success/15 text-md-success'
                  : 'bg-md-warning/15 text-md-warning',
              )}
            >
              {conference.is_published ? 'Publiée' : 'Brouillon'}
            </span>
          </div>
          <p className="text-md-text-muted text-sm">
            {conference.start_at
              ? formatParisDateTime(conference.start_at, 'fr', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })
              : 'Date à définir'}
            {conference.room ? ` · ${conference.room}` : ''}
            {conference.city ? ` · ${conference.city}` : ''}
          </p>
          {!conference.is_validated ? (
            <span className="bg-md-warning/15 text-md-warning mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold">
              ⚠️ Importé non validé
              {conference.imported_at ? ` · ${formatParisDate(conference.imported_at)}` : ''}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <TranslateConferenceButton conferenceId={conference.id} />
          {!conference.is_validated ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                runStatus(() => validateConferenceAction(conference.id), 'Conférence validée.')
              }
            >
              <BadgeCheck className="size-4" aria-hidden />
              Valider
            </Button>
          ) : null}
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil className="size-4" aria-hidden />
              Éditer
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              runStatus(
                () => publishConferenceAction(conference.id, !conference.is_published),
                conference.is_published ? 'Dépubliée.' : 'Publiée.',
              )
            }
          >
            {conference.is_published ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
            {conference.is_published ? 'Dépublier' : 'Publier'}
          </Button>
          {isSuperAdmin(currentRole) ? (
            <Button
              variant="outline"
              size="sm"
              className="text-md-danger border-md-danger/30 hover:bg-md-danger/5"
              disabled={pending}
              onClick={() => {
                if (window.confirm('Supprimer cette conférence ?'))
                  runStatus(
                    () => deleteConferenceAction(conference.id),
                    'Supprimée.',
                    '/admin/conferences',
                  );
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Supprimer
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="infos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="infos">📋 Infos</TabsTrigger>
          <TabsTrigger value="speakers">👥 Speakers ({speakers.length})</TabsTrigger>
          <TabsTrigger value="timeline">📜 Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="infos">
          <Card title="Détails">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EditField label="Titre (FR)">
                    <Input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} />
                  </EditField>
                  <EditField label="Titre (EN)">
                    <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
                  </EditField>
                  <EditField label="Type">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {CONFERENCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {CONFERENCE_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="Ville">
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {CONFERENCE_CITIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </EditField>
                  <EditField label="Début (Paris)">
                    <Input
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                    />
                  </EditField>
                  <EditField label="Fin (Paris)">
                    <Input
                      type="datetime-local"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                    />
                  </EditField>
                  <EditField label="Salle">
                    <Input value={room} onChange={(e) => setRoom(e.target.value)} />
                  </EditField>
                  <EditField label="Capacité">
                    <Input
                      type="number"
                      min={1}
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                    />
                  </EditField>
                </div>
                {/* P16.x — édition bilingue FR | EN côte à côte + 🪄 par champ. */}
                <BilingualRow
                  label="Description"
                  onTranslate={() =>
                    translateField('description', { source_text: descFr }, (text) =>
                      setDescEn(text),
                    )
                  }
                  translating={translatingField === 'description'}
                  fr={
                    <Textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} rows={3} />
                  }
                  en={
                    <Textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={3} />
                  }
                />
                <BilingualRow
                  label="Public cible — pré-programme"
                  onTranslate={() =>
                    translateField('target_audience', { source_text: audienceFr }, (text) =>
                      setAudienceEn(text),
                    )
                  }
                  translating={translatingField === 'target_audience'}
                  fr={
                    <Textarea
                      value={audienceFr}
                      onChange={(e) => setAudienceFr(e.target.value)}
                      rows={2}
                      placeholder="Ex : Directeurs marketing, responsables média"
                    />
                  }
                  en={
                    <Textarea
                      value={audienceEn}
                      onChange={(e) => setAudienceEn(e.target.value)}
                      rows={2}
                    />
                  }
                />
                <BilingualRow
                  label="Chiffres clés — pré-programme"
                  onTranslate={() =>
                    translateField('key_figures', { source_list: keyFiguresFr }, (_t, list) =>
                      setKeyFiguresEn(list),
                    )
                  }
                  translating={translatingField === 'key_figures'}
                  fr={<KeyFiguresInput value={keyFiguresFr} onChange={setKeyFiguresFr} />}
                  en={<KeyFiguresInput value={keyFiguresEn} onChange={setKeyFiguresEn} />}
                />
                <EditField label="Pôles">
                  <div className="flex flex-wrap gap-2">
                    {POLE_CODES.map((p) => (
                      <label
                        key={p}
                        className="border-md-border inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={poles.includes(p)}
                          onChange={() => togglePole(p)}
                          className="size-3.5"
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </EditField>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    className="size-4"
                  />
                  ⭐ Featured
                </label>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={pending}
                  >
                    Annuler
                  </Button>
                  <Button size="sm" onClick={save} disabled={pending}>
                    {pending ? 'Enregistrement…' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Titre EN">{conference.title_en || '—'}</Row>
                <Row label="Type">
                  {conference.conference_type
                    ? (CONFERENCE_TYPE_LABEL[conference.conference_type as ConferenceType] ??
                      conference.conference_type)
                    : '—'}
                </Row>
                <Row label="Début">
                  {conference.start_at
                    ? formatParisDateTime(conference.start_at, 'fr', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '—'}
                </Row>
                <Row label="Fin">
                  {conference.end_at
                    ? formatParisDateTime(conference.end_at, 'fr', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '—'}
                </Row>
                <Row label="Salle">{conference.room || '—'}</Row>
                <Row label="Ville">{conference.city || '—'}</Row>
                <Row label="Capacité">{conference.capacity ?? '—'}</Row>
                <Row label="Pôles">
                  {conference.poles?.length ? conference.poles.join(', ') : '—'}
                </Row>
                <Row label="Slug" full>
                  {conference.slug || '—'}
                </Row>
                <Row label="Description FR" full>
                  {conference.description_fr || '—'}
                </Row>
                <Row label="Description EN" full>
                  {conference.description_en || '—'}
                </Row>
              </dl>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="speakers">
          <Card title="Speakers">
            <ConferenceSpeakersManager conferenceId={conference.id} speakers={speakers} />
          </Card>
        </TabsContent>

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

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** P16.x — ligne d'édition bilingue FR | EN + bouton 🪄 « traduire ce champ ». */
function BilingualRow({
  label,
  fr,
  en,
  onTranslate,
  translating,
}: {
  label: string;
  fr: React.ReactNode;
  en: React.ReactNode;
  onTranslate: () => void;
  translating: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={translating}
          onClick={onTranslate}
        >
          {translating ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="size-3.5" aria-hidden />
          )}
          FR → EN
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
            FR
          </span>
          {fr}
        </div>
        <div className="space-y-1">
          <span className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
            EN
          </span>
          {en}
        </div>
      </div>
    </div>
  );
}

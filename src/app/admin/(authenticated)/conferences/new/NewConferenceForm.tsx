'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import {
  CONFERENCE_TYPES,
  CONFERENCE_TYPE_LABEL,
  CONFERENCE_CITIES,
} from '@/lib/conferences/constants';
import {
  createConferenceAction,
  checkConferenceOverlapAction,
  type ConferenceInput,
  type OverlapHit,
} from '@/lib/admin/conferences/crud-actions';

const selectCls = 'border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm';

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function NewConferenceForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState<OverlapHit[]>([]);

  const [titleFr, setTitleFr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [type, setType] = useState('');
  const [descFr, setDescFr] = useState('');
  const [descEn, setDescEn] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [room, setRoom] = useState('');
  const [city, setCity] = useState('');
  const [capacity, setCapacity] = useState('');
  const [poles, setPoles] = useState<PoleCode[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [featured, setFeatured] = useState(false);

  function togglePole(p: PoleCode) {
    setPoles((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function checkOverlap() {
    const s = toIso(startAt);
    const e = toIso(endAt);
    if (!room || !s || !e) {
      setOverlaps([]);
      return;
    }
    startTransition(async () => {
      const hits = await checkConferenceOverlapAction({ room, start_at: s, end_at: e });
      setOverlaps(hits);
    });
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!titleFr.trim()) {
      setError('Le titre FR est requis.');
      return;
    }
    const input: ConferenceInput = {
      title_fr: titleFr.trim(),
      title_en: titleEn.trim() || undefined,
      description_fr: descFr.trim() || undefined,
      description_en: descEn.trim() || undefined,
      conference_type: type ? (type as ConferenceInput['conference_type']) : null,
      start_at: toIso(startAt),
      end_at: toIso(endAt),
      room: room.trim() || null,
      city: city ? (city as ConferenceInput['city']) : null,
      capacity: capacity ? Number(capacity) : null,
      poles: poles.length ? poles : null,
      is_published: isPublished,
      featured,
    };
    startTransition(async () => {
      try {
        const res = await createConferenceAction(input);
        toast.success('Conférence créée.');
        router.push(`/admin/conferences/${res.conference_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur création conférence.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Section title="Identité">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Titre (FR)" required>
            <Input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} required />
          </Field>
          <Field label="Titre (EN)">
            <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
              <option value="">—</option>
              {CONFERENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONFERENCE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Créneau (heure de Paris)">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Début">
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              onBlur={checkOverlap}
            />
          </Field>
          <Field label="Fin">
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              onBlur={checkOverlap}
            />
          </Field>
          <Field label="Salle">
            <Input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              onBlur={checkOverlap}
              placeholder="Carrousel, Espace 1…"
            />
          </Field>
          <Field label="Ville">
            <select value={city} onChange={(e) => setCity(e.target.value)} className={selectCls}>
              <option value="">—</option>
              {CONFERENCE_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacité">
            <Input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
        </div>
        {overlaps.length > 0 && (
          <div className="border-md-warning/40 bg-md-warning/10 text-md-text flex items-start gap-2 rounded-md border p-3 text-sm">
            <AlertTriangle className="text-md-warning mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <strong>Conflit de salle</strong> ({overlaps.length}) — non bloquant :
              <ul className="mt-1 list-disc pl-5">
                {overlaps.map((o) => (
                  <li key={o.id}>{o.title_fr}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Section>

      <Section title="Description">
        <Field label="Description (FR)">
          <Textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} rows={3} />
        </Field>
        <Field label="Description (EN)">
          <Textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={3} />
        </Field>
      </Section>

      <Section title="Tags & visibilité">
        <Field label="Pôles">
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
        </Field>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="size-4"
            />
            Publiée
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="size-4"
            />
            ⭐ Featured
          </label>
        </div>
        <p className="text-md-text-muted text-xs">
          Les speakers s&apos;ajoutent après création, depuis la fiche conférence.
        </p>
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
          <Link href="/admin/conferences">Annuler</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Création…' : 'Créer la conférence'}
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

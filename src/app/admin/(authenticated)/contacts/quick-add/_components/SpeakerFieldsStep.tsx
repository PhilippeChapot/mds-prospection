'use client';

/**
 * P15.2 — étape "détails speaker" du Smart Add (SHELL, fiche complète en P16).
 * Pas de /admin/speakers en V1 → redirect vers /admin/visitors après création.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  VISITOR_LANGUAGES,
  VISITOR_LANGUAGE_LABEL,
  type VisitorLanguage,
} from '@/lib/visitors/constants';
import { createSpeakerAction } from '@/lib/admin/speakers/create-actions';

const SPEAKER_TYPES = ['keynote', 'panel', 'masterclass', 'workshop', 'moderator'] as const;
const SPEAKER_TYPE_LABEL: Record<(typeof SPEAKER_TYPES)[number], string> = {
  keynote: 'Keynote',
  panel: 'Panel',
  masterclass: 'Masterclass',
  workshop: 'Workshop',
  moderator: 'Modérateur',
};

const selectCls = 'border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm';

export function SpeakerFieldsStep({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [speakerType, setSpeakerType] = useState<(typeof SPEAKER_TYPES)[number]>('panel');
  const [bioShort, setBioShort] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [language, setLanguage] = useState<VisitorLanguage>('fr');

  function addTopic() {
    const t = topicInput.trim();
    if (t && !topics.includes(t) && topics.length < 20) {
      setTopics([...topics, t]);
    }
    setTopicInput('');
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        await createSpeakerAction({
          contact_id: contactId,
          speaker_type: speakerType,
          bio_short: bioShort.trim() || undefined,
          topics: topics.length ? topics : undefined,
          language,
          status: 'proposed',
        });
        toast.success('Speaker créé (fiche complète en P16).');
        router.push('/admin/visitors');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur création speaker.');
      }
    });
  }

  return (
    <section className="bg-card border-md-border space-y-4 rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
        🎤 Détails speaker — {contactName}
      </h2>

      <div className="border-md-border bg-muted/30 rounded-md border p-3 text-sm">
        ℹ️ La fiche Speaker complète sera disponible en P16. V1 = saisie minimale.
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Type d&apos;intervention</Label>
          <select
            value={speakerType}
            onChange={(e) => setSpeakerType(e.target.value as (typeof SPEAKER_TYPES)[number])}
            className={selectCls}
          >
            {SPEAKER_TYPES.map((t) => (
              <option key={t} value={t}>
                {SPEAKER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Langue</Label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as VisitorLanguage)}
            className={selectCls}
          >
            {VISITOR_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {VISITOR_LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Bio courte</Label>
        <Textarea
          value={bioShort}
          onChange={(e) => setBioShort(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Bio courte pour le programme (max 500 caractères)"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Sujets (topics)</Label>
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-2">
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
            placeholder="Ex: IA générative, podcasts, monétisation…"
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
      </div>

      <Button onClick={handleSubmit} disabled={pending} className="w-full">
        {pending ? 'Création…' : 'Créer le speaker'}
      </Button>
    </section>
  );
}

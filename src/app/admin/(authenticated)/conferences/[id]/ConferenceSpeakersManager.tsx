'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, X, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CONFERENCE_SPEAKER_ROLES,
  CONFERENCE_SPEAKER_ROLE_LABEL,
  type ConferenceSpeakerRole,
} from '@/lib/conferences/constants';
import { searchSpeakerOptionsAction, type SpeakerOption } from '@/lib/admin/speakers/list-actions';
import {
  attachSpeakerToConferenceAction,
  detachSpeakerFromConferenceAction,
  reorderConferenceSpeakersAction,
} from '@/lib/admin/conferences/speaker-junction-actions';

export type ManagedSpeaker = {
  speaker_id: string;
  name: string;
  photo_url: string | null;
  role: string | null;
  speaking_order: number;
};

const selectCls = 'border-md-border h-8 rounded-md border bg-white px-2 text-xs';

export function ConferenceSpeakersManager({
  conferenceId,
  speakers,
}: {
  conferenceId: string;
  speakers: ManagedSpeaker[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpeakerOption[]>([]);
  const [picked, setPicked] = useState<SpeakerOption | null>(null);
  const [role, setRole] = useState<ConferenceSpeakerRole>('panelist');

  function run(fn: () => Promise<unknown>, okMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(okMsg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function doSearch() {
    startTransition(async () => {
      const r = await searchSpeakerOptionsAction(query);
      // Exclut ceux déjà rattachés.
      const attachedIds = new Set(speakers.map((s) => s.speaker_id));
      setResults(r.filter((o) => !attachedIds.has(o.id)));
    });
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...speakers];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(
      () =>
        reorderConferenceSpeakersAction({
          conference_id: conferenceId,
          ordered_speaker_ids: next.map((s) => s.speaker_id),
        }),
      'Ordre mis à jour.',
    );
  }

  return (
    <div className="space-y-4">
      {/* Liste rattachée */}
      {speakers.length === 0 ? (
        <p className="text-md-text-muted text-sm">Aucun speaker rattaché.</p>
      ) : (
        <ul className="space-y-2">
          {speakers.map((s, i) => (
            <li
              key={s.speaker_id}
              className="border-md-border flex items-center gap-3 rounded-md border p-2.5"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Monter"
                  disabled={pending || i === 0}
                  onClick={() => move(i, -1)}
                  className="text-md-text-muted hover:text-md-text disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Descendre"
                  disabled={pending || i === speakers.length - 1}
                  onClick={() => move(i, 1)}
                  className="text-md-text-muted hover:text-md-text disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </button>
              </div>
              <span className="text-md-text-muted w-5 text-center text-xs font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-md-text truncate text-sm font-semibold">{s.name}</div>
                <div className="text-md-text-muted text-xs">
                  {s.role
                    ? (CONFERENCE_SPEAKER_ROLE_LABEL[s.role as ConferenceSpeakerRole] ?? s.role)
                    : 'Rôle non défini'}
                </div>
              </div>
              <button
                type="button"
                aria-label="Retirer"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      detachSpeakerFromConferenceAction({
                        conference_id: conferenceId,
                        speaker_id: s.speaker_id,
                      }),
                    'Speaker retiré.',
                  )
                }
                className="text-md-text-muted hover:text-md-danger"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ajout */}
      <div className="border-md-border space-y-2 rounded-md border border-dashed p-3">
        <p className="text-md-text text-xs font-semibold">Ajouter un speaker</p>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un speaker…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                doSearch();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={doSearch} disabled={pending}>
            <Search className="size-4" aria-hidden />
          </Button>
        </div>

        {results.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {results.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setPicked(o)}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${
                  picked?.id === o.id ? 'bg-md-blue/10 text-md-blue' : 'hover:bg-muted'
                }`}
              >
                {o.name} <span className="text-md-text-muted text-xs">· {o.email}</span>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-md-text text-sm">{picked.name} →</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ConferenceSpeakerRole)}
              className={selectCls}
            >
              {CONFERENCE_SPEAKER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CONFERENCE_SPEAKER_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await attachSpeakerToConferenceAction({
                    conference_id: conferenceId,
                    speaker_id: picked.id,
                    role,
                  });
                  setPicked(null);
                  setResults([]);
                  setQuery('');
                }, 'Speaker rattaché.')
              }
            >
              <Plus className="size-4" aria-hidden />
              Rattacher
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

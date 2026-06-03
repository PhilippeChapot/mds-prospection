'use client';

/**
 * P5.x.CompaniesAddressAndTags — editeur multi-checkboxes des
 * external_event_tags (PRS / MD Classic / RDE / SATIS / CBD x annees).
 *
 * Save via updateCompanyExternalEventTagsAction (whitelist stricte).
 * Affiche les badges utilises par le composant ExternalEventBadges.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { updateCompanyExternalEventTagsAction } from '@/lib/admin/companies/tags-actions';

type EventTags = Record<string, number[]>;

interface EventConfig {
  key: string;
  emoji: string;
  label: string;
  years: number[];
}

const EVENTS: EventConfig[] = [
  { key: 'prs', emoji: '🟣', label: 'PRS (Paris Radio Show)', years: [2026] },
  {
    key: 'mediadays_classic',
    emoji: '🟠',
    label: 'MediaDays Classic (Havas)',
    years: [2023, 2024, 2025, 2026],
  },
  { key: 'rde', emoji: '🔵', label: 'RDE (Radio Days Europe)', years: [2026] },
  { key: 'satis', emoji: '🟢', label: 'SATIS', years: [2024, 2025, 2026] },
  { key: 'cbd', emoji: '🟡', label: 'CBD (Broadcast Days)', years: [2024, 2025] },
];

interface Props {
  companyId: string;
  initialTags: EventTags;
}

export function ExternalEventTagsEditor({ companyId, initialTags }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<EventTags>(initialTags ?? {});
  const [pending, startTransition] = useTransition();

  function toggle(eventKey: string, year: number) {
    setTags((prev) => {
      const current = prev[eventKey] ?? [];
      const next = current.includes(year)
        ? current.filter((y) => y !== year)
        : [...current, year].sort((a, b) => a - b);
      const updated = { ...prev };
      if (next.length === 0) delete updated[eventKey];
      else updated[eventKey] = next;
      return updated;
    });
  }

  function handleSave() {
    startTransition(async () => {
      const r = await updateCompanyExternalEventTagsAction({
        company_id: companyId,
        tags,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Tags événements mis à jour ✓');
      router.refresh();
    });
  }

  function handleReset() {
    setTags(initialTags ?? {});
  }

  const hasChanges = JSON.stringify(tags) !== JSON.stringify(initialTags ?? {});

  return (
    <section className="bg-card border-md-border space-y-4 rounded-xl border p-5 shadow-sm">
      <div>
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          🏷️ Événements externes
        </h2>
        <p className="text-md-text-muted mt-1 text-xs">
          Cochez les éditions auxquelles cette société a participé. Les badges s&apos;afficheront
          partout dans l&apos;app (prospects, signups, fiche détail).
        </p>
      </div>

      <div className="space-y-3">
        {EVENTS.map((event) => {
          const selected = tags[event.key] ?? [];
          return (
            <div key={event.key} className="space-y-1.5">
              <div className="text-md-text text-sm font-bold">
                {event.emoji} {event.label}
              </div>
              <div className="flex flex-wrap gap-3 pl-6">
                {event.years.map((year) => {
                  const checked = selected.includes(year);
                  return (
                    <Label key={year} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Checkbox checked={checked} onCheckedChange={() => toggle(event.key, year)} />
                      <span>{year}</span>
                    </Label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-md-border flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={pending || !hasChanges}
        >
          Annuler les modifications
        </Button>
        <Button type="button" onClick={handleSave} disabled={pending || !hasChanges}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Enregistrer les tags
        </Button>
      </div>
    </section>
  );
}

'use client';

/**
 * P16.x.ConferencesKeyFigures — boutons « 🪄 Traduire » (une conférence) et
 * « 🪄 Traduire toutes » (bulk) via Claude Haiku 4.5.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  translateConferenceAction,
  translateAllPendingConferencesAction,
} from '@/lib/admin/conferences/translate-actions';

export function TranslateConferenceButton({ conferenceId }: { conferenceId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await translateConferenceAction({ conference_id: conferenceId });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success('Traduit (EN) via Haiku. Relecture conseillée.');
          setTimeout(() => router.refresh(), 800);
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Wand2 className="size-3.5" aria-hidden />
      )}
      Traduire
    </Button>
  );
}

export function TranslateAllButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm('Traduire toutes les conférences sans version EN ?')) return;
        start(async () => {
          const r = await translateAllPendingConferencesAction();
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(
            `${r.translated} conférence(s) traduite(s)${r.failed ? `, ${r.failed} échec(s)` : ''}.`,
          );
          setTimeout(() => router.refresh(), 1000);
        });
      }}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Wand2 className="size-4" aria-hidden />
      )}
      Traduire toutes (EN)
    </Button>
  );
}

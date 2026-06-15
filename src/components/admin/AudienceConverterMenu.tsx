'use client';

/**
 * P15.2 — menu "🔄 Convertir aussi en…" sur les fiches prospect / visiteur.
 *
 * Add-only : crée une row dans l'audience cible (jamais de DELETE). Les options
 * déjà existantes pour ce contact sont désactivées.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  convertProspectToVisitorAction,
  convertProspectToSpeakerAction,
  convertVisitorToProspectAction,
  convertVisitorToSpeakerAction,
} from '@/lib/admin/conversions/cross-conversion-actions';

type Props = {
  source: 'prospect' | 'visitor';
  sourceId: string;
  /** Le contact est-il déjà visiteur ? (désactive l'option) */
  alreadyVisitor?: boolean;
  /** Le contact est-il déjà speaker ? (désactive l'option) */
  alreadySpeaker?: boolean;
};

export function AudienceConverterMenu({ source, sourceId, alreadyVisitor, alreadySpeaker }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T>(fn: () => Promise<T>, onDone: (res: T) => void) {
    startTransition(async () => {
      try {
        const res = await fn();
        onDone(res);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur conversion');
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <RefreshCw className="size-4" aria-hidden />
          Convertir aussi en…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {source === 'prospect' && (
          <>
            <DropdownMenuItem
              disabled={pending || alreadyVisitor}
              onClick={() =>
                run(
                  () => convertProspectToVisitorAction({ prospect_id: sourceId }),
                  (r) => {
                    toast.success('Visiteur créé.');
                    router.push(`/admin/visitors/${r.visitor_id}`);
                  },
                )
              }
            >
              👥 Visiteur {alreadyVisitor ? '(déjà)' : ''}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending || alreadySpeaker}
              onClick={() =>
                run(
                  () => convertProspectToSpeakerAction({ prospect_id: sourceId }),
                  () => {
                    toast.success('Speaker créé (fiche complète en P16).');
                    router.refresh();
                  },
                )
              }
            >
              🎤 Speaker {alreadySpeaker ? '(déjà)' : ''}
            </DropdownMenuItem>
          </>
        )}

        {source === 'visitor' && (
          <>
            <DropdownMenuItem
              disabled={pending}
              onClick={() =>
                run(
                  () => convertVisitorToProspectAction({ visitor_id: sourceId }),
                  (r) => {
                    toast.success('Prospect créé.');
                    router.push(`/admin/prospects/${r.prospect_id}`);
                  },
                )
              }
            >
              🏢 Prospect partenaire
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending || alreadySpeaker}
              onClick={() =>
                run(
                  () => convertVisitorToSpeakerAction({ visitor_id: sourceId }),
                  () => {
                    toast.success('Speaker créé (fiche complète en P16).');
                    router.refresh();
                  },
                )
              }
            >
              🎤 Speaker {alreadySpeaker ? '(déjà)' : ''}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

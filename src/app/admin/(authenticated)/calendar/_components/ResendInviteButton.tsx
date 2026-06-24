'use client';

/**
 * P14.x.CalendarExternalInvites — bouton "Renvoyer l'invitation" (RDV only).
 * Affiché dans la modale pour un meeting existant ayant des invités externes.
 */

import { useTransition } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resendEventInvitesAction } from '@/lib/admin/calendar/actions';

export function ResendInviteButton({
  eventId,
  locale = 'fr',
}: {
  eventId: string;
  locale?: 'fr' | 'en';
}) {
  const [pending, start] = useTransition();
  const label = locale === 'fr' ? "Renvoyer l'invitation" : 'Resend invitation';
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resendEventInvitesAction(eventId);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(
            locale === 'fr'
              ? `Invitation renvoyée à ${r.sent}/${r.total} invité(s).`
              : `Invitation resent to ${r.sent}/${r.total} attendee(s).`,
          );
        })
      }
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Send className="size-3.5" aria-hidden />
      )}
      {label}
    </Button>
  );
}

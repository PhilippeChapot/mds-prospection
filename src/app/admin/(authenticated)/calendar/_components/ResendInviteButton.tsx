'use client';

/**
 * P14.x.CalendarExternalInvites / RSVP-UI — bouton "Renvoyer l'invitation".
 * scope : 'all' (tous) | 'pending' (en attente) | { email } (un invité).
 */

import { useTransition } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resendEventInvitesAction } from '@/lib/admin/calendar/actions';

export function ResendInviteButton({
  eventId,
  scope = 'all',
  label,
  variant = 'outline',
  locale = 'fr',
}: {
  eventId: string;
  scope?: 'all' | 'pending' | { email: string };
  label?: string;
  variant?: 'outline' | 'ghost' | 'secondary';
  locale?: 'fr' | 'en';
}) {
  const [pending, start] = useTransition();
  const text = label ?? (locale === 'fr' ? "Renvoyer l'invitation" : 'Resend invitation');
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resendEventInvitesAction({ eventId, scope });
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
      {text}
    </Button>
  );
}

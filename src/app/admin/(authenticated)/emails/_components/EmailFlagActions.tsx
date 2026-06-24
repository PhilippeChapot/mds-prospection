'use client';

/**
 * P12.x.EmailIntegration — actions flags sur un email (étoile / archive /
 * marquer non lu). Appelle setEmailFlagAction + refresh.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Archive, MailOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setEmailFlagAction } from '@/lib/admin/emails/actions';

export function EmailFlagActions({
  emailId,
  isStarred,
  isArchived,
}: {
  emailId: string;
  isStarred: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function flag(field: 'is_read' | 'is_starred' | 'is_archived', value: boolean) {
    start(async () => {
      const r = await setEmailFlagAction({ email_id: emailId, field, value });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => flag('is_starred', !isStarred)}
      >
        <Star
          className={`size-4 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`}
          aria-hidden
        />
        {isStarred ? 'Retirer l’étoile' : 'Étoiler'}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => flag('is_archived', !isArchived)}
      >
        <Archive className="size-4" aria-hidden />
        {isArchived ? 'Désarchiver' : 'Archiver'}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => flag('is_read', false)}
      >
        <MailOpen className="size-4" aria-hidden />
        Marquer non lu
      </Button>
    </div>
  );
}

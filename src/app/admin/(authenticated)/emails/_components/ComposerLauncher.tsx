'use client';

/**
 * P12.x.EmailIntegration — bouton qui ouvre le ComposerModal. Réutilisé sur
 * l'inbox, la page détail (Répondre) et la fiche prospect.
 */

import { useState } from 'react';
import { Mail, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComposerModal, type ComposerAccount, type ComposerPrefill } from './ComposerModal';
import type { EmailTemplateItem } from '@/lib/admin/emails/queries';

export function ComposerLauncher({
  accounts,
  templates,
  prefill,
  label = 'Nouveau message',
  variant = 'default',
  isReply = false,
}: {
  accounts: ComposerAccount[];
  templates: EmailTemplateItem[];
  prefill?: ComposerPrefill;
  label?: string;
  variant?: 'default' | 'outline' | 'secondary';
  isReply?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (accounts.length === 0) return null;
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {isReply ? (
          <Reply className="size-4" aria-hidden />
        ) : (
          <Mail className="size-4" aria-hidden />
        )}
        {label}
      </Button>
      {open && (
        <ComposerModal
          open={open}
          onOpenChange={setOpen}
          accounts={accounts}
          templates={templates}
          prefill={prefill}
        />
      )}
    </>
  );
}

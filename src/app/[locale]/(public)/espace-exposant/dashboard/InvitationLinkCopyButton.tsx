'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

/**
 * P5.x.16 — bouton "Copier le lien d'invitation" dans la section
 * "Invitez vos clients" du dashboard espace exposant.
 *
 * On accepte `text` en prop plutot que de reconstruire l'URL pour
 * eviter une duplication de logique entre Server (qui forge l'URL
 * pour l'affichage) et Client (qui doit copier la meme).
 */
export function InvitationLinkCopyButton({ text }: { text: string }) {
  const t = useTranslations('espaceExposant.dashboard.invitation');
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Best-effort : si navigator.clipboard indispo, on reste silencieux.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden />
          {t('linkCopied')}
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden />
          {t('linkCopy')}
        </>
      )}
    </Button>
  );
}

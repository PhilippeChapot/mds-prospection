'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export function SignatureCopyButton({ html }: { html: string }) {
  const t = useTranslations('espaceExposant.dashboard.commKit');
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback : select via DOM range, sinon silencieux.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden />
          {t('signatureCopied')}
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden />
          {t('signatureCopy')}
        </>
      )}
    </Button>
  );
}

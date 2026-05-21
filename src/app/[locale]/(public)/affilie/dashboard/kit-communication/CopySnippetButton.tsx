'use client';

/**
 * P7.x.1.C — bouton "Copier" generique pour le kit comm affilie.
 *
 * Variante de CopyLinkButton (P7.x.1.B section tracking) mais accepte
 * n'importe quel texte (HTML signature, copy email, etc.), pas juste
 * une URL.
 */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  labelCopy: string;
  labelCopied: string;
}

export function CopySnippetButton({ value, labelCopy, labelCopied }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      type="button"
      onClick={handleCopy}
      variant="outline"
      size="sm"
      className={cn('gap-1.5', copied ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : '')}
      aria-live="polite"
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden /> {labelCopied}
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden /> {labelCopy}
        </>
      )}
    </Button>
  );
}

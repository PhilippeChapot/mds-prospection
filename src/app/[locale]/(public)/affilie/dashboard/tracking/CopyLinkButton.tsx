'use client';

/**
 * P7.x.1.B — bouton "Copier le lien" pour la section tracking affilie.
 *
 * Utilise navigator.clipboard avec fallback inline-textarea pour les
 * navigateurs sans support (rare en 2026 mais defensif). Apres copie,
 * change le label "Copier" -> "Copié !" pendant 2 secondes.
 */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  url: string;
  labelCopy: string;
  labelCopied: string;
}

export function CopyLinkButton({ url, labelCopy, labelCopied }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback : pose une textarea cachee + execCommand('copy').
      const ta = document.createElement('textarea');
      ta.value = url;
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
      className={cn(
        'shrink-0 gap-1.5',
        copied ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : '',
      )}
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

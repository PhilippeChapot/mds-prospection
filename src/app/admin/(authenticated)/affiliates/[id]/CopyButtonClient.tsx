'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyButtonClient({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Pas de toast — fallback silencieux. L'admin peut copier manuellement.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {copied ? (
        <>
          <Check className="size-4" aria-hidden />
          Copié
        </>
      ) : (
        <>
          <Copy className="size-4" aria-hidden />
          Copier
        </>
      )}
    </Button>
  );
}

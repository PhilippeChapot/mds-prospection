'use client';

/**
 * P16.x.PreProgrammeTeaser — bouton super_admin « Aperçu pré-programme ».
 * Affiche les liens privés FR/EN (token) + copie. Les URLs sont calculées
 * côté serveur (le token n'est jamais exposé au bundle client).
 */

import { useState } from 'react';
import { Eye, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PreProgrammePreviewButton({
  urlFr,
  urlEn,
}: {
  urlFr: string | null;
  urlEn: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'fr' | 'en' | null>(null);

  function copy(url: string, which: 'fr' | 'en') {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const configured = Boolean(urlFr && urlEn);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        title={configured ? undefined : 'Configurez PREPROGRAMME_TOKEN'}
      >
        <Eye className="size-4" aria-hidden /> Aperçu pré-programme
      </Button>
      {open && (
        <div className="border-md-border absolute right-0 z-20 mt-2 w-80 space-y-3 rounded-xl border bg-white p-4 shadow-lg">
          {!configured ? (
            <p className="text-md-text-muted text-xs">
              Définissez <code>PREPROGRAMME_TOKEN</code> (env Vercel) pour générer les liens.
            </p>
          ) : (
            (['fr', 'en'] as const).map((loc) => {
              const url = loc === 'fr' ? urlFr! : urlEn!;
              return (
                <div key={loc} className="space-y-1">
                  <div className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
                    Lien {loc.toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-md-blue flex-1 truncate text-xs hover:underline"
                    >
                      {url}
                    </a>
                    <button
                      type="button"
                      onClick={() => copy(url, loc)}
                      className="text-md-text-muted hover:text-md-text shrink-0"
                      title="Copier"
                    >
                      {copied === loc ? (
                        <Check className="size-4 text-emerald-600" aria-hidden />
                      ) : (
                        <Copy className="size-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

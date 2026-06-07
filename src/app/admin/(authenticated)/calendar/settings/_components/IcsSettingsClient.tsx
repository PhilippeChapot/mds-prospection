'use client';

/**
 * P14.1.SalesCalendarCore (Commit 5) — composant client settings .ics.
 *
 * Affiche :
 *   - URL .ics (input read-only + bouton copy clipboard).
 *   - Bouton "Régénérer l'URL" avec confirm dialog.
 *   - Instructions Apple / Google Calendar.
 *
 * L URL est privee : ne pas la partager. Si compromise, regenerer pour
 * invalider l ancienne.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Copy, RefreshCw, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { regenerateIcsTokenAction } from '@/lib/admin/calendar/ics-token-actions';

interface Props {
  initialUrl: string | null;
  initialError: string | null;
}

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  'https://www.mediadays.solutions';

export function IcsSettingsClient({ initialUrl, initialError }: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(initialError);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('URL copiée dans le presse-papier.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copie échouée. Sélectionne l'URL manuellement.");
    }
  }

  function handleRegenerate() {
    if (!confirm("Régénérer l'URL invalidera l'ancienne. Continuer ?")) return;
    startTransition(async () => {
      setError(null);
      const r = await regenerateIcsTokenAction();
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      const newUrl = `${BASE_URL}/api/calendar/ics/${r.token}`;
      setUrl(newUrl);
      toast.success("Nouvelle URL générée. L'ancienne est désactivée.");
    });
  }

  return (
    <div className="space-y-4">
      {/* Card principale */}
      <section className="border-md-border bg-card rounded-lg border p-5 shadow-sm">
        <h2 className="text-md-blue-dark mb-2 text-sm font-bold tracking-wide uppercase">
          Ton URL de synchronisation
        </h2>
        {error && (
          <p className="border-md-danger/40 bg-md-danger/10 text-md-danger mb-3 rounded-md border px-3 py-2 text-sm">
            ⚠️ {error}
          </p>
        )}

        {url ? (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                readOnly
                value={url}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="border-md-border bg-md-bg-soft min-w-0 flex-1 truncate rounded-md border px-3 py-2 font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopy}
                disabled={pending}
              >
                {copied ? (
                  <Check className="mr-1 size-3 text-emerald-600" />
                ) : (
                  <Copy className="mr-1 size-3" />
                )}
                {copied ? 'Copié' : 'Copier'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                disabled={pending}
                className="text-amber-700 hover:bg-amber-50"
              >
                <RefreshCw className={`mr-1 size-3 ${pending ? 'animate-spin' : ''}`} />
                Régénérer
              </Button>
            </div>
            <p className="text-md-text-muted mt-2 text-xs">
              ⚠️ L&apos;URL est privée. Ne la partage pas. Si tu la suspectes compromise, clique sur
              « Régénérer » pour invalider l&apos;ancienne.
            </p>
          </>
        ) : (
          <p className="text-md-text-muted text-sm">URL indisponible.</p>
        )}
      </section>

      {/* Instructions Apple/Google */}
      <section className="border-md-border bg-card rounded-lg border p-5 shadow-sm">
        <h2 className="text-md-blue-dark mb-3 text-sm font-bold tracking-wide uppercase">
          Comment s&apos;abonner
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-md-text mb-1 text-sm font-semibold">🍎 Apple Calendar</h3>
            <ol className="text-md-text-muted list-decimal space-y-1 pl-5 text-xs leading-relaxed">
              <li>
                Menu <strong>Fichier &gt; Nouvel abonnement de calendrier…</strong>
              </li>
              <li>Colle l&apos;URL ci-dessus.</li>
              <li>Choisis la fréquence de mise à jour (toutes les 15 min recommandé).</li>
            </ol>
          </div>
          <div>
            <h3 className="text-md-text mb-1 text-sm font-semibold">🟢 Google Calendar</h3>
            <ol className="text-md-text-muted list-decimal space-y-1 pl-5 text-xs leading-relaxed">
              <li>
                <a
                  href="https://calendar.google.com/calendar/r/settings/addbyurl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-md-blue hover:underline"
                >
                  Paramètres &gt; Ajouter un calendrier &gt; À partir de l&apos;URL
                  <ExternalLink className="ml-0.5 inline size-3" />
                </a>
              </li>
              <li>Colle l&apos;URL.</li>
              <li>Le calendrier apparaîtra dans « Autres agendas ».</li>
            </ol>
          </div>
        </div>
        <p className="text-md-text-muted mt-4 text-xs">
          Note : la synchronisation est <strong>en lecture seule</strong>. Pour créer ou modifier
          des évènements, utilise{' '}
          <Link href="/admin/calendar" className="text-md-blue hover:underline">
            /admin/calendar
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

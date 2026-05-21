'use client';

/**
 * Form de demande de magic-link affilie — P7.x.1.A
 *
 * POST /api/affilie/request-magic-link. Response generique anti-enum :
 * on affiche toujours le meme message "Si l'email est connu, vous allez
 * recevoir un lien dans quelques instants".
 */

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AffilieRequestMagicLinkForm() {
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/affilie/request-magic-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, locale }),
        });
        if (res.status === 429) {
          setErrorMsg('Trop de demandes. Réessayez dans une heure.');
          return;
        }
        if (!res.ok) {
          setErrorMsg('Une erreur est survenue. Réessayez dans un instant.');
          return;
        }
        setSubmitted(true);
      } catch {
        setErrorMsg('Impossible de joindre le serveur. Vérifiez votre connexion.');
      }
    });
  }

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-900"
      >
        Si cet email est connu, vous allez recevoir un lien d&apos;accès dans quelques instants.
        Vérifiez également vos spams.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div>
        <Label htmlFor="affilie-email">Email partenaire</Label>
        <Input
          id="affilie-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@votre-media.com"
          disabled={pending}
        />
      </div>
      {errorMsg ? <p className="text-md-magenta text-xs">{errorMsg}</p> : null}
      <Button
        type="submit"
        disabled={pending || !email.trim()}
        className="bg-md-magenta hover:bg-md-magenta-soft w-full"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            Envoi…
          </>
        ) : (
          'Recevoir mon lien d’accès'
        )}
      </Button>
    </form>
  );
}

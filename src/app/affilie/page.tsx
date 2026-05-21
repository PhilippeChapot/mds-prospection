/**
 * Landing Espace Affilie — P7.x.1.A
 *
 * Server Component qui rend :
 *   - un bandeau d'erreur si `?error=...` (expired/invalid/session_missing)
 *   - un message succes si `?signed_out=1` (apres POST /api/affilie/logout)
 *   - le formulaire de demande de magic-link (RequestMagicLinkForm client)
 */

import { Suspense } from 'react';
import { Mail } from 'lucide-react';
import { AffilieRequestMagicLinkForm } from './RequestMagicLinkForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Espace Affilié · MediaDays Solutions 2026' };

interface PageProps {
  searchParams: Promise<{ error?: string; signed_out?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  expired: 'Votre lien d’accès a expiré (validité 15 min). Demandez-en un nouveau ci-dessous.',
  invalid: 'Lien d’accès invalide. Demandez-en un nouveau ci-dessous.',
  session_missing:
    'Vous devez être connecté pour accéder à cet espace. Demandez votre lien d’accès ci-dessous.',
  generic: 'Une erreur est survenue. Réessayez dans un instant.',
};

export default async function AffilieLandingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const errorMsg = sp.error ? (ERROR_MESSAGES[sp.error] ?? ERROR_MESSAGES.generic) : null;
  const signedOut = sp.signed_out === '1';

  return (
    <main className="bg-md-bg flex min-h-svh items-center justify-center px-4 py-12">
      <div className="bg-card border-md-border w-full max-w-md rounded-2xl border p-8 shadow-md">
        <div className="mb-6 text-center">
          <div className="bg-md-magenta/10 text-md-magenta mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-full">
            <Mail className="size-5" aria-hidden />
          </div>
          <h1 className="text-md-blue-dark text-2xl font-extrabold tracking-tight">
            Espace Affilié
          </h1>
          <p className="text-md-text-muted mt-1 text-sm">
            MediaDays Solutions 2026 · Programme partenaires
          </p>
        </div>

        {errorMsg ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {errorMsg}
          </div>
        ) : null}
        {signedOut ? (
          <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            Vous avez été déconnecté. Demandez un nouveau lien pour revenir.
          </div>
        ) : null}

        <Suspense fallback={null}>
          <AffilieRequestMagicLinkForm />
        </Suspense>

        <p className="text-md-text-muted mt-6 text-center text-[11px]">
          Vous n’êtes pas affilié MediaDays ? Contactez-nous sur{' '}
          <a href="mailto:contact@mediadays.solutions" className="text-md-magenta hover:underline">
            contact@mediadays.solutions
          </a>
        </p>
      </div>
    </main>
  );
}

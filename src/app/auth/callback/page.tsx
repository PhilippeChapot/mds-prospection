'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * /auth/callback — entry point pour les liens auth Supabase
 * (recovery email + magic link).
 *
 * Le hash fragment (`#access_token=...&type=recovery`) n'est PAS envoye au
 * serveur, donc cette page DOIT etre un client component qui lit
 * `window.location.hash` au mount.
 *
 * Flow :
 *   - type=recovery -> redirect /auth/reset-password (preserve le hash)
 *   - type=magiclink -> setSession + redirect /admin
 *   - type absent ou invalide -> /admin/login?error=invalid_callback
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) {
      router.replace('/admin/login?error=invalid_callback');
      return;
    }

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (!accessToken || !refreshToken || !type) {
      router.replace('/admin/login?error=invalid_callback');
      return;
    }

    if (type === 'recovery') {
      // On preserve le hash pour que /auth/reset-password puisse setSession.
      window.location.replace(`/auth/reset-password${hash}`);
      return;
    }

    if (type === 'magiclink' || type === 'signup' || type === 'invite') {
      const supabase = createSupabaseBrowserClient();
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: setErr }) => {
          if (setErr) {
            setError(setErr.message);
            setTimeout(() => router.replace('/admin/login?error=invalid_callback'), 1500);
            return;
          }
          router.replace('/admin');
        })
        .catch((err: Error) => {
          setError(err.message);
          setTimeout(() => router.replace('/admin/login?error=invalid_callback'), 1500);
        });
      return;
    }

    router.replace('/admin/login?error=invalid_callback');
  }, [router]);

  return (
    <main className="from-md-blue-deep via-md-blue-dark to-md-blue flex min-h-svh items-center justify-center bg-gradient-to-br">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white shadow-2xl backdrop-blur-sm">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-hidden />
        <p className="mt-3 text-sm">Vérification du lien…</p>
        {error && <p className="text-md-danger-foreground mt-2 text-xs">{error}</p>}
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HeaderLogo } from '@/components/brand/HeaderLogo';

const MIN_LENGTH = 8;

type Phase = 'loading' | 'ready' | 'submitting' | 'done' | 'error';

/**
 * /auth/reset-password — atterrissage apres click sur le lien recovery
 * Supabase. Le hash fragment contient access_token + refresh_token (type
 * recovery) qu'on utilise pour setSession() avant l'updateUser({ password }).
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // Au mount : extrait le hash, set la session recovery.
  // Toute la logique est dans un setTimeout(0) async pour respecter
  // react-hooks/set-state-in-effect (pas de setState sync dans le body).
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) {
        if (!cancelled) {
          setPhase('error');
          setError('Lien invalide ou expiré.');
        }
        return;
      }
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) {
        if (!cancelled) {
          setPhase('error');
          setError('Lien invalide ou expiré.');
        }
        return;
      }

      const supabase = createSupabaseBrowserClient();
      try {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (setErr) {
          setPhase('error');
          setError(setErr.message);
          return;
        }
        setPhase('ready');
        window.history.replaceState(null, '', '/auth/reset-password');
      } catch (err) {
        if (!cancelled) {
          setPhase('error');
          setError((err as Error).message);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Le mot de passe doit faire au moins ${MIN_LENGTH} caractères.`);
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setPhase('submitting');
    const supabase = createSupabaseBrowserClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setPhase('ready');
      setError(updateErr.message);
      return;
    }
    setPhase('done');
    setTimeout(() => router.replace('/admin/login?reset=ok'), 1500);
  }

  return (
    <main className="from-md-blue-deep via-md-blue-dark to-md-blue flex min-h-svh flex-col bg-gradient-to-br">
      <header className="px-6 pt-8 sm:px-10">
        <HeaderLogo theme="dark" size={36} />
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <span className="text-md-magenta-soft text-xs font-bold tracking-[0.2em] uppercase">
              Nouveau mot de passe
            </span>
            <h1 className="mt-2 font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-white">
              Réinitialisation
            </h1>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            {phase === 'loading' && (
              <div className="flex items-center justify-center gap-2 text-white/80">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Initialisation…
              </div>
            )}

            {phase === 'error' && (
              <div className="space-y-3 text-center text-white">
                <AlertCircle className="text-md-danger mx-auto h-8 w-8" aria-hidden />
                <p className="text-sm">{error ?? 'Lien invalide ou expiré.'}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => router.replace('/auth/forgot-password')}
                >
                  Demander un nouveau lien
                </Button>
              </div>
            )}

            {phase === 'done' && (
              <div className="space-y-2 text-center text-white">
                <CheckCircle2 className="text-md-success mx-auto h-8 w-8" aria-hidden />
                <p className="text-sm">Mot de passe mis à jour. Redirection…</p>
              </div>
            )}

            {(phase === 'ready' || phase === 'submitting') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-white/90">
                    Nouveau mot de passe
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_LENGTH}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="focus-visible:ring-md-magenta/60 border-white/15 bg-white/10 text-white placeholder:text-white/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-white/90">
                    Confirmation
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_LENGTH}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="focus-visible:ring-md-magenta/60 border-white/15 bg-white/10 text-white placeholder:text-white/40"
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="border-md-danger/40 bg-md-danger/15 text-md-danger-foreground rounded-md border px-3 py-2 text-sm"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={phase === 'submitting'}
                >
                  {phase === 'submitting' ? 'Mise à jour…' : 'Mettre à jour'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

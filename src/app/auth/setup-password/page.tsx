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
 * /auth/setup-password — P5.x.1-ter.
 *
 * Atterrissage après clic sur le lien d'invitation Supabase (type=invite).
 * Le hash fragment contient access_token + refresh_token qu'on utilise pour
 * setSession() avant l'updateUser({ password }).
 *
 * Une fois le password set → router vers /admin?invited=1 qui affiche la
 * bannière welcome <WelcomeInvitedBanner> personnalisée selon la langue
 * du user (cf. P5.x.1-bis).
 *
 * Clone du flow reset-password mais avec wording "première activation".
 */
export default function SetupPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailHint, setEmailHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) {
        if (!cancelled) {
          setPhase('error');
          setError(
            'Lien invalide ou expiré. Demandez à votre super-administrateur de vous renvoyer une invitation.',
          );
        }
        return;
      }
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');
      if (!accessToken || !refreshToken) {
        if (!cancelled) {
          setPhase('error');
          setError('Lien invalide ou expiré.');
        }
        return;
      }

      const supabase = createSupabaseBrowserClient();
      try {
        const { data, error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (setErr) {
          setPhase('error');
          setError(setErr.message);
          return;
        }
        if (data.user?.email) setEmailHint(data.user.email);
        // P5.x.1-ter — idempotence : si l'utilisateur a déjà un password
        // (re-clic accidentel sur l'invite, ou flow de connexion magic link
        // pour un user déjà actif), on saute le formulaire et on va direct
        // sur /admin. Supabase ne dévoile pas directement `encrypted_password`,
        // mais `user_metadata.password_set` peut être lu — si le flag n'existe
        // pas (cas legacy), on reste sur la page (l'updateUser sera idempotent).
        const passwordSet =
          data.user?.user_metadata && data.user.user_metadata.password_set === true;
        if (passwordSet) {
          window.location.replace('/admin?invited=1');
          return;
        }
        setPhase('ready');
        window.history.replaceState(null, '', '/auth/setup-password');
        // L'effet est intentionnellement informatif (acceptable cascade ici :
        // setSession est asynchrone, on transitionne ensuite de 'loading'
        // vers 'ready' une fois la session bien établie).
        void (type ?? '');
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
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Le mot de passe doit contenir au moins une majuscule et un chiffre.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setPhase('submitting');
    const supabase = createSupabaseBrowserClient();
    // updateUser pose le password + flag user_metadata.password_set=true
    // pour que les futurs clics du lien d'invitation sautent ce formulaire.
    const { error: updateErr } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    });
    if (updateErr) {
      setPhase('ready');
      setError(updateErr.message);
      return;
    }
    setPhase('done');
    setTimeout(() => router.replace('/admin?invited=1'), 1200);
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
              Bienvenue
            </span>
            <h1 className="mt-2 font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-white">
              Activez votre compte
            </h1>
            {emailHint && (
              <p className="mt-2 text-sm text-white/70">
                <span className="font-mono">{emailHint}</span>
              </p>
            )}
            <p className="mt-3 text-sm text-white/70">
              Choisissez un mot de passe pour finaliser la création de votre compte sur
              MediaDays&nbsp;Solutions Prospection.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            {phase === 'loading' && (
              <div className="flex items-center justify-center gap-2 text-white/80">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Vérification du lien…
              </div>
            )}

            {phase === 'error' && (
              <div className="space-y-3 text-center text-white">
                <AlertCircle className="text-md-danger mx-auto h-8 w-8" aria-hidden />
                <p className="text-sm">{error ?? 'Lien invalide ou expiré.'}</p>
                <p className="text-xs text-white/60">
                  Demandez à votre super-administrateur de vous renvoyer une invitation depuis{' '}
                  <code className="text-white">/admin/users</code>.
                </p>
              </div>
            )}

            {phase === 'done' && (
              <div className="space-y-2 text-center text-white">
                <CheckCircle2 className="text-md-success mx-auto h-8 w-8" aria-hidden />
                <p className="text-sm">Compte activé. Redirection…</p>
              </div>
            )}

            {(phase === 'ready' || phase === 'submitting') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-white/90">
                    Mot de passe
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
                  <p className="text-[11px] text-white/60">
                    Min. 8 caractères, 1 majuscule, 1 chiffre.
                  </p>
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
                  {phase === 'submitting' ? 'Activation…' : 'Activer mon compte'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

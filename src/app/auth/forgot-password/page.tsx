'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HeaderLogo } from '@/components/brand/HeaderLogo';

type Phase = 'idle' | 'submitting' | 'sent' | 'error';

/**
 * /auth/forgot-password — formulaire email pour declencher un mail
 * recovery Supabase. Le mail pointe vers /auth/callback (whitelist
 * Supabase Auth Settings cote dashboard).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;

    setPhase('submitting');
    const supabase = createSupabaseBrowserClient();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${baseUrl}/auth/callback`,
    });

    if (resetErr) {
      setPhase('error');
      setError(resetErr.message);
      return;
    }
    setPhase('sent');
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
              Mot de passe oublié
            </span>
            <h1 className="mt-2 font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight text-white">
              Réinitialisation
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Saisissez votre email pour recevoir un lien de réinitialisation.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            {phase === 'sent' ? (
              <div className="space-y-3 text-center text-white">
                <CheckCircle2 className="text-md-success mx-auto h-10 w-10" aria-hidden />
                <p className="text-sm">
                  Email envoyé à <strong>{email}</strong>.
                  <br />
                  Vérifiez votre boîte (et vos spams) — le lien est valable 1 heure.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/admin/login">
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Retour à la connexion
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-white/90">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@editions-hf.fr"
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
                  {phase === 'submitting' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Envoi…
                    </>
                  ) : (
                    'Envoyer le lien de réinitialisation'
                  )}
                </Button>

                <Link
                  href="/admin/login"
                  className="block text-center text-xs text-white/60 hover:text-white/90"
                >
                  ← Retour à la connexion
                </Link>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signInAction, type SignInState } from './actions';

const initialState: SignInState = {};

export function LoginForm({ next, prefilledError }: { next: string; prefilledError?: string }) {
  const [state, formAction] = useActionState(signInAction, initialState);
  const errorMessage = state.error ?? prefilledError;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-white/90">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="vous@editions-hf.fr"
          className="focus-visible:ring-md-magenta/60 border-white/15 bg-white/10 text-white placeholder:text-white/40"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-white/90">
            Mot de passe
          </Label>
          <span
            aria-disabled="true"
            className="cursor-not-allowed text-xs text-white/40"
            title="Disponible en P5"
          >
            Mot de passe oublie ?
          </span>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="focus-visible:ring-md-magenta/60 border-white/15 bg-white/10 text-white placeholder:text-white/40"
        />
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="border-md-danger/40 bg-md-danger/15 text-md-danger-foreground rounded-md border px-3 py-2 text-sm"
        >
          {errorMessage}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Connexion…' : 'Se connecter'}
    </Button>
  );
}

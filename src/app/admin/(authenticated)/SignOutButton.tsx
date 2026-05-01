'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { signOutAction } from './actions';

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => signOutAction())}
    >
      {pending ? 'Deconnexion…' : 'Se deconnecter'}
    </Button>
  );
}

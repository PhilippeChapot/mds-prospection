'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type SignInState = {
  error?: string;
};

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/admin');

  if (!email || !password) {
    return { error: 'Email et mot de passe requis.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 400 || error.message?.toLowerCase().includes('invalid')) {
      return { error: 'Identifiants incorrects.' };
    }
    if (error.message?.toLowerCase().includes('email not confirmed')) {
      return { error: 'Email non confirme. Contactez l’administrateur.' };
    }
    return { error: 'Connexion impossible. Reessayez dans un instant.' };
  }

  const safeNext = next.startsWith('/admin') ? next : '/admin';
  revalidatePath('/admin', 'layout');
  redirect(safeNext);
}

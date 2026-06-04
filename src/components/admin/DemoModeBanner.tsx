/**
 * P12.x.SuperAdminQuickLogin — bannière "Mode démo" affichée en haut des
 * espaces Affilié et Partenaire QUAND un super_admin est connecté en
 * parallèle dans Supabase Auth.
 *
 * Heuristique : on lit le profil admin via createSupabaseServerClient ;
 * si role='super_admin', on affiche la bannière. Aucun cookie séparé
 * "demo_mode" -- la session admin coexiste naturellement avec la session
 * affilie/partenaire (cookies httpOnly distincts).
 *
 * Server component : pas de 'use client'.
 */

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface Props {
  locale: 'fr' | 'en';
  /** Quel espace est en cours (pour le wording). */
  space: 'affilie' | 'partenaire';
}

export async function DemoModeBanner({ locale, space }: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'super_admin') return null;

  const labels = {
    fr: {
      badge: 'Mode démo',
      body:
        space === 'affilie'
          ? 'Vous êtes connecté en démo sur le compte affilié de test.'
          : 'Vous êtes connecté en démo sur le compte partenaire de test.',
      cta: 'Retour /admin',
    },
    en: {
      badge: 'Demo mode',
      body:
        space === 'affilie'
          ? 'You are logged in as the demo affiliate account.'
          : 'You are logged in as the demo partner account.',
      cta: 'Back to /admin',
    },
  } as const;

  const l = labels[locale];

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-amber-900 px-2 py-0.5 text-[10px] font-bold tracking-widest text-amber-50 uppercase">
          {l.badge}
        </span>
        <span className="font-medium">{l.body}</span>
      </div>
      <Link
        href="/admin"
        className="rounded-md border border-amber-900/30 bg-white/60 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-white"
      >
        {l.cta}
      </Link>
    </div>
  );
}

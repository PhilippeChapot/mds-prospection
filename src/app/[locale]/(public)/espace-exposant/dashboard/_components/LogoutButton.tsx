'use client';

import { LogOut } from 'lucide-react';
import { useLocale } from 'next-intl';

/**
 * P5.x.17-ter — bouton de logout pour l'Espace Exposant V1.3.
 *
 * Pourquoi un form POST plutot qu'un `<Link href="/logout">` :
 *
 *   Next.js prefetche automatiquement les routes pointees par `<Link>`
 *   au hover / visibility, ce qui declenchait un GET /logout des le
 *   render du sidebar -> le cookie de session etait kill avant le
 *   premier clic utilisateur. Diagnostic Vercel logs P5.x.17-bis :
 *     14:26:18 login success
 *     14:26:19 GET /logout (prefetch)
 *     14:26:24 no-cookie -> redirect login
 *
 *   Un `<form method="post">` n'est jamais prefetche -> safe.
 *
 * Cle d'accessibilite : on garde un bouton natif dans un form pour
 * que la nav clavier + screen readers fonctionnent. Style aligne sur
 * les autres items de la sidebar (rounded, icone gauche, hover muted).
 *
 * `onSubmit` n'a pas besoin d'etre intercepte : le serveur fait le
 * redirect vers /espace-exposant apres delete cookie. Le navigateur
 * suit le 303.
 */
interface Props {
  /** Callback optionnel apres click (utile pour fermer le drawer mobile). */
  onLogout?: () => void;
  /** Label localise du bouton ("Se deconnecter" / "Sign out"). */
  label: string;
}

export function LogoutButton({ onLogout, label }: Props) {
  const locale = useLocale();
  return (
    <form action={`/${locale}/espace-exposant/logout`} method="post">
      <button
        type="submit"
        onClick={onLogout}
        className="text-md-text-muted hover:text-md-text hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition"
      >
        <LogOut className="size-4" aria-hidden />
        <span>{label}</span>
      </button>
    </form>
  );
}

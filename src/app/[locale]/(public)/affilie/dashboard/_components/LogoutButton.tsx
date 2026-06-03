'use client';

/**
 * P7.x.1.B — bouton de logout pour l'Espace Affilie.
 *
 * Mirror du LogoutButton espace-partenaire (P5.x.17-ter) : POST form pour
 * eviter le prefetch destructif de <Link>. Le serveur POST /api/affilie/logout
 * efface le cookie + redirect vers /{locale}/affilie?signed_out=1.
 */

import { LogOut } from 'lucide-react';

interface Props {
  /** Callback optionnel apres click (fermer le drawer mobile). */
  onLogout?: () => void;
  label: string;
}

export function AffilieLogoutButton({ onLogout, label }: Props) {
  return (
    <form action="/api/affilie/logout" method="post">
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

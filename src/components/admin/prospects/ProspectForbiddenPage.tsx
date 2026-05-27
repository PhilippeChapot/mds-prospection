import Link from 'next/link';
import { ArrowLeft, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * P5.x.1-quater (bug #3) — page propre quand un Sales tente d'ouvrir une
 * fiche prospect qui ne lui appartient pas.
 *
 * Contexte : depuis /admin/emplacements, un Sales peut cliquer sur un stand
 * assigne a un prospect d'un autre Sales -> 404 Next.js brutal sinon. On lui
 * affiche maintenant un message clair + CTA pour contacter le bon
 * commercial.
 */

export interface ProspectForbiddenPageProps {
  companyName: string;
  ownerFullName: string | null;
  ownerEmail: string | null;
}

export function ProspectForbiddenPage({
  companyName,
  ownerFullName,
  ownerEmail,
}: ProspectForbiddenPageProps) {
  const assignedName = ownerFullName?.trim() || ownerEmail || 'un autre commercial';
  const mailtoSubject = encodeURIComponent(`À propos du prospect ${companyName}`);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      <Link
        href="/admin/prospects"
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à mes prospects
      </Link>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="bg-md-warning/15 rounded-full p-2">
            <Lock className="text-md-warning size-5" aria-hidden />
          </div>
          <div className="flex-1 space-y-2">
            <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-lg font-extrabold tracking-tight">
              Ce prospect n&apos;est pas dans votre portefeuille
            </h1>
            <p className="text-md-text text-sm">
              <strong>{companyName}</strong> est suivi par <strong>{assignedName}</strong>.
            </p>
            <p className="text-md-text-muted text-sm">
              Contactez {assignedName} pour modifier l&apos;attribution ou discuter de cet
              emplacement.
            </p>
            {ownerEmail ? (
              <Button asChild className="mt-3" size="sm">
                <a href={`mailto:${ownerEmail}?subject=${mailtoSubject}`}>
                  <Mail className="size-4" aria-hidden />
                  Contacter {assignedName}
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/prospects">
            <ArrowLeft className="size-4" aria-hidden />
            Retour à mes prospects
          </Link>
        </Button>
      </div>
    </div>
  );
}

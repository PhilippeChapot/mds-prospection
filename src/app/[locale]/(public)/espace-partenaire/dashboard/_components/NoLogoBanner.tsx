import Link from 'next/link';

/**
 * P5.x.18 — banner ambre non-bloquant invitant l'partenaire a uploader
 * son logo avant de telecharger les visuels du kit.
 *
 * Affiche sous deux conditions (cf appelants):
 *   - Section Kit communication (en haut)
 *   - Section Mes invitations (en haut)
 * Uniquement quand `company.logoUrl IS NULL`. Quand un logo est upload,
 * les sections n'incluent simplement plus ce composant.
 *
 * Style : amber-50 / amber-200 / amber-900 (info, pas alarmiste).
 * Pas de dismiss : si l'partenaire le ferme, il oubliera ; on prefere
 * un "nag permanent" tant qu'il n'y a pas de logo.
 *
 * Composant pure-presentation (Server Component) : les libelles + l'URL
 * d'upload sont passes en props pour eviter de mixer `useTranslations`
 * (client) dans une branche server. Les sections appelantes ont deja
 * un `getTranslations` server, donc elles font le lookup et passent les
 * strings ici.
 */
interface Props {
  title: string;
  description: string;
  ctaLabel: string;
  /** URL avec locale prefix + ancre `#logo-uploader` pour scroll-to. */
  uploadHref: string;
}

export function NoLogoBanner({ title, description, ctaLabel, uploadHref }: Props) {
  return (
    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="shrink-0 text-2xl">
          💡
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-semibold text-amber-900">{title}</h3>
          <p className="text-sm text-amber-800">{description}</p>
          <Link
            href={uploadHref}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
          >
            {ctaLabel} →
          </Link>
        </div>
      </div>
    </div>
  );
}

import { PublicTopbar } from '@/components/public/PublicTopbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { VisitorMessageWidgetLoader } from '@/components/chat/VisitorMessageWidgetLoader';

/**
 * Layout publique — wrappe toutes les pages /[locale]/(public)/**.
 * Distinct du layout admin : pas de SeasonProvider, pas de Sidebar.
 *
 * P9.1-natif : messagerie visiteur native. Le loader (async server
 * component) gere la condition d'affichage (db getSetting) ; le layout
 * reste sync pour ne pas casser le prerender SSG des pages legales
 * statiques (cf. /fr/cgv etc., generateStaticParams + dynamicParams=false).
 * La locale est lue cote client par le widget via useLocale() (next-intl).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-md-bg-soft flex min-h-screen flex-col">
      <PublicTopbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      <VisitorMessageWidgetLoader />
    </div>
  );
}

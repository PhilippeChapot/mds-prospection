import { PublicTopbar } from '@/components/public/PublicTopbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { ChatLoader } from '@/components/chat/ChatLoader';

/**
 * Layout publique — wrappe toutes les pages /[locale]/(public)/**.
 * Distinct du layout admin : pas de SeasonProvider, pas de Sidebar.
 *
 * P9.1 : chat visiteur Tawk.to. La condition d'affichage (db getSetting)
 * est isolee dans <ChatLoader> (async server component) pour eviter de
 * rendre ce layout async — sinon les pages legales statiques (`/fr/cgv`
 * etc., generateStaticParams + dynamicParams=false) echouent au
 * prerender build-time avec une lecture DB interdite en SSG.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-md-bg-soft flex min-h-screen flex-col">
      <PublicTopbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      <ChatLoader />
    </div>
  );
}

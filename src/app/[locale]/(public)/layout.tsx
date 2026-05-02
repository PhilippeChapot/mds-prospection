import { PublicTopbar } from '@/components/public/PublicTopbar';
import { PublicFooter } from '@/components/public/PublicFooter';

/**
 * Layout publique — wrappe toutes les pages /[locale]/(public)/**.
 * Distinct du layout admin : pas de SeasonProvider, pas de Sidebar.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-md-bg-soft flex min-h-screen flex-col">
      <PublicTopbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

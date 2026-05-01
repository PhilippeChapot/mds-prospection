import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '@/components/ui/sonner';
import '../globals.css';

/**
 * Root layout pour /admin/**.
 *
 * L'app a deux root layouts (cf. Next 16 multi-root pattern) :
 *   - src/app/[locale]/layout.tsx : public, i18n FR/EN
 *   - src/app/admin/layout.tsx     : admin, FR uniquement, pas de NextIntlProvider
 *
 * La garde auth + role est posee plus bas, dans le route group `(authenticated)`,
 * pour que /admin/login reste accessible aux non-authentifies.
 */

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Admin — MediaDays Solutions 2026',
    template: '%s · Admin MDS',
  },
  description: 'Console admin MDS Prospection.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${montserrat.variable} ${inter.variable} h-full antialiased`}>
      <body className="bg-md-bg text-md-text flex min-h-full flex-col font-sans">
        {children}
        <Toaster richColors position="top-right" />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import '../globals.css';

/**
 * Root layout dedie aux pages /auth/** (setup-password, reset-password,
 * forgot-password, callback).
 *
 * P5.x.1-quater — bug #1 : sans ce layout, les pages /auth/* tombaient
 * sur le fallback Next.js (pas de <html>/<body> stylise, pas d'import
 * globals.css) -> Helvetica brut sans branding MDS.
 *
 * App Router de Next 16 exige <html>/<body> dans un root layout par
 * route group ; ce fichier suit le meme pattern que :
 *   - src/app/[locale]/layout.tsx (public)
 *   - src/app/admin/layout.tsx    (admin)
 *   - src/app/(rsvp)/layout.tsx   (RSVP email)
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
    default: 'Authentification — MediaDays Solutions',
    template: '%s · MediaDays Solutions',
  },
  description: 'Activation de compte / reinitialisation de mot de passe MDS Prospection.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  robots: { index: false, follow: false },
};

export default function AuthRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${montserrat.variable} ${inter.variable} h-full antialiased`}>
      <body className="bg-md-bg text-md-text flex min-h-full flex-col font-sans">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}

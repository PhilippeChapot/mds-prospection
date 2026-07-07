import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Inter, Montserrat } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';
import '../globals.css';

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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';

const TITLE = 'MediaDays Solutions 2026 · Paris Radio Show';
const DESCRIPTION =
  "MediaDays Solutions 2026 : le rendez-vous des professionnels des médias — Paris, Marseille, Bruxelles. Le Paris Radio Show s'enrichit avec MediaDays Solutions. Radio, podcast, vidéo, adtech, DOOH, retail media.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    template: '%s — MediaDays Solutions 2026',
  },
  description: DESCRIPTION,
  keywords: [
    'MediaDays Solutions',
    'Paris Radio Show',
    'PRS 2026',
    'radio',
    'podcast',
    'adtech',
    'DOOH',
    'CTV',
    'retail media',
    'Carrousel du Louvre',
    'salon médias professionnels',
    'audio broadcasting',
  ],
  authors: [{ name: 'Editions HF', url: APP_URL }],
  creator: 'Editions HF',
  publisher: 'Editions HF',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    languages: {
      'fr-FR': '/fr',
      'en-US': '/en',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    alternateLocale: ['en_US'],
    url: APP_URL,
    siteName: 'MediaDays Solutions',
    title: TITLE,
    description: 'Le rendez-vous des professionnels des médias — Paris, Marseille, Bruxelles.',
    images: [
      {
        url: '/og/og-image-mds-2026.png',
        width: 1200,
        height: 630,
        alt: 'MediaDays Solutions 2026',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: 'Le rendez-vous des professionnels des médias — Paris, Marseille, Bruxelles.',
    images: ['/og/og-image-mds-2026.png'],
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${montserrat.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <NextIntlClientProvider locale={locale}>
          {children}
          <Toaster richColors position="top-right" />
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import '../globals.css';

/**
 * Root layout dedie aux pages RSVP standalone (/merci-oui, /merci-non).
 *
 * Pourquoi un layout separe :
 *   - Ces pages sont liees depuis les emails Brevo (campagne 858) et ne
 *     doivent pas passer par next-intl ([locale]) ni par le shell layout
 *     marketing (header/footer/cookies).
 *   - App Router de Next.js exige <html>/<body> dans un root layout par
 *     route group ; sans ca on a "Missing <html> and <body> tags in the
 *     root layout." en runtime.
 *
 * Les routes /merci-oui et /merci-non sont aussi exclues du proxy
 * next-intl (cf. src/proxy.ts matcher) pour eviter une redirection vers
 * /fr/merci-oui inexistante.
 */

export const metadata: Metadata = {
  title: 'MediaDays Solutions',
};

export default function RsvpRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

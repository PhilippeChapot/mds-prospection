import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { getMyPreferencesAction } from '@/lib/admin/contact-preferences/actions';
import { requireContactSession } from '@/lib/espace-exposant/session';
import { PreferencesEmailForm } from './PreferencesEmailForm';

export const metadata = { title: 'Préférences email' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

/**
 * P8.2 — page self-service "Mes préférences email" pour le contact
 * connecte. Affiche les 7 categories avec Switch + respect des locks
 * admin (Switch grise pour les prefs locked).
 *
 * Reutilise les actions P8.1 :
 *   - getMyPreferencesAction (charge la row)
 *   - updateMyPreferencesAction (self update, trigger DB enforce locks)
 *   - unsubscribeAllAction / resubscribeAction (RGPD)
 */
export default async function PreferencesEmailPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const localeSafe = locale === 'en' ? 'en' : 'fr';

  // Ensure session avant le fetch (sinon redirect).
  const session = await requireContactSession(localeSafe);
  const prefs = await getMyPreferencesAction({ locale: localeSafe });

  return <PreferencesEmailForm locale={localeSafe} contactId={session.contactId} initial={prefs} />;
}

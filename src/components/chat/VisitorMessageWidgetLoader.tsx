import { getSetting } from '@/lib/admin/preferences/get-setting';
import { ContactMessageWidget } from './ContactMessageWidget';

/**
 * P9.1-natif — async server component qui lit le toggle
 * `visitor_chat_enabled` dans app_settings et monte
 * <ContactMessageWidget> (client) uniquement si activé.
 *
 * Isole en server component separe pour ne PAS rendre le PublicLayout
 * async — sinon les pages legales statiques `/fr/cgv` etc.
 * (generateStaticParams + dynamicParams=false) echouent au prerender
 * build-time avec une lecture DB interdite en SSG.
 */
export async function VisitorMessageWidgetLoader() {
  const enabled = await getSetting<boolean>('visitor_chat_enabled', true);
  if (enabled !== true) return null;
  return <ContactMessageWidget />;
}

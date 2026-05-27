import { getSetting } from '@/lib/admin/preferences/get-setting';
import { TawkWidget } from './TawkWidget';

/**
 * P9.1 — server component qui charge les settings Tawk.to (chat_widget_enabled
 * + tawk_property_id + tawk_widget_id) et monte <TawkWidget> uniquement si
 * la config est complete.
 *
 * Pourquoi un composant separe : le PublicLayout doit rester synchrone
 * (sinon les pages legales statiques `/fr/cgv` etc., qui ont
 * `generateStaticParams` + `dynamicParams=false`, echouent au prerender
 * build-time car le layout async tente une lecture DB que SSG ne permet
 * pas). Ce loader, lui, peut etre async — Next.js le suspend
 * independamment, sans bloquer la page statique parente.
 */
export async function ChatLoader() {
  const [chatEnabled, propertyId, widgetId] = await Promise.all([
    getSetting<boolean>('chat_widget_enabled', false),
    getSetting<string>('tawk_property_id', ''),
    getSetting<string>('tawk_widget_id', ''),
  ]);

  const showChat = chatEnabled === true && !!propertyId && !!widgetId;
  if (!showChat) return null;
  return <TawkWidget propertyId={propertyId!} widgetId={widgetId!} />;
}

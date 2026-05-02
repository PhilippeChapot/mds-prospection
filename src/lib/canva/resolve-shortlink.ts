/**
 * Canva shortlink resolver.
 *
 * Les liens `https://canva.link/<id>` sont des shortlinks qui repondent en
 * 301/302 vers une URL longue de la forme :
 *   https://www.canva.com/design/<DESIGN_ID>/<HASH>/view
 *
 * Pour pouvoir embed Canva dans une iframe, il faut l'URL longue + suffix
 * `?embed`. On resout le shortlink une fois (au build / via script) et on
 * stocke le resultat dans `app_settings.canva_md26_plan_url`.
 *
 * Phil peut updater la valeur via SQL si Canva change l'URL :
 *   UPDATE app_settings
 *   SET value = '"https://www.canva.com/design/.../view"'::jsonb,
 *       updated_at = now()
 *   WHERE key = 'canva_md26_plan_url';
 */

export interface ResolveShortlinkResult {
  resolvedUrl: string;
  embedUrl: string;
  hops: number;
}

const MAX_HOPS = 5;

export async function resolveCanvaShortlink(shortlink: string): Promise<ResolveShortlinkResult> {
  let currentUrl = shortlink;
  let hops = 0;

  while (hops < MAX_HOPS) {
    const response = await fetch(currentUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'user-agent': 'mds-prospection/0.4 (resolve-canva-shortlink)',
      },
    });

    // 200 ou 304 = on ne suit plus, l'URL courante est l'URL finale.
    if (response.status === 200 || response.status === 304) {
      break;
    }

    // Redirection : on suit Location.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Canva shortlink redirected without Location header (${response.status})`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      hops += 1;
      continue;
    }

    throw new Error(
      `Canva shortlink resolution failed with status ${response.status} at hop ${hops}`,
    );
  }

  if (hops === MAX_HOPS) {
    throw new Error(`Canva shortlink redirect chain exceeded ${MAX_HOPS} hops`);
  }

  // Suffixer ?embed pour l'iframe-mode Canva.
  const url = new URL(currentUrl);
  if (!url.searchParams.has('embed')) {
    url.searchParams.set('embed', '');
  }

  return {
    resolvedUrl: currentUrl,
    embedUrl: url.toString(),
    hops,
  };
}

export const CANVA_PLAN_SETTINGS_KEY = 'canva_md26_plan_url';

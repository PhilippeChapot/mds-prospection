'use client';

import Script from 'next/script';

/**
 * P9.1 — widget Tawk.to (chat visiteur) injecte uniquement sur les pages
 * publiques (/[locale]/(public)/**) ; absent de /admin et de l'espace
 * exposant (le chat interne staff arrive en P9.2 via Supabase Realtime).
 *
 * Le rendu est conditionne cote serveur dans le PublicLayout : si
 * `chat_widget_enabled=false` ou si propertyId/widgetId sont vides,
 * <TawkWidget> n'est pas monte du tout. On peut donc ici supposer que
 * les ids sont non vides.
 *
 * `strategy="lazyOnload"` : on attend l'idle browser pour ne pas
 * impacter le LCP de la landing (le chat n'est jamais critique au-dessus
 * du fold). Tawk.to gere son propre rendu une fois charge.
 */
export function TawkWidget({ propertyId, widgetId }: { propertyId: string; widgetId: string }) {
  return (
    <Script
      id="tawk-to-widget"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{
        __html: `
          var Tawk_API = Tawk_API || {}, Tawk_LoadStart = new Date();
          (function(){
            var s1 = document.createElement("script"),
                s0 = document.getElementsByTagName("script")[0];
            s1.async = true;
            s1.src = 'https://embed.tawk.to/${propertyId}/${widgetId}';
            s1.charset = 'UTF-8';
            s1.setAttribute('crossorigin', '*');
            s0.parentNode.insertBefore(s1, s0);
          })();
        `,
      }}
    />
  );
}

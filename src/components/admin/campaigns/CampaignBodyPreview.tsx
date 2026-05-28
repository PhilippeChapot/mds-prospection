'use client';

import { useMemo } from 'react';
import { renderMdsEmailHtml } from '@/lib/email/templates/mds-wrapper';
import { personalize, type CampaignRecipient } from '@/lib/brevo/send-campaign';

/**
 * P8.3-ter — preview live du rendu final d'un body de campagne.
 *
 * Pipeline mirroir de l'envoi reel :
 *   1. personalize() substitue {prenom}/{societe}/{etape} avec un
 *      sampleContact (par defaut "Prénom Démo", "Société Démo").
 *   2. renderMdsEmailHtml() wrappe dans l'enveloppe MDS branded (P8.3-bis).
 *   3. Affichage dans un <iframe> sandboxed pour isoler les styles email
 *      (Tailwind du parent ne pollue pas le rendu).
 *
 * Le preview se met a jour live a chaque changement du body (React
 * re-render le srcDoc).
 */

interface Props {
  /** Body HTML actuel (depuis l'editeur, avant perso et wrapper). */
  bodyHtml: string;
  /** Subject (affiche dans le header du wrapper). */
  subject: string;
  /** Locale pour les wordings footer / preferences. */
  locale: 'fr' | 'en';
  /** App base URL pour les liens du footer. Defaut public env. */
  appUrl?: string;
  /** Contact sample pour la substitution placeholder. */
  sampleContact?: Partial<CampaignRecipient>;
}

const DEFAULT_SAMPLE: CampaignRecipient = {
  contact_id: 'demo',
  email: 'demo@mediadays.solutions',
  first_name: 'Prénom Démo',
  last_name: 'Démo',
  company_name: 'Société Démo',
  language: 'FR',
};

export function CampaignBodyPreview({ bodyHtml, subject, locale, appUrl, sampleContact }: Props) {
  const srcDoc = useMemo(() => {
    const recipient: CampaignRecipient = { ...DEFAULT_SAMPLE, ...sampleContact };
    const personalizedBody = personalize(bodyHtml || '<p></p>', recipient);
    const personalizedSubject = personalize(subject || '(sans sujet)', recipient);
    return renderMdsEmailHtml({
      subject: personalizedSubject,
      bodyHtml: personalizedBody,
      locale,
      appUrl: appUrl ?? 'https://mediadays.solutions',
    });
  }, [bodyHtml, subject, locale, appUrl, sampleContact]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
          Aperçu du rendu final
        </p>
        <p className="text-md-text-muted text-[10px]">
          Variables substituées avec « Prénom Démo / Société Démo »
        </p>
      </div>
      <iframe
        title="Aperçu campagne"
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className="border-md-border w-full rounded-md border bg-white"
        style={{ height: '600px' }}
      />
    </div>
  );
}

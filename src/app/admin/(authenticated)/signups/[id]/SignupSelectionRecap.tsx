/**
 * P5.x.SignupForceConversion — résumé lisible de la sélection étape 2.
 *
 * Server-safe (pas de 'use client') : reçoit les détails addons pré-résolus
 * depuis la page (getSignupAddonsDetails). Affiché toujours quand des addonIds
 * sont présents, indépendamment du status du signup.
 */

import type { AddonDetail } from '@/lib/signup/addon-details';

interface CaseAPayload {
  mode: 'caseA';
  packCode?: string;
  marseilleSelected?: boolean;
  addonIds?: string[];
  paymentPath?: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  devis_sepa: 'Devis + virement SEPA',
  devis_acompte_stripe: 'Devis avec acompte Stripe',
  proforma_acompte: 'Facture pro-forma + acompte',
  facture_integrale: 'Facture intégrale',
};

interface Props {
  payload: unknown;
  addonDetails: AddonDetail[];
}

export function SignupSelectionRecap({ payload, addonDetails }: Props) {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { mode?: string };
  if (p.mode !== 'caseA') return null;
  const a = payload as CaseAPayload;
  const hasAddons = (a.addonIds?.length ?? 0) > 0;
  if (!hasAddons && !a.packCode) return null;

  const totalAddons = addonDetails.reduce((s, d) => s + d.price_eur_ht, 0);

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {a.packCode && (
          <div>
            <dt className="text-md-text-muted mb-0.5 text-[11px] font-semibold tracking-wide uppercase">
              Pack
            </dt>
            <dd className="text-md-text font-medium">{a.packCode}</dd>
          </div>
        )}
        <div>
          <dt className="text-md-text-muted mb-0.5 text-[11px] font-semibold tracking-wide uppercase">
            Salons
          </dt>
          <dd className="text-md-text">Paris{a.marseilleSelected ? ' + Marseille' : ''}</dd>
        </div>
        {a.paymentPath && (
          <div>
            <dt className="text-md-text-muted mb-0.5 text-[11px] font-semibold tracking-wide uppercase">
              Paiement
            </dt>
            <dd className="text-md-text">{PAYMENT_LABEL[a.paymentPath] ?? a.paymentPath}</dd>
          </div>
        )}
      </dl>

      {hasAddons && (
        <div>
          <p className="text-md-text-muted mb-2 text-[11px] font-semibold tracking-wide uppercase">
            Addons sélectionnés ({a.addonIds!.length})
          </p>
          {addonDetails.length > 0 ? (
            <>
              <ul className="space-y-1.5">
                {addonDetails.map((addon) => (
                  <li
                    key={addon.id}
                    className="bg-md-bg-soft flex items-start justify-between gap-3 rounded-md px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{addon.name_fr}</span>
                      {addon.description_fr && (
                        <span className="text-md-text-muted ml-2 text-xs">
                          {addon.description_fr}
                        </span>
                      )}
                    </div>
                    <span className="text-md-text-muted shrink-0 text-xs font-semibold">
                      {addon.price_eur_ht.toLocaleString('fr-FR', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}{' '}
                      € HT
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-md-text-muted mt-2 text-right text-xs">
                Total addons :{' '}
                <strong className="text-md-text">
                  {totalAddons.toLocaleString('fr-FR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{' '}
                  € HT
                </strong>
              </p>
            </>
          ) : (
            <p className="text-md-text-muted text-xs">
              {a.addonIds!.length} addon(s) sélectionné(s) — noms non disponibles (hors saison ?).
              <br />
              <span className="font-mono text-[10px]">{a.addonIds!.join(', ')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

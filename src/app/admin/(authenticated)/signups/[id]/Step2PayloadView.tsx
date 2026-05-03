/**
 * Rendu structure du step2_payload selon mode caseA / caseB.
 * Component server-safe (pas d'interactivite, juste de l'affichage).
 */

import { CheckCircle2, MinusCircle } from 'lucide-react';

interface CaseAPayload {
  mode: 'caseA';
  packCode?: string;
  pricingTierId?: string;
  parisSelected?: boolean;
  marseilleSelected?: boolean;
  boothPreferences?: string[];
  addonIds?: string[];
  paymentPath?: string;
  cgvAccepted?: boolean;
}

interface CaseBPayload {
  mode: 'caseB';
  interests?: string[];
  pole?: string;
  budget?: string;
  message?: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  devis_sepa: 'Devis + virement SEPA',
  devis_acompte_stripe: 'Devis avec acompte Stripe',
  proforma_acompte: 'Facture pro-forma + acompte',
  facture_integrale: 'Facture intégrale',
};

const INTEREST_LABEL: Record<string, string> = {
  stand_6: 'Stand 6 m²',
  stand_12: 'Stand 12 m²',
  sponsor_pole: 'Sponsor pôle',
  visitor: 'Visiteur seulement',
  partner_media: 'Partenariat média',
};

const BUDGET_LABEL: Record<string, string> = {
  '500_5k': '500 € – 5 000 €',
  '5k_15k': '5 000 € – 15 000 €',
  '15k_plus': '15 000 € et plus',
  tbd: 'À discuter',
};

export function Step2PayloadView({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== 'object') {
    return <p className="text-md-text-muted text-sm">Aucune donnée d&apos;étape 2 enregistrée.</p>;
  }

  const p = payload as { mode?: string };
  if (p.mode === 'caseA') {
    return <CaseA payload={payload as CaseAPayload} />;
  }
  if (p.mode === 'caseB') {
    return <CaseB payload={payload as CaseBPayload} />;
  }
  return <RawJson payload={payload} />;
}

function CaseA({ payload }: { payload: CaseAPayload }) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
      <Field label="Pack">{payload.packCode ?? '—'}</Field>
      <Field label="Mode de paiement">
        {payload.paymentPath ? (PAYMENT_LABEL[payload.paymentPath] ?? payload.paymentPath) : '—'}
      </Field>
      <Field label="Salons">
        <ul className="space-y-0.5">
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="text-md-success size-3.5" aria-hidden />
            Paris Radio Show — 15 décembre (inclus)
          </li>
          <li className="flex items-center gap-1.5">
            {payload.marseilleSelected ? (
              <>
                <CheckCircle2 className="text-md-success size-3.5" aria-hidden />
                <span>MediaDays Marseille — 10 décembre (option)</span>
              </>
            ) : (
              <>
                <MinusCircle className="text-md-text-muted size-3.5" aria-hidden />
                <span className="text-md-text-muted">MediaDays Marseille (non choisi)</span>
              </>
            )}
          </li>
        </ul>
      </Field>
      <Field label="Emplacements préférés">
        {payload.boothPreferences && payload.boothPreferences.length > 0 ? (
          <ol className="list-decimal pl-4 font-mono text-xs">
            {payload.boothPreferences.map((pref, i) => (
              <li key={`${pref}-${i}`} className="uppercase">
                {pref || '—'}
              </li>
            ))}
          </ol>
        ) : (
          '—'
        )}
      </Field>
      <Field label="Addons sélectionnés" wide>
        {payload.addonIds && payload.addonIds.length > 0 ? (
          <p className="text-md-text-muted text-xs">
            {payload.addonIds.length} addon(s) — {payload.addonIds.join(', ').slice(0, 80)}
            {payload.addonIds.join(', ').length > 80 && '…'}
          </p>
        ) : (
          <span className="text-md-text-muted">Aucun</span>
        )}
      </Field>
      <Field label="CGV">
        {payload.cgvAccepted ? (
          <span className="text-md-success">✓ Acceptées</span>
        ) : (
          <span className="text-md-warning">Non acceptées</span>
        )}
      </Field>
    </dl>
  );
}

function CaseB({ payload }: { payload: CaseBPayload }) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
      <Field label="Type de présence" wide>
        {payload.interests && payload.interests.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {payload.interests.map((i) => (
              <li key={i} className="bg-md-blue/10 text-md-blue rounded-full px-2 py-0.5 text-xs">
                {INTEREST_LABEL[i] ?? i}
              </li>
            ))}
          </ul>
        ) : (
          '—'
        )}
      </Field>
      <Field label="Pôle d'intérêt">{payload.pole ?? '—'}</Field>
      <Field label="Budget estimé">
        {payload.budget ? (BUDGET_LABEL[payload.budget] ?? payload.budget) : '—'}
      </Field>
      <Field label="Message" wide>
        {payload.message ? (
          <p className="text-md-text whitespace-pre-wrap">{payload.message}</p>
        ) : (
          <span className="text-md-text-muted">—</span>
        )}
      </Field>
    </dl>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <dt className="text-md-text-muted text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-md-text mt-0.5">{children}</dd>
    </div>
  );
}

function RawJson({ payload }: { payload: unknown }) {
  return (
    <pre className="bg-md-bg-soft/50 max-h-72 overflow-auto rounded-md p-3 text-[11px]">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

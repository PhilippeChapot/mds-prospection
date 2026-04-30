import { admin } from './_client';

/**
 * Seed app_settings — paramètres opérationnels modifiables depuis /admin/preferences.
 * Source : SPEC §3.10 + §3.12 + §3.32.
 */
type Setting = {
  key: string;
  value: unknown;
  description: string;
  category: 'finance' | 'rgpd' | 'integrations' | 'general' | 'email';
};

const SETTINGS: Setting[] = [
  // ----- Finance -----
  {
    key: 'deposit_percentage',
    value: 30,
    description: "Pourcentage d'acompte à payer pour confirmer un stand (0-100).",
    category: 'finance',
  },
  {
    key: 'default_vat_rate',
    value: 20,
    description: 'Taux de TVA par défaut appliqué (France métropolitaine).',
    category: 'finance',
  },
  {
    key: 'default_currency',
    value: 'EUR',
    description: 'Devise par défaut pour tous les montants.',
    category: 'finance',
  },
  {
    key: 'recommended_payment_path',
    value: 'devis_sepa',
    description: 'Parcours de paiement recommandé par défaut (cf. SPEC §3.10).',
    category: 'finance',
  },
  {
    key: 'option_lock_minutes',
    value: 30,
    description: 'Durée du verrou optimiste sur un emplacement réservé en option (minutes).',
    category: 'finance',
  },
  // ----- RGPD -----
  {
    key: 'cgv_version',
    value: 1,
    description: 'Version courante des CGV — incrémenter à chaque modification.',
    category: 'rgpd',
  },
  {
    key: 'rgpd_dpo_email',
    value: 'rgpd@mediadays.fr',
    description: 'Email du DPO pour les demandes RTBF / portabilité.',
    category: 'rgpd',
  },
  // ----- General -----
  {
    key: 'signup_token_ttl_hours',
    value: 48,
    description: 'Durée de validité du token de double opt-in (heures).',
    category: 'general',
  },
  {
    key: 'admin_notification_email',
    value: 'philippe.chapot@mediadays.fr',
    description: "Email recevant les notifications d'événements clés du pipeline.",
    category: 'general',
  },
  {
    key: 'billing_entity',
    value: {
      name: 'Editions HF',
      legal_form: null,
      siren: null,
      vat_number: null,
      address: null,
      iban: null,
      bic: null,
    },
    description:
      'Société facturatrice (SPEC §3.32) — détails fiscaux à compléter en P5 quand Phil aura les pièces officielles.',
    category: 'finance',
  },
  // ----- Integrations (placeholders, configures au fur et a mesure) -----
  {
    key: 'sellsy_pole_tag_map',
    value: {},
    description: 'Mapping pôle interne → tag Sellsy (rempli en P4 quand on connaît les IDs).',
    category: 'integrations',
  },
];

async function main() {
  console.log(`→ Seeding app_settings (${SETTINGS.length} keys)…`);

  let created = 0;
  let updated = 0;

  for (const s of SETTINGS) {
    const { data: existing } = await admin
      .from('app_settings')
      .select('key')
      .eq('key', s.key)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('app_settings')
        .update({ value: s.value, description: s.description, category: s.category })
        .eq('key', s.key);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await admin.from('app_settings').insert({
        key: s.key,
        value: s.value,
        description: s.description,
        category: s.category,
      });
      if (error) throw error;
      created += 1;
    }
  }

  console.log(
    `  ✓ app_settings : created=${created}, updated=${updated} (total=${SETTINGS.length})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

/**
 * P2.x.1 — Registry typé des `app_settings` connues.
 *
 * Stratégie hybride (Option C) :
 *   - Clés connues -> schéma Zod + type UI dédié (number/percent/email/...)
 *   - Clés custom inconnues -> éditeur JSON brut, pas de validation
 *
 * Doctrine : les catégories ici DOIVENT correspondre à l'état actuel de la
 * DB en prod (sinon le seed avec ON CONFLICT DO NOTHING ne corrige pas les
 * lignes existantes). Vérifié 2026-05-26 :
 *   - `canva_md26_plan_url`     -> category 'general' (migration 0019)
 *   - `admin_notification_emails` -> category 'general' (migration 0022)
 *
 * Pour ajouter une nouvelle key : ajouter l'entrée ici + mettre à jour le
 * seed migration (00XX_seed_app_settings.sql) si une valeur par défaut est
 * souhaitée à la création.
 */

import { z } from 'zod';

export const APP_SETTING_CATEGORIES = [
  'finance',
  'rgpd',
  'integrations',
  'general',
  'email',
] as const;

export type AppSettingCategory = (typeof APP_SETTING_CATEGORIES)[number];

export type SettingFieldType =
  | 'number'
  | 'percent'
  | 'string'
  | 'secret'
  | 'email'
  | 'email_list'
  | 'url'
  | 'boolean'
  | 'select'
  | 'uuid'
  | 'json';

export interface SettingFieldDef {
  key: string;
  category: AppSettingCategory;
  label: string;
  description: string;
  schema: z.ZodTypeAny;
  type: SettingFieldType;
  selectOptions?: string[];
  placeholder?: string;
}

export const SETTINGS_REGISTRY: SettingFieldDef[] = [
  // ═══════ FINANCE ═══════
  {
    key: 'acompte_percent',
    category: 'finance',
    label: "Pourcentage d'acompte",
    description: 'Acompte demandé sur les devis partenaires. Ex : 30 = 30 %.',
    schema: z.number().int().min(0).max(100),
    type: 'percent',
  },
  {
    key: 'discount_max_admin_percent',
    category: 'finance',
    label: 'Remise admin maximum',
    description:
      "Remise % maximum qu'un admin peut appliquer sur un devis sans validation super_admin.",
    schema: z.number().int().min(0).max(50),
    type: 'percent',
  },
  {
    key: 'affilie_commission_default_percent',
    category: 'finance',
    label: 'Commission affilié par défaut',
    description: 'Commission % appliquée par défaut sur un nouvel affilié créé en admin.',
    schema: z.number().int().min(0).max(50),
    type: 'percent',
  },

  // ═══════ EMAIL ═══════
  {
    key: 'sender_email_brevo',
    category: 'email',
    label: 'Email expéditeur Brevo',
    description:
      'Adresse from utilisée pour les emails transactionnels et lifecycle. Doit être vérifiée DKIM/DMARC/SPF dans Brevo.',
    schema: z.string().email(),
    type: 'email',
  },
  {
    key: 'sender_name_brevo',
    category: 'email',
    label: 'Nom expéditeur Brevo',
    description: 'Nom affiché dans les boîtes de réception (ex : "MediaDays Solutions").',
    schema: z.string().min(2).max(100),
    type: 'string',
  },

  // ═══════ INTEGRATIONS ═══════
  {
    key: 'sellsy_pipeline_id',
    category: 'integrations',
    label: 'ID pipeline Sellsy',
    description:
      'Identifiant numérique du pipeline Sellsy où sont créées les opportunités prospects.',
    schema: z.number().int().positive(),
    type: 'number',
  },
  {
    key: 'apollo_api_key',
    category: 'integrations',
    label: 'Clé API Apollo.io',
    description:
      "Clé d'API Apollo.io (récupérable sur app.apollo.io > Settings > Integrations > API). Vide = feature désactivée.",
    schema: z.string().min(20).max(120).or(z.literal('')),
    type: 'string',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    key: 'apollo_enabled',
    category: 'integrations',
    label: 'Activer Apollo dans Smart Add',
    description:
      'Active la section « Enrichir avec Apollo » dans le Smart Add Wizard. Nécessite apollo_api_key remplie.',
    schema: z.boolean(),
    type: 'boolean',
  },

  // ═══════ INTEGRATIONS — Messagerie visiteur native (P9.1-natif) ═══════
  // NB : on a retire les 4 settings Tawk.to (chat_widget_enabled,
  // tawk_property_id, tawk_widget_id, tawk_webhook_secret) au pivot
  // P9.1-natif. Si les rows existent encore en DB, elles apparaissent
  // comme "custom keys" dans l'UI ; la migration 0063 les supprime.
  {
    key: 'visitor_chat_enabled',
    category: 'integrations',
    label: 'Activer la messagerie visiteur',
    description:
      'Affiche le widget de messagerie native sur les pages publiques (mediadays.solutions). Désactivé = bouton flottant masqué partout.',
    schema: z.boolean(),
    type: 'boolean',
  },

  // ═══════ RGPD ═══════
  {
    key: 'data_retention_days_signups',
    category: 'rgpd',
    label: 'Rétention signups non confirmés (jours)',
    description:
      'Nombre de jours avant suppression auto des inscriptions web non confirmées (DOI non cliqué).',
    schema: z.number().int().min(7).max(730),
    type: 'number',
  },
  {
    key: 'data_retention_days_inactive_prospects',
    category: 'rgpd',
    label: 'Rétention prospects inactifs (jours)',
    description: 'Nombre de jours sans activité avant alerte RGPD sur un prospect (audit).',
    schema: z.number().int().min(180).max(1825),
    type: 'number',
  },

  // ═══════ GENERAL ═══════
  // NB : `canva_md26_plan_url` et `admin_notification_emails` sont en
  // category 'general' côté DB (migrations 0019 + 0022). On NE change PAS
  // leur category pour ne pas casser la prod.
  {
    key: 'canva_md26_plan_url',
    category: 'general',
    label: 'URL plan Canva MDS 2026',
    description:
      "URL d'embed du plan visuel Canva (Salle Le Nôtre, Carrousel du Louvre). Vide = plan désactivé étape 2 Cas A.",
    schema: z.string().url().or(z.literal('')),
    type: 'url',
    placeholder: 'https://www.canva.com/design/.../view?embed',
  },
  {
    key: 'admin_notification_emails',
    category: 'general',
    label: 'Emails recevant les notifications admin',
    description:
      "JSON array d'emails recevant les alertes critiques (nouveau signup, erreur sync, acompte payé, etc.).",
    schema: z.array(z.string().email()).min(1),
    type: 'email_list',
    placeholder: 'philippe@mediadays.solutions',
  },
  {
    key: 'feature_flag_inscription_visiteur',
    category: 'general',
    label: 'Activer inscriptions visiteurs',
    description:
      'Si désactivé, le bouton "Inscription visiteur" est caché côté site public (mediadays.solutions).',
    schema: z.boolean(),
    type: 'boolean',
  },
  {
    key: 'feature_flag_affiliate_program',
    category: 'general',
    label: "Activer programme d'affiliation",
    description: "Si désactivé, l'espace affilié /affilie est inaccessible (404 ou redirect).",
    schema: z.boolean(),
    type: 'boolean',
  },

  // ═══════ GENERAL — P12.x.SuperAdminQuickLogin ═══════
  // Comptes démo ciblés par les raccourcis super_admin (sidebar admin).
  // Ces 2 UUIDs sont obligatoires pour activer les boutons "Mode démo".
  {
    key: 'demo_affiliate_id',
    category: 'general',
    label: 'Affilié démo (quick-login super_admin)',
    description:
      "UUID de l'affilié ciblé par le raccourci super_admin « Se connecter en démo affilié ». Doit pointer vers un compte de test (pas un vrai partenaire).",
    schema: z.string().uuid().or(z.literal('')),
    type: 'uuid',
    placeholder: '00000000-0000-0000-0000-000000000000',
  },
  {
    key: 'demo_partenaire_contact_id',
    category: 'general',
    label: 'Contact partenaire démo (quick-login super_admin)',
    description:
      'UUID du contact ciblé par le raccourci super_admin « Se connecter en démo partenaire ». Doit pointer vers un contact de test rattaché à une company de démo.',
    schema: z.string().uuid().or(z.literal('')),
    type: 'uuid',
    placeholder: '00000000-0000-0000-0000-000000000000',
  },
];

export function getSettingDef(key: string): SettingFieldDef | undefined {
  return SETTINGS_REGISTRY.find((s) => s.key === key);
}

export function getSettingsByCategory(category: AppSettingCategory): SettingFieldDef[] {
  return SETTINGS_REGISTRY.filter((s) => s.category === category);
}

/**
 * Valide une `value` contre le schéma registry de `key` si elle est connue.
 * Retourne `{ ok: true, value }` (value parsed/coerced) ou `{ ok: false, error }`.
 * Pour les keys custom (inconnues), retourne `{ ok: true, value }` sans validation.
 */
export function validateSettingValue(
  key: string,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const def = getSettingDef(key);
  if (!def) return { ok: true, value };
  const r = def.schema.safeParse(value);
  if (!r.success) {
    return { ok: false, error: r.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  return { ok: true, value: r.data };
}

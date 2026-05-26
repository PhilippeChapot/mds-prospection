-- Migration 0057 — P2.x.1 : seed des app_settings du registry.
--
-- Doctrine : ON CONFLICT DO NOTHING pour ne PAS écraser les valeurs
-- existantes en prod (notamment `canva_md26_plan_url` et
-- `admin_notification_emails` déjà seedées par 0019 + 0022).
--
-- Pour ajouter une nouvelle key : ajouter ici + dans SETTINGS_REGISTRY
-- (lib/admin/preferences/registry.ts) avec un schéma Zod cohérent.

insert into public.app_settings (key, value, description, category, updated_at) values
  ('acompte_percent',
   '30'::jsonb,
   'Acompte 30 % par défaut sur les devis exposants.',
   'finance',
   now()),
  ('discount_max_admin_percent',
   '20'::jsonb,
   'Remise % maximum qu''un admin peut appliquer sans validation super_admin.',
   'finance',
   now()),
  ('affilie_commission_default_percent',
   '10'::jsonb,
   'Commission % par défaut sur un nouvel affilié.',
   'finance',
   now()),
  ('sender_email_brevo',
   '"philippe@mediadays.solutions"'::jsonb,
   'Email expéditeur Brevo (DKIM/DMARC/SPF vérifiés).',
   'email',
   now()),
  ('sender_name_brevo',
   '"MediaDays Solutions"'::jsonb,
   'Nom expéditeur Brevo affiché dans les boîtes de réception.',
   'email',
   now()),
  ('sellsy_pipeline_id',
   '775'::jsonb,
   'Pipeline Sellsy "défaut" (id 775, 7 steps) où sont créées les opportunités. Valeur historique const SELLSY_PIPELINE_ID dans sync-prospect.ts.',
   'integrations',
   now()),
  ('data_retention_days_signups',
   '90'::jsonb,
   'Rétention RGPD signups non confirmés : 90 jours.',
   'rgpd',
   now()),
  ('data_retention_days_inactive_prospects',
   '730'::jsonb,
   'Rétention RGPD prospects inactifs : 2 ans.',
   'rgpd',
   now()),
  ('feature_flag_inscription_visiteur',
   'false'::jsonb,
   'Visiteurs s''inscrivent sur mediadays.net, pas .solutions. Feature désactivée côté MDS Prospection.',
   'general',
   now()),
  ('feature_flag_affiliate_program',
   'true'::jsonb,
   'Programme affiliation actif : /affilie accessible.',
   'general',
   now())
on conflict (key) do nothing;

-- Note : les keys existantes en prod (préservées par ON CONFLICT) :
--   - canva_md26_plan_url     -> category 'general' (migration 0019)
--   - admin_notification_emails -> category 'general' (migration 0022)
-- Le registry les référence en category 'general' pour rester aligné.

-- Migration 0062 — P9.1 : chat visiteur Tawk.to + capture lead.
--
-- Phase 1 du plan chat P9 (cf. COWORK/MDS-Prospection-P9-Plan-Chat.md) :
-- widget Tawk.to (100% gratuit) sur les pages publiques + endpoint
-- /api/webhooks/tawk-lead qui materialise un prospect status='lead' a
-- chaque coordonnee laissee dans le chat (offline form / transcript).
--
--   - prospect_source += 'chat_visiteur' (traçabilité statistiques).
--   - sync_target     += 'tawk'          (sync_logs pour debug webhooks).
--   - seed 4 app_settings :
--       * chat_widget_enabled   (toggle global)
--       * tawk_property_id      (Admin > Channels > Chat Widget)
--       * tawk_widget_id        (idem)
--       * tawk_webhook_secret   (HMAC-SHA1 validation, super_admin only)

alter type public.prospect_source add value if not exists 'chat_visiteur';
alter type public.sync_target add value if not exists 'tawk';

insert into public.app_settings (key, value, description, category, updated_at) values
  ('chat_widget_enabled',
   'false'::jsonb,
   'Toggle global du widget chat visiteur Tawk.to sur les pages publiques. Vide = chat masqué.',
   'integrations',
   now()),
  ('tawk_property_id',
   '""'::jsonb,
   'Tawk.to Property ID (Admin > Channels > Chat Widget). Visible dans le snippet de code Tawk.',
   'integrations',
   now()),
  ('tawk_widget_id',
   '""'::jsonb,
   'Tawk.to Widget ID (Admin > Channels > Chat Widget). Suffixe après le slash dans l''URL embed.',
   'integrations',
   now()),
  ('tawk_webhook_secret',
   '""'::jsonb,
   'Tawk.to Webhook Secret (super_admin only). Utilisé pour valider la signature HMAC-SHA1 du header X-Tawk-Signature. Vide = endpoint refuse tous les webhooks (503).',
   'integrations',
   now())
on conflict (key) do nothing;

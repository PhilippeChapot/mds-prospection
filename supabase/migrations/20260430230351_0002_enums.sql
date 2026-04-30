-- Migration 0002 — ENUM types
-- Tous les ENUMs declares en amont. Toute modif ulterieure passera par
-- ALTER TYPE ... ADD VALUE dans une migration dediee.

create type public.user_role as enum ('admin', 'sales');

create type public.season_status as enum ('planning', 'active', 'archived');

create type public.pole_code as enum (
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
  'INCONNU'
);

create type public.classification_source as enum ('ai', 'manual');

create type public.category_tarif as enum ('prs_exhibitor', 'standard', 'non_eligible');

create type public.vat_status as enum ('unverified', 'pending', 'valid', 'invalid');

create type public.language_code as enum ('FR', 'EN');

create type public.email_validation_status as enum (
  'valid',
  'free_provider',
  'disposable',
  'domain_mismatch'
);

create type public.email_deliverability_status as enum (
  'unchecked',
  'valid',
  'invalid',
  'unknown',
  'accept_all'
);

create type public.pack_code as enum ('ACCESS', 'CLASSIC', 'PREMIUM', 'A_DEFINIR');

create type public.prospect_status as enum (
  'lead',
  'contact',
  'devis_envoye',
  'acompte_paye',
  'signe',
  'perdu'
);

create type public.prospect_source as enum (
  'inscription_web',
  'direct',
  'salon',
  'reference',
  'campagne'
);

create type public.payment_path as enum (
  'devis_sepa',
  'devis_acompte_stripe',
  'proforma_acompte',
  'facture_integrale'
);

create type public.acompte_status as enum (
  'not_required',
  'pending',
  'paid',
  'failed',
  'refunded'
);

create type public.commission_status as enum ('not_applicable', 'due', 'paid');

create type public.addon_scope as enum ('prs_only', 'mds_only', 'both');

create type public.addon_category as enum (
  'logistique',
  'audiovisuel',
  'connectivite',
  'espaces',
  'visibilite',
  'communication',
  'goodies'
);

create type public.booth_event as enum ('paris', 'marseille', 'bruxelles');

create type public.booth_status as enum ('available', 'option', 'reserved', 'signed');

create type public.signup_status as enum (
  'awaiting_verification',
  'verified',
  'expired',
  'rejected',
  'converted'
);

create type public.activity_type as enum (
  'note',
  'email_sent',
  'email_received',
  'call',
  'meeting',
  'devis_sent',
  'devis_signed',
  'web_signup_attempt',
  'web_signup_verified',
  'company_classified',
  'category_assigned',
  'sync_sellsy',
  'sync_brevo',
  'sync_connectonair',
  'booth_reserved',
  'booth_released',
  'lifecycle_email_sent'
);

create type public.audit_action as enum (
  'create',
  'update',
  'delete',
  'login',
  'rgpd_rtbf',
  'rgpd_export',
  'sync_manual'
);

create type public.sync_target as enum ('sellsy', 'brevo', 'connectonair');

create type public.sync_op as enum ('create', 'update', 'pull', 'check');

create type public.sync_status as enum ('success', 'pending', 'error');

create type public.app_setting_category as enum ('finance', 'rgpd', 'integrations', 'general', 'email');

create type public.prs_exhibitor_source as enum ('xlsx_seed', 'manual_admin', 'sellsy_export');

create type public.chat_role as enum ('user', 'assistant', 'tool_use', 'tool_result');

create type public.chat_user_type as enum ('admin', 'sales', 'partner');

create type public.reminder_type as enum (
  'call_back',
  'send_email',
  'follow_up',
  'check_payment',
  'meeting',
  'other'
);

create type public.reminder_source as enum ('manual', 'ai_assistant');

create type public.campaign_status as enum (
  'draft',
  'scheduled',
  'sending',
  'sent',
  'archived',
  'cancelled'
);

create type public.attachment_unit as enum ('unit', 'per_brand', 'per_1000');

create type public.lifecycle_completion_status as enum ('empty', 'in_progress', 'profil_complet');

create type public.last_updated_by as enum ('exhibitor', 'admin');

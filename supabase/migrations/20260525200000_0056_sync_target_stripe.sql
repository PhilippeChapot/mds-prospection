-- Migration 0056 — P6.x.8-bis : étend sync_target enum avec 'stripe'.
--
-- L'enum d'origine (migration 0002) couvre 'sellsy', 'brevo', 'connectonair'.
-- P6.x.6 a branché sync_logs pour Sellsy. On étend maintenant à Stripe pour
-- tracer la création de Payment Links concierge + acompte (audit + debug).

alter type public.sync_target add value if not exists 'stripe';

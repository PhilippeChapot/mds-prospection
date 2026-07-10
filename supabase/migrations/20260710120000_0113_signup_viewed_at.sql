-- Migration 0113 — Badge "non lus" sidebar admin pour /admin/signups.
--
-- Ajoute viewed_by_admin_at sur public_signup_attempts (marque quand un
-- admin ouvre la fiche /admin/signups/[id], cf. MarkViewedOnMount).
-- Index partiel sur les signups non vus pour que le count badge
-- (created_at >= now() - 30j AND viewed_by_admin_at IS NULL) reste rapide.

alter table public.public_signup_attempts
  add column if not exists viewed_by_admin_at timestamptz;

comment on column public.public_signup_attempts.viewed_by_admin_at is
  'Horodatage de première ouverture de la fiche par un admin (badge sidebar "Inscriptions web"). NULL = non vu.';

create index if not exists idx_signup_attempts_unviewed
  on public.public_signup_attempts (created_at desc)
  where viewed_by_admin_at is null;

-- Migration 0089 — P7.x.AffiliateManualCompanyAttach
--
-- Ajoute la source 'manual_admin' au CHECK de affiliate_claims.source.
-- Un super_admin peut désormais attacher manuellement une société à un
-- affilié (claim source='manual_admin', status='active' direct — pas de
-- workflow pending puisque c'est l'admin lui-même qui agit).
--
-- affiliate_claims.source est une colonne TEXT + CHECK (PAS un enum PG),
-- donc on DROP/ADD la contrainte (auto-nommée `affiliate_claims_source_check`
-- par Postgres sur la définition inline de la migration 0052).

alter table public.affiliate_claims
  drop constraint if exists affiliate_claims_source_check;

alter table public.affiliate_claims
  add constraint affiliate_claims_source_check
  check (source in (
    'cookie_tracking',
    'declared_by_company',
    'declared_by_affiliate',
    'manual_admin'
  ));

comment on constraint affiliate_claims_source_check on public.affiliate_claims is
  'P7.x.AffiliateManualCompanyAttach — 4 sources : cookie_tracking, declared_by_company, declared_by_affiliate, manual_admin (attach super_admin).';

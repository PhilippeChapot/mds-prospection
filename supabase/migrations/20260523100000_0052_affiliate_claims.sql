-- Migration 0052 — P7.x.1.F (Attribution bidirectionnelle affilies)
--
-- Une "claim" represente l'attribution d'une societe a un affilie. Trois
-- sources possibles :
--   * cookie_tracking         : cookie mds_affiliate_ref pose au clic du
--                               lien tracking (P5.x.7). Auto-create
--                               status='active' au create prospect.
--   * declared_by_company     : champ "Qui vous a recommande ?" du wizard
--                               signup (Step1Form). Smart match contre
--                               affiliates.display_name. Active si match
--                               exact, pending sinon.
--   * declared_by_affiliate   : form "+ Declarer une societe" sur dashboard
--                               affilie. Toujours pending validation admin
--                               (anti-fraude / anti-double-attribution).
--
-- Contrainte UNIQUE (affiliate_id, company_id) : pas 2 claims actifs sur
-- meme paire. Si 2 affilies se disputent une societe, le 2e claim sera
-- en pending et l'admin arbitre.
--
-- RLS systematique : service_role only (l'app accede via service-role
-- pour bypass + filtre cote app). Doctrine `feedback_rls_systematic`.

create table if not exists public.affiliate_claims (
  id                       uuid primary key default gen_random_uuid(),
  affiliate_id             uuid not null references public.affiliates(id) on delete cascade,
  company_id               uuid references public.companies(id) on delete set null,
  prospect_id              uuid references public.prospects(id) on delete set null,
  -- Si pas encore matche a une company existante, on garde le nom libre
  -- declare (utile pour declared_by_affiliate avant validation admin).
  declared_company_name    text,
  declared_company_website text,
  source                   text not null check (source in (
                              'cookie_tracking',
                              'declared_by_company',
                              'declared_by_affiliate'
                            )),
  status                   text not null default 'pending' check (status in (
                              'pending',
                              'active',
                              'rejected'
                            )),
  declared_at              timestamptz not null default now(),
  validated_at             timestamptz,
  validated_by             uuid,  -- public.users.id (sans FK stricte, peut etre supprime)
  rejected_reason          text,
  notes_admin              text,
  -- Note saisie par l'affilie lors de sa declaration (declared_by_affiliate)
  notes_affiliate          text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Pas 2 claims sur meme paire (affilie, company). Le 2e tentative est
  -- bloquee, l'admin doit arbitrer via le claim existant.
  -- NULL company_id (claim declared_by_affiliate pas encore matche) ne
  -- participe pas a la contrainte UNIQUE (NULLs are distinct par defaut).
  unique (affiliate_id, company_id)
);

create index if not exists idx_affiliate_claims_affiliate
  on public.affiliate_claims (affiliate_id, status);
create index if not exists idx_affiliate_claims_status
  on public.affiliate_claims (status, declared_at desc);
create index if not exists idx_affiliate_claims_source
  on public.affiliate_claims (source);
create index if not exists idx_affiliate_claims_company
  on public.affiliate_claims (company_id) where company_id is not null;
create index if not exists idx_affiliate_claims_prospect
  on public.affiliate_claims (prospect_id) where prospect_id is not null;

comment on table public.affiliate_claims is
  'P7.x.1.F — Attribution societe<->affilie avec 3 sources (cookie, declared_by_company, declared_by_affiliate) + workflow validation admin.';

alter table public.affiliate_claims enable row level security;

drop policy if exists "affiliate_claims_service" on public.affiliate_claims;
create policy "affiliate_claims_service" on public.affiliate_claims
  for all to service_role using (true) with check (true);

-- Backfill retroactif : pour chaque prospect existant avec affiliate_id,
-- creer un claim 'active' source='cookie_tracking' (assumption : les
-- prospects historiques venaient via le cookie de tracking). Si Phil
-- veut affiner manuellement, possible via UI admin (P7.x.1.F-bis).
--
-- ON CONFLICT DO NOTHING : idempotent + si la paire existe deja (rare,
-- ne devrait pas arriver puisqu'on vient de creer la table), on skip.
insert into public.affiliate_claims (
  affiliate_id, company_id, prospect_id, source, status,
  validated_at, declared_at, created_at
)
select
  p.affiliate_id,
  p.company_id,
  p.id,
  'cookie_tracking',
  'active',
  p.created_at,
  p.created_at,
  now()
from public.prospects p
where p.affiliate_id is not null
  and p.company_id is not null
on conflict (affiliate_id, company_id) do nothing;

-- Migration 0037 — P5.x.16
-- Log des clicks sur les liens d'invitation visiteurs envoyes par les
-- exposants. Mesure l'engagement reseau de chaque exposant.
--
-- Pas de PII brute : on stocke uniquement un SHA256 hash de l'IP (RGPD-
-- friendly, suffisant pour deduplication par device sur 24h si besoin).
--
-- Pas d'index unique sur (company_id, ip_hash) -- on accepte les clicks
-- repetes (un meme invite qui clique 3 fois compte 3 fois). C'est un
-- proxy d'engagement, pas une mesure d'audience unique.
--
-- RLS : enabled mais sans policy publique. Toutes les ecritures passent
-- par le route handler /i/[companyId] (service-role, bypass RLS).
-- Les lectures pour le compteur dashboard exposant passent aussi par
-- service-role apres validation de la session espace exposant.

create table if not exists public.visitor_invitations_clicks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  user_agent text,
  ip_hash text,
  referrer text
);

create index if not exists idx_invitation_clicks_company
  on public.visitor_invitations_clicks (company_id, clicked_at desc);

comment on table public.visitor_invitations_clicks is
  'P5.x.16 — Log des clicks sur les liens d''invitation visiteurs envoyes par les exposants. Mesure l''engagement reseau de chaque exposant.';
comment on column public.visitor_invitations_clicks.ip_hash is
  'SHA256 hash de l''IP brute (analytics sans PII, RGPD-friendly).';

alter table public.visitor_invitations_clicks enable row level security;

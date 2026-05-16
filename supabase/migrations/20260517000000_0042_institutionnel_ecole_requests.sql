-- Migration 0042 — P6.x.4-a
-- Demandes de tarif préférentiel pour Institutionnels & Syndicats (famille 11)
-- et Écoles & Formation (famille 13), captées depuis la landing publique.
--
-- Doctrine :
--   - Pas de RLS public : reads/writes via service-role uniquement, le form
--     public passe par une server action qui filtre/valide côté serveur.
--   - status : new → contacted → devis_sent → won|lost (workflow commercial
--     manuel, géré dans /admin/demandes-institutionnel-ecole).
--   - Type figé : 'institutionnel' | 'ecole' — utilisé pour aiguiller le
--     template email + futurs % promo dans P6.x.5.

create table if not exists public.institutionnel_ecole_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('institutionnel', 'ecole')),
  org_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  website text,
  message text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'devis_sent', 'won', 'lost')),
  admin_notes text,
  assigned_to uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institutionnel_ecole_requests_type_idx
  on public.institutionnel_ecole_requests (type, created_at desc);
create index if not exists institutionnel_ecole_requests_status_idx
  on public.institutionnel_ecole_requests (status, created_at desc);

comment on table public.institutionnel_ecole_requests is
  'P6.x.4-a — demandes de tarif préférentiel Institutionnel/École captées depuis la landing publique mediadays.solutions.';

alter table public.institutionnel_ecole_requests enable row level security;

-- Service-role full access (la server action utilise le service client).
create policy "institutionnel_ecole_requests_service_full" on public.institutionnel_ecole_requests
  for all to service_role using (true) with check (true);

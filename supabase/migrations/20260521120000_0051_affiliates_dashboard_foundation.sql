-- Migration 0051 — P7.x.1.A (Affilies V2 foundation)
--
-- Pre-requis pour l'espace affilie self-service (dashboard /affilie/...) :
--   - iban / bic / nom_titulaire_compte : paiement commission manuel via
--     virement bancaire (volume 10-30 affilies, pas de Stripe Connect).
--     Edition future cote affilie dans la section "Profil" du dashboard.
--   - last_login_at : audit + affichage cote admin (derniere connexion).
--
-- Pas de status enum (active/suspended/archived) en foundation : on garde
-- `is_active` boolean qui suffit binaire (actif vs archive). Si Phil veut
-- distinguer 'suspended', on ajoutera en P7.x.1.B.
--
-- RLS : table `affiliates` deja en RLS (migration 0015), policy admin
-- existante. On etend juste les colonnes accessibles via les memes
-- policies -- pas de policy supplementaire necessaire.

alter table public.affiliates
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists nom_titulaire_compte text,
  add column if not exists last_login_at timestamptz;

comment on column public.affiliates.iban is
  'P7.x.1.A — IBAN du compte bancaire affilie pour virement commission. Saisi cote affilie via dashboard, visible admin. Pas de validation format en DB (free-text).';
comment on column public.affiliates.bic is
  'P7.x.1.A — BIC/SWIFT associe a l''IBAN. Optionnel selon pays.';
comment on column public.affiliates.nom_titulaire_compte is
  'P7.x.1.A — Nom du titulaire du compte (peut differer du display_name si compte societe).';
comment on column public.affiliates.last_login_at is
  'P7.x.1.A — Derniere connexion affilie au dashboard (timestamp du magic-link consomme). NULL = jamais connecte.';

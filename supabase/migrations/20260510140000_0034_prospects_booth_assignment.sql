-- Migration 0034 — P5.x.10
-- Booth allocation : champ texte simple sur prospects (format libre,
-- ex: "E5", "Allee Audio - Stand 12"). Affecte par l'admin sur la
-- fiche prospect, lu par l'exposant dans son dashboard.
--
-- Pas de plan de salle interactif en V1.1 ; on garde un texte libre
-- pour ne pas geler le format avant d'avoir le plan final MDS 2026.
--
-- Les colonnes coordonnees contact (phone, role) existent deja sur
-- public.contacts depuis la migration 0004, pas besoin d'y toucher.

alter table public.prospects
  add column if not exists booth_assignment text,
  add column if not exists booth_assigned_at timestamptz,
  add column if not exists booth_assigned_by uuid references public.users(id) on delete set null;

comment on column public.prospects.booth_assignment is
  'Code emplacement stand attribue par admin (ex: E5, Allee Audio - Stand 12). null si pas encore attribue. Format libre pour MDS 2026.';
comment on column public.prospects.booth_assigned_at is
  'Timestamp de l''attribution. Trace l''historique pour audit.';
comment on column public.prospects.booth_assigned_by is
  'User admin qui a attribue le stand. SET NULL si l''utilisateur est supprime.';

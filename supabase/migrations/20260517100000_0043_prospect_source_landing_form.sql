-- Migration 0043 — P6.x.4-a-bis
-- 1) Étend l'enum prospect_source avec 'landing_form' pour les leads
--    captés depuis la landing publique (forms Institutionnel/École).
-- 2) Drop la table institutionnel_ecole_requests créée en 0042 : remplacée
--    par le pipeline standard /admin/prospects (filtrer source='landing_form').

alter type public.prospect_source add value if not exists 'landing_form';

drop table if exists public.institutionnel_ecole_requests;

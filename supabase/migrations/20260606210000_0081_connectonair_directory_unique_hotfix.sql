-- Migration 0081 — Hotfix : materialiser UNIQUE constraint oubliee par 0078
-- ═══════════════════════════════════════════════════════════════════
--
-- Contexte : la migration 0078 (V1 ConnectOnAir societes) a ajoute 23
-- colonnes additives sur public.connectonair_directory mais a oublie la
-- UNIQUE constraint sur source_societe_id necessaire pour le ON CONFLICT
-- du script d import (scripts/import-connectonair-export.ts).
--
-- Phil a ajoute la constraint manuellement en prod via Supabase SQL Editor
-- le 2026-06-06 :
--
--   ALTER TABLE public.connectonair_directory
--     ADD CONSTRAINT connectonair_directory_source_societe_id_unique
--     UNIQUE (source_societe_id);
--
-- Cette migration materialise le fix dans le code de maniere idempotente :
--   - En prod  : DROP IF EXISTS + ADD = no-op net (la constraint existe deja).
--   - En local : DROP IF EXISTS no-op + ADD = cree la constraint pour les
--                devs qui clonent le repo et relancent `pnpm db:push`.
--
-- A NE PAS modifier ni rejouer manuellement. Sera appliquee automatiquement
-- par `pnpm db:push`.
--
-- Note : l index partiel doublon `uniq_coa_directory_source_societe_id`
-- (cree par 0078) est deja DROPPED par la migration 0080 (ligne 23) — pas
-- besoin de le re-drop ici.

alter table public.connectonair_directory
  drop constraint if exists connectonair_directory_source_societe_id_unique;

alter table public.connectonair_directory
  add constraint connectonair_directory_source_societe_id_unique
  unique (source_societe_id);

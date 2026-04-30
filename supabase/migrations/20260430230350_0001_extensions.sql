-- Migration 0001 — Extensions
-- pg_trgm : trigram similarity pour auto-complete fuzzy (companies.name + affiliates.display_name)
-- pgcrypto : gen_random_uuid() utilise par tous les PK uuid

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Schema "private" pour les fonctions security-definer (jamais expose au Data API).
create schema if not exists private;
revoke all on schema private from anon, authenticated;

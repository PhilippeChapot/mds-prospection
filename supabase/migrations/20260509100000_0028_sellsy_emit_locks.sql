-- ============================================================================
-- 0028 — P4.x.1 Bug F : verrou idempotence emission devis Sellsy.
--
-- Probleme observe en prod (test E2E 2026-05-08 prospect 060c0e67-...) :
-- 2 devis Sellsy crees a 170ms d'intervalle pour un seul clic admin du
-- bouton "Emettre devis Sellsy". Symptome : Server Action Next 16 / React 19
-- est re-invoquee (probablement par revalidation ou re-render concurrent),
-- les 2 invocations passent le check `sellsy_devis_id IS NULL` avant que
-- l'une ait fini, et chacune cree son devis cote Sellsy. La 2e UPDATE ecrase
-- la 1ere en DB -> devis 1 (D-20260509-02691) reste orphelin dans Sellsy.
--
-- Fix : INSERT atomique sur cette table avec ON CONFLICT DO NOTHING.
-- - Si la 1ere invocation insere -> elle obtient le lock (rowCount=1)
-- - La 2e invocation se fait rejeter (rowCount=0) -> early-return idempotent
-- - Le lock expire automatiquement apres 5 minutes (TTL) pour eviter
--   qu'un crash mid-flight bloque les re-tentatives manuelles.
--
-- Le lock est libere explicitement en fin de runCaseAFlow (DELETE FROM
-- sellsy_emit_locks WHERE prospect_id = ...) mais le TTL sert de garde-fou
-- si le process crash avant le DELETE.
-- ============================================================================

create table if not exists public.sellsy_emit_locks (
  prospect_id uuid primary key references public.prospects(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists sellsy_emit_locks_expires_at_idx
  on public.sellsy_emit_locks(expires_at);

comment on table public.sellsy_emit_locks is
  'Verrou idempotence emission devis Sellsy (P4.x.1 Bug F). INSERT ON CONFLICT DO NOTHING : 1ere invocation gagne, les autres sont rejetees. TTL 5min pour auto-cleanup en cas de crash mid-flight.';

-- RLS : table interne service-only, pas d'acces utilisateur.
alter table public.sellsy_emit_locks enable row level security;
revoke insert, update, delete, select on public.sellsy_emit_locks from authenticated, anon;

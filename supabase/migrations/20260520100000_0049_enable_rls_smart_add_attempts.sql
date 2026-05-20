-- Migration 0049 — P6.x.SECURITY-rls
--
-- Audit Supabase a remonte 2 tables creees sans `ENABLE ROW LEVEL SECURITY`
-- (alerte rls_disabled_in_public) :
--   1. public.smart_add_attempts   (cree en 0039 P5.x.23 Smart Add Wizard)
--   2. public.admin_alerts         (cree en 0035 P5.x.11)
--
-- Sans RLS, n'importe quelle cle anon Supabase pouvait lire/ecrire ces deux
-- tables (smart_add_attempts contient des raw_input parsing IA — potentielle
-- fuite de donnees client ; admin_alerts contient des messages d'alertes
-- internes citant des prospects).
--
-- Strategie :
--   - smart_add_attempts : insert exclusivement cote serveur via service_role
--     (cf. src/lib/smart-add/orchestrator.ts). Une seule policy service_role
--     suffit.
--   - admin_alerts : ecrit cote serveur via service_role (cron, recheck SIREN)
--     ET lu/update par les admins authentifies via createSupabaseServerClient
--     (resolveAlertAction, page prospect, dashboard). Il faut donc 2 policies :
--       * service_role full access (cron + helpers serveur)
--       * authenticated admin all (lecture liste, update resolved_at, etc.)
--
-- Note conventionnelle : on prefere `for all to service_role` aux 4 policies
-- separees (select/insert/update/delete) pour rester aligne sur le pattern
-- existant (cf. migration 0046 stands_catalog).

-- ----------------------------------------------------------------------------
-- 1. smart_add_attempts
-- ----------------------------------------------------------------------------
alter table public.smart_add_attempts enable row level security;

drop policy if exists "smart_add_attempts_service" on public.smart_add_attempts;
create policy "smart_add_attempts_service" on public.smart_add_attempts
  for all to service_role
  using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 2. admin_alerts
-- ----------------------------------------------------------------------------
alter table public.admin_alerts enable row level security;

drop policy if exists "admin_alerts_service" on public.admin_alerts;
create policy "admin_alerts_service" on public.admin_alerts
  for all to service_role
  using (true) with check (true);

drop policy if exists "admin_alerts_admin_all" on public.admin_alerts;
create policy "admin_alerts_admin_all" on public.admin_alerts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

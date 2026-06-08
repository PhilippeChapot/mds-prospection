-- Migration 0087 — P5.x.CompanyMerge
--
-- Fusion atomique de deux sociétés (doublons). Cas d'usage Phil :
-- "WinMedia" + "Win-Group Software SAS" → on garde la cible, on déplace
-- TOUTES les références enfant de la source vers la cible, puis on
-- supprime la source.
--
-- Pourquoi une RPC PL/pgSQL et pas du code applicatif ?
--   Le client supabase-js ne sait PAS faire de transaction multi-statement
--   atomique. Or un merge = N UPDATEs (réaffectation FK) + 1 DELETE final
--   qui DOIVENT être tout-ou-rien : si le DELETE échoue après les UPDATEs
--   on aurait des données à moitié migrées. Une fonction plpgsql tourne
--   dans une seule transaction Postgres → rollback automatique sur toute
--   exception (raise / contrainte violée).
--
-- Ordre FK (critique) : on réaffecte les 10 colonnes qui pointent vers
-- companies(id) AVANT de supprimer la source. Sinon :
--   - colonnes ON DELETE CASCADE (contacts, prospects, company_profiles,
--     reminders, visitor_invitations_clicks) → enfants SUPPRIMÉS = perte.
--   - colonnes ON DELETE SET NULL (public_signup_attempts, prs_2026_exhibitors,
--     booth_inventory, affiliates, affiliate_claims) → lien NULLifié = perte
--     du rattachement à la société fusionnée.
--
-- Deux contraintes UNIQUE à désamorcer avant UPDATE :
--   - company_profiles.company_id (1-1) : si la cible a déjà un profil, on
--     supprime celui de la source (la cible gagne) ; sinon on le déplace.
--   - affiliate_claims (affiliate_id, company_id) : on supprime d'abord les
--     claims source qui collisionneraient avec un claim cible du même
--     affilié, puis on déplace le reste.
--
-- security definer : la RPC est appelée par le service_role depuis la
-- server action (elle-même gardée requireSuperAdmin). On ne grant QU'à
-- service_role (pas authenticated) — pas d'exposition côté client.

create or replace function public.merge_companies(
  p_source_id uuid,
  p_target_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.companies%rowtype;
  v_target public.companies%rowtype;
  v_prospects int := 0;
  v_contacts int := 0;
  v_reminders int := 0;
  v_clicks int := 0;
  v_signups int := 0;
  v_prs int := 0;
  v_booths int := 0;
  v_affiliates int := 0;
  v_claims int := 0;
  v_profile_moved int := 0;
  v_audit_moved int := 0;
  v_moved jsonb;
begin
  if p_source_id = p_target_id then
    raise exception 'SOURCE_EQUALS_TARGET';
  end if;

  select * into v_source from public.companies where id = p_source_id;
  if not found then
    raise exception 'SOURCE_NOT_FOUND';
  end if;
  select * into v_target from public.companies where id = p_target_id;
  if not found then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  -- ── 1. prospects (CASCADE) ──
  update public.prospects set company_id = p_target_id where company_id = p_source_id;
  get diagnostics v_prospects = row_count;

  -- ── 2. contacts (CASCADE) ──
  update public.contacts set company_id = p_target_id where company_id = p_source_id;
  get diagnostics v_contacts = row_count;

  -- ── 3. reminders (CASCADE) ──
  update public.reminders set company_id = p_target_id where company_id = p_source_id;
  get diagnostics v_reminders = row_count;

  -- ── 4. visitor_invitations_clicks (CASCADE) ──
  update public.visitor_invitations_clicks set company_id = p_target_id where company_id = p_source_id;
  get diagnostics v_clicks = row_count;

  -- ── 5. public_signup_attempts (SET NULL) ──
  update public.public_signup_attempts set matched_company_id = p_target_id where matched_company_id = p_source_id;
  get diagnostics v_signups = row_count;

  -- ── 6. prs_2026_exhibitors (SET NULL) ──
  update public.prs_2026_exhibitors set matched_company_id = p_target_id where matched_company_id = p_source_id;
  get diagnostics v_prs = row_count;

  -- ── 7. booth_inventory (SET NULL) ──
  update public.booth_inventory set reserved_for_company_id = p_target_id where reserved_for_company_id = p_source_id;
  get diagnostics v_booths = row_count;

  -- ── 8. affiliates (SET NULL, pas de unique) ──
  update public.affiliates set company_id = p_target_id where company_id = p_source_id;
  get diagnostics v_affiliates = row_count;

  -- ── 9. affiliate_claims (UNIQUE affiliate_id, company_id) ──
  -- Supprime d'abord les claims source qui collisionneraient avec la cible.
  delete from public.affiliate_claims ac
  where ac.company_id = p_source_id
    and exists (
      select 1 from public.affiliate_claims t
      where t.company_id = p_target_id and t.affiliate_id = ac.affiliate_id
    );
  update public.affiliate_claims set company_id = p_target_id where company_id = p_source_id;
  get diagnostics v_claims = row_count;

  -- ── 10. company_profiles (UNIQUE company_id, 1-1) ──
  if exists (select 1 from public.company_profiles where company_id = p_target_id) then
    -- La cible a déjà un profil → le sien gagne, on jette celui de la source.
    delete from public.company_profiles where company_id = p_source_id;
  else
    update public.company_profiles set company_id = p_target_id where company_id = p_source_id;
    get diagnostics v_profile_moved = row_count;
  end if;

  -- ── Backfill cible : sellsy_id + siren si la cible n'en a pas, et
  --     concat des notes société (on ne perd jamais la note de la source). ──
  update public.companies set
    sellsy_id = coalesce(sellsy_id, v_source.sellsy_id),
    siren = coalesce(siren, v_source.siren),
    notes = case
      when v_source.notes is null or btrim(v_source.notes) = '' then notes
      when notes is null or btrim(notes) = '' then v_source.notes
      else notes || E'\n\n--- Fusionné depuis ' || coalesce(v_source.name, '?') || E' ---\n' || v_source.notes
    end,
    updated_at = now()
  where id = p_target_id;

  -- ── Déplace l'historique audit société de la source vers la cible
  --     (sinon entity_id pointerait vers une société supprimée). ──
  update public.audit_log set entity_id = p_target_id
  where entity_type = 'companies' and entity_id = p_source_id;
  get diagnostics v_audit_moved = row_count;

  -- ── Suppression de la source EN DERNIER (toutes les FK sont réaffectées). ──
  delete from public.companies where id = p_source_id;

  v_moved := jsonb_build_object(
    'prospects', v_prospects,
    'contacts', v_contacts,
    'reminders', v_reminders,
    'visitor_clicks', v_clicks,
    'signup_attempts', v_signups,
    'prs_exhibitors', v_prs,
    'booths', v_booths,
    'affiliates', v_affiliates,
    'affiliate_claims', v_claims,
    'company_profile_moved', v_profile_moved,
    'audit_entries', v_audit_moved
  );

  -- ── Trace audit sur la cible (kind = company_merged → timeline drawer). ──
  insert into public.audit_log (user_id, entity_type, entity_id, action, before, after)
  values (
    p_actor_id,
    'companies',
    p_target_id,
    'update',
    jsonb_build_object(
      'kind', 'company_merge_source',
      'source_id', p_source_id,
      'source_name', v_source.name,
      'source_sellsy_id', v_source.sellsy_id,
      'source_siren', v_source.siren
    ),
    jsonb_build_object(
      'kind', 'company_merged',
      'source_id', p_source_id,
      'source_name', v_source.name,
      'target_name', v_target.name,
      'moved', v_moved,
      'source', 'manual'
    )
  );

  return v_moved
    || jsonb_build_object('source_name', v_source.name, 'target_name', v_target.name);
end;
$$;

comment on function public.merge_companies(uuid, uuid, uuid) is
  'P5.x.CompanyMerge — fusion atomique source→cible (réaffecte les 10 FK puis DELETE source). Réservé service_role (gardé requireSuperAdmin côté action).';

revoke all on function public.merge_companies(uuid, uuid, uuid) from public;
grant execute on function public.merge_companies(uuid, uuid, uuid) to service_role;

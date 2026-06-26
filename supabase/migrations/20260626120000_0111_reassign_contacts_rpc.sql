-- Migration 0111 — P5.x.ReassignContactsToCompany
--
-- Déplace 1..N contacts d'une société vers une autre (contact saisi sur la
-- mauvaise société, doublon, contact qui change de boîte). Cas d'usage Phil :
-- réaffecter un contact sans le supprimer/recréer (perte d'historique).
--
-- Pourquoi une RPC PL/pgSQL et pas du code applicatif ?
--   supabase-js ne sait pas faire de transaction multi-statement atomique. Or
--   ici on enchaîne : audit par contact + UPDATE contacts + UPDATE prospects
--   qui DOIVENT être tout-ou-rien. Une fonction plpgsql tourne dans une seule
--   transaction Postgres → rollback auto sur exception.
--   Doctrine [[feedback_atomic_tx_via_plpgsql_rpc]] (même pattern que
--   merge_companies, migration 0087).
--
-- Schéma (gotchas vérifiés) :
--   - prospects n'a PAS de colonne `contact_id` : le lien contact↔prospect est
--     `prospects.primary_contact_id` (le prospect suit son contact PRINCIPAL).
--     `billing_contact_id` n'est PAS touché (la facturation peut légitimement
--     pointer vers un contact d'une autre société). [[feedback_postgrest_fk_disambiguation]]
--   - contacts n'a PAS de colonne `updated_at` → on ne la set pas (sinon erreur).
--     prospects EN A une (app-managée, pas de trigger) → on la stampe.
--
-- Statut primary : un seul primary par société. Si la cible n'a pas encore de
-- primary, on garde UN des contacts déplacés qui était primary (le plus
-- ancien) ; tous les autres deviennent secondary.
--
-- security definer : appelée par le service_role depuis la server action
-- (gardée hasAdminAccess). Grant à service_role uniquement.

create or replace function public.reassign_contacts_to_company(
  p_contact_ids uuid[],
  p_target_company_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.companies%rowtype;
  v_target_has_primary boolean;
  v_keep_primary_id uuid := null;
  v_contacts_moved int := 0;
  v_prospects_moved int := 0;
  v_rec record;
begin
  if p_contact_ids is null or cardinality(p_contact_ids) = 0 then
    raise exception 'NO_CONTACTS';
  end if;

  select * into v_target from public.companies where id = p_target_company_id;
  if not found then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  -- La cible a-t-elle déjà un primary (hors contacts en cours de déplacement) ?
  select exists (
    select 1 from public.contacts
    where company_id = p_target_company_id
      and is_primary = true
      and not (id = any(p_contact_ids))
  ) into v_target_has_primary;

  -- Si la cible n'a pas de primary, on en conserve UN parmi les contacts
  -- déplacés qui étaient primary (le plus ancien). Les autres → secondary.
  if not v_target_has_primary then
    select id into v_keep_primary_id
    from public.contacts
    where id = any(p_contact_ids) and is_primary = true
    order by created_at asc
    limit 1;
  end if;

  -- Audit par contact (capture l'ancienne société AVANT l'update).
  for v_rec in
    select
      c.id,
      c.company_id as old_company_id,
      c.email,
      (select count(*) from public.prospects p where p.primary_contact_id = c.id) as prospect_count
    from public.contacts c
    where c.id = any(p_contact_ids)
  loop
    v_contacts_moved := v_contacts_moved + 1;
    insert into public.audit_log (user_id, entity_type, entity_id, action, before, after)
    values (
      p_actor_id,
      'contacts',
      v_rec.id,
      'update',
      jsonb_build_object(
        'kind', 'contact_reassigned',
        'company_id', v_rec.old_company_id,
        'email', v_rec.email
      ),
      jsonb_build_object(
        'kind', 'contact_reassigned',
        'company_id', p_target_company_id,
        'target_name', v_target.name,
        'prospects_moved', v_rec.prospect_count
      )
    );
  end loop;

  -- Déplace les contacts + résout le statut primary (un seul max sur la cible).
  -- NB: (v_keep_primary_id is not null and id = v_keep_primary_id) garantit un
  -- booléen (jamais NULL → is_primary est NOT NULL).
  update public.contacts set
    company_id = p_target_company_id,
    is_primary = (v_keep_primary_id is not null and id = v_keep_primary_id)
  where id = any(p_contact_ids);

  -- Déplace les prospects rattachés via primary_contact_id (le prospect suit
  -- son contact principal).
  update public.prospects set
    company_id = p_target_company_id,
    updated_at = now()
  where primary_contact_id = any(p_contact_ids);
  get diagnostics v_prospects_moved = row_count;

  return jsonb_build_object(
    'moved_contacts', v_contacts_moved,
    'moved_prospects', v_prospects_moved,
    'target_name', v_target.name,
    'kept_primary', v_keep_primary_id
  );
end;
$$;

comment on function public.reassign_contacts_to_company(uuid[], uuid, uuid) is
  'P5.x.ReassignContactsToCompany — déplace N contacts vers une autre société (atomique). Les prospects suivent via primary_contact_id, statut primary résolu (1 max), audit par contact. Réservé service_role (gardé hasAdminAccess côté action).';

revoke all on function public.reassign_contacts_to_company(uuid[], uuid, uuid) from public;
grant execute on function public.reassign_contacts_to_company(uuid[], uuid, uuid) to service_role;

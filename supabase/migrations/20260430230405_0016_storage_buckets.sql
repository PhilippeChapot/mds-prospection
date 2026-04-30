-- Migration 0016 — Storage buckets
-- exhibitor-media : prive (logos, attachments, recap PDFs) — RLS par dossier {company_id}/
-- brand-public    : lecture publique (logos officiels MD/PRS si on veut les servir via Storage)

-- ========================================================================== --
-- Buckets
-- ========================================================================== --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('exhibitor-media', 'exhibitor-media', false, 10485760, array['image/png','image/jpeg','image/svg+xml','image/webp','application/pdf']),
  ('brand-public',    'brand-public',    true,  5242880,  array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

-- ========================================================================== --
-- Policies sur storage.objects
-- ========================================================================== --

-- exhibitor-media : admins R/W complet
create policy "exhibitor_media_admin_all"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'exhibitor-media'
    and public.is_admin_or_sales()
  )
  with check (
    bucket_id = 'exhibitor-media'
    and public.is_admin_or_sales()
  );

-- exhibitor-media : lecture publique signee uniquement (pas de policy anon SELECT)
-- → l'app genere des signed URLs cote serveur quand un partenaire telecharge
--   son recap PDF ou ses factures (TTL court).

-- brand-public : lecture publique (les logos servis depuis le bucket)
create policy "brand_public_read_all"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'brand-public');

-- brand-public : ecriture admin uniquement
create policy "brand_public_admin_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'brand-public'
    and public.is_admin_or_sales()
  );

create policy "brand_public_admin_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'brand-public'
    and public.is_admin_or_sales()
  )
  with check (
    bucket_id = 'brand-public'
    and public.is_admin_or_sales()
  );

create policy "brand_public_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'brand-public'
    and public.is_admin_or_sales()
  );

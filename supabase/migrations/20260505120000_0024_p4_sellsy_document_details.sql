-- ============================================================================
-- 0024 — P4 M3 finitions : persister number + public_url + emitted_at par
-- type de document Sellsy (devis / proforma / facture).
--
-- Sans ces colonnes, l'admin doit fetch Sellsy pour afficher le numero du
-- devis sur la fiche prospect — couteux et lent. On stocke a l'emission.
--
-- public_url = Sellsy public_link (URL prete a partager, accessible sans
-- login Sellsy si public_link_enabled=true au CREATE — quirk #17).
-- emitted_at = timestamp de l'emission (se distingue de last_synced_sellsy_at
-- qui peut etre plus recent si une resync ulterieure a eu lieu).
-- ============================================================================

alter table public.prospects
  add column if not exists sellsy_devis_number text,
  add column if not exists sellsy_devis_public_url text,
  add column if not exists sellsy_devis_emitted_at timestamptz,
  add column if not exists sellsy_proforma_number text,
  add column if not exists sellsy_proforma_public_url text,
  add column if not exists sellsy_proforma_emitted_at timestamptz,
  add column if not exists sellsy_invoice_number text,
  add column if not exists sellsy_invoice_public_url text,
  add column if not exists sellsy_invoice_emitted_at timestamptz;

comment on column public.prospects.sellsy_devis_number is
  'Numero Sellsy du devis (ex: D-20260505-02684), persiste a l''emission.';
comment on column public.prospects.sellsy_devis_public_url is
  'URL publique Sellsy (public_link), accessible sans login si public_link_enabled=true.';
comment on column public.prospects.sellsy_devis_emitted_at is
  'Timestamp d''emission du devis (distinct de last_synced_sellsy_at qui suit les resyncs).';
comment on column public.prospects.sellsy_proforma_number is
  'Numero Sellsy de la proforma.';
comment on column public.prospects.sellsy_proforma_public_url is
  'URL publique Sellsy de la proforma.';
comment on column public.prospects.sellsy_proforma_emitted_at is
  'Timestamp d''emission de la proforma.';
comment on column public.prospects.sellsy_invoice_number is
  'Numero Sellsy de la facture.';
comment on column public.prospects.sellsy_invoice_public_url is
  'URL publique Sellsy de la facture.';
comment on column public.prospects.sellsy_invoice_emitted_at is
  'Timestamp d''emission de la facture.';

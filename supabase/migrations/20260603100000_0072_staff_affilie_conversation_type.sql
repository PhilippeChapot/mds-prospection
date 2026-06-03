-- Migration 0072 — P7.x.AffiliePitchsAndChat : extension messagerie interne
-- pour les affilies (type 'staff_affilie').
--
-- Contexte : P9.2 a livre la messagerie interne (staff_dm + support). P5.x.
-- ExternalEvents a etendu avec 'staff_broadcast' (alerte signup prioritaire).
-- P7.x ajoute 'staff_affilie' : canal direct affilie <-> staff (questions,
-- validation prospects, support partenariat).
--
-- Filtrage par affilie : metadata->>'affiliate_id' (JSONB) - 1 conversation
-- staff_affilie appartient a 1 affilie unique. Filtre cote server actions
-- pour garantir qu un affilie ne voit JAMAIS les conv d un autre affilie.

alter table public.internal_conversations
  drop constraint if exists internal_conversations_type_check;

alter table public.internal_conversations
  add constraint internal_conversations_type_check
  check (type in ('staff_dm', 'support', 'staff_broadcast', 'staff_affilie'));

-- Index pour les requetes affilie : selectionner conv ou metadata.affiliate_id = X.
create index if not exists internal_conversations_affiliate_idx
  on public.internal_conversations ((metadata ->> 'affiliate_id'))
  where type = 'staff_affilie';

comment on constraint internal_conversations_type_check on public.internal_conversations is
  'P7.x.AffiliePitchsAndChat - 4 types : staff_dm (staff DM), support (staff-exposant), staff_broadcast (alerte staff masse), staff_affilie (canal staff-affilie).';

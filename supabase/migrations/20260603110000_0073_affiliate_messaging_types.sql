-- Migration 0073 — P7.x.AffiliePitchsAndChat : extension types polymorphe
-- pour supporter les conversations affilie.
--
-- 0072 a ajoute `staff_affilie` dans internal_conversations.type. Pour que
-- l affilie puisse etre createur de conv + participant + sender de message,
-- il faut etendre 3 autres check constraints :
--
--   internal_conversations.created_by_type        : + 'affiliate'
--   conversation_participants.participant_type    : + 'affiliate'
--   internal_messages.sender_type                 : + 'affiliate'
--
-- L affilie est identifie via `affiliates.id` (auth via cookie JWT
-- affilie_session, pas Supabase auth). Le filtre RGPD entre affilies se
-- fait cote applicatif : un affilie A ne voit JAMAIS les conv d un
-- affilie B (server actions filtrent strictement sur participant_id =
-- session.affiliateId + metadata.affiliate_id).

alter table public.internal_conversations
  drop constraint if exists internal_conversations_created_by_type_check;

alter table public.internal_conversations
  add constraint internal_conversations_created_by_type_check
  check (created_by_type in ('user', 'contact', 'affiliate'));

alter table public.conversation_participants
  drop constraint if exists conversation_participants_participant_type_check;

alter table public.conversation_participants
  add constraint conversation_participants_participant_type_check
  check (participant_type in ('user', 'contact', 'staff_pool', 'affiliate'));

alter table public.internal_messages
  drop constraint if exists internal_messages_sender_type_check;

alter table public.internal_messages
  add constraint internal_messages_sender_type_check
  check (sender_type in ('user', 'contact', 'affiliate'));

-- Index pour les requetes affilie : retrouver les participants de type
-- 'affiliate' avec un participant_id specifique.
create index if not exists conversation_participants_affiliate_idx
  on public.conversation_participants (participant_id)
  where participant_type = 'affiliate';

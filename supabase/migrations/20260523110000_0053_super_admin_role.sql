-- Migration 0053 — P7.x.1.F (Role super_admin)
--
-- Ajoute la valeur 'super_admin' a l'enum public.user_role pour proteger
-- certaines actions sensibles (notamment DELETE d'un affiliate_claim
-- actif, qui pourrait retirer une commission a un affilie de bonne foi).
--
-- Doctrine : un super_admin est un admin "regulier" + privilege de
-- destructive actions. Les helpers `requireSuperAdmin()` cote app
-- s'appuient sur ce role pour gater les actions.
--
-- Promotion manuelle apres deploy via SQL Editor :
--   UPDATE public.users
--   SET role = 'super_admin'
--   WHERE email = 'philippe.chapot@gmail.com';
--
-- L'enum existant `user_role` a ('admin', 'sales') -- on conserve la
-- compatibilite : `'admin'` continue de fonctionner partout, le check
-- super_admin est explicite la ou il s'applique.

alter type public.user_role add value if not exists 'super_admin';

comment on type public.user_role is
  'P7.x.1.F — admin (privilege standard) | sales | super_admin (admin + destructive actions sensibles : delete affiliate_claim actif, etc.).';

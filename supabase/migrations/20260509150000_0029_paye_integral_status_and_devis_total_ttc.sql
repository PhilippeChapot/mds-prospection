-- ============================================================================
-- 0029 — P4.x.2 sujets E + C : statut prospect 'paye_integral' + total TTC devis
--
-- Sujet C : nouvelle doctrine "status auto selon paid_pct" :
--   - 0 < paid_pct < 100% -> status = 'acompte_paye'
--   - paid_pct >= 100%    -> status = 'paye_integral' (NOUVEAU)
-- L'enum actuel ne contient pas 'paye_integral' (P4 M4 utilisait 'signe' pour
-- les paiements integraux, ce qui melangeait paiement et signature).
-- Avec la nouvelle doctrine, 'signe' = signature electronique uniquement.
--
-- Sujet E : 'devis_envoye' EXISTE deja dans l'enum (P3) — pas d'ajout requis.
--
-- Sujet C bis : pour calculer paid_pct, on a besoin du total TTC du devis
-- Sellsy. La colonne acompte_amount_eur (cumul paye) existe deja.
-- On ajoute sellsy_devis_total_ttc, peuple a l'emission devis depuis
-- relatedobject.amounts.total (Sellsy V2). Permet d'eviter de re-fetcher
-- Sellsy a chaque webhook paymentadd ou checkout.session.completed.
-- ============================================================================

alter type public.prospect_status add value if not exists 'paye_integral' after 'acompte_paye';

alter table public.prospects
  add column if not exists sellsy_devis_total_ttc numeric(12, 2);

comment on column public.prospects.sellsy_devis_total_ttc is
  'Montant total TTC du devis Sellsy (en EUR), persiste a l''emission. Source de verite pour calculer le statut paye_integral via comparison vs acompte_amount_eur cumul.';

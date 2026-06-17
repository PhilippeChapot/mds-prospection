-- P5.x.AffiliateAttachUnification — migration 0100
-- Supprime les claims sans aucune cible (company_id IS NULL ET prospect_id IS NULL)
-- et ajoute une contrainte CHECK pour empêcher les futurs orphelins.

-- 1. Supprimer les orphelins stricts : ni société ni prospect lié.
DELETE FROM affiliate_claims
WHERE company_id IS NULL AND prospect_id IS NULL;

-- 2. Empêcher les futurs orphelins : au moins une cible est requise.
ALTER TABLE affiliate_claims
  ADD CONSTRAINT affiliate_claims_has_target
  CHECK (company_id IS NOT NULL OR prospect_id IS NOT NULL);

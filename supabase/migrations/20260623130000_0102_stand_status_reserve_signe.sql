-- P5.x.StandStatusReserveSigne : nouveau statut intermédiaire 'reserve_signe'
-- entre 'reserve' (devis envoyé) et 'paye' (acompte reçu).
--
-- Sémantique :
--   libre        : stand commercialisable
--   reserve      : devis envoyé, pas encore signé
--   reserve_signe: contrat signé, acompte pas encore reçu  ← NOUVEAU
--   paye         : acompte reçu (engagement financier réel)
--   bloque       : hors-vente (couloirs, scènes, techniques)

-- 1. Étendre le CHECK constraint (stands.status est TEXT, pas un enum)
ALTER TABLE public.stands
  DROP CONSTRAINT IF EXISTS stands_status_check;

ALTER TABLE public.stands
  ADD CONSTRAINT stands_status_check
  CHECK (status IN ('libre', 'reserve', 'reserve_signe', 'paye', 'bloque'));

-- 2. Backfill : stands actuellement en 'paye' dont le prospect lié
--    est en 'signe' (contrat signé mais pas encore d'acompte).
--    Ces stands ont été mis en 'paye' par l'ancien syncStandStatusFromProspect
--    qui ne distinguait pas signe / acompte_paye.
DO $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.stands
  SET status = 'reserve_signe',
      updated_at = now()
  WHERE status = 'paye'
    AND prospect_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.prospects
      WHERE id = stands.prospect_id
        AND status = 'signe'
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'P5.x.StandStatusReserveSigne — stands migrated paye→reserve_signe: %', updated_count;
END $$;

COMMENT ON COLUMN public.stands.status IS
  'Statut commercial : libre|reserve (devis)|reserve_signe (contrat signé)|paye (acompte reçu)|bloque (hors-vente). P5.x.StandStatusReserveSigne';

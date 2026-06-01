/**
 * P6.x.1a-quinquies — helper centralise pour le filtrage des produits
 * MDS par prefixe de reference (case-insensitive).
 *
 * Phil utilise le meme compte Sellsy pour plusieurs business (MDS,
 * Editions HF Brive, RadioHouse, La Lettre Pro). Tous les produits
 * MDS ont une reference prefixee 'MDS-' (convention etablie en
 * P6.x.1a + P6.x.1a-quater). Ce helper expose un check unique
 * reutilise par la sync ET les queries lecture (defense in depth).
 */

/** Prefixe de reference case-insensitive. */
export const MDS_PRODUCT_PREFIX = 'MDS-';

/** Pattern SQL ILIKE pour les requetes Postgres directes. */
export const MDS_REFERENCE_ILIKE_PATTERN = 'MDS-%';

/**
 * Verifie qu une reference Sellsy correspond a un produit MDS.
 * Case-insensitive : 'mds-', 'Mds-', 'MDS-' matchent tous.
 * Retourne false pour null/undefined/empty.
 */
export function isMdsReference(reference: string | null | undefined): boolean {
  if (!reference) return false;
  return reference.toUpperCase().startsWith(MDS_PRODUCT_PREFIX);
}

/**
 * P6.x.MultiBooths — helpers partagés entre les server actions stands.
 *
 * Module *non* `'use server'` : ces helpers prennent un client Supabase déjà
 * obtenu en paramètre (non sérialisable), ils ne peuvent donc pas être exportés
 * depuis un fichier d'actions. Ils restent purement internes (appelés par
 * actions.ts et multi-booth-actions.ts).
 */

/**
 * Recalcule prospects.booth_assignment (champ texte legacy P5.x.10, lu côté
 * espace-partenaire) à partir des stands actuellement assignés au prospect.
 * Multi-stand → liste jointe triée ("A05, B03"), ou null si plus aucun stand.
 *
 * SupabaseClient typé `any` volontairement : on réutilise le service-role
 * client déjà obtenu par le caller (évite un 2e getClient).
 */
export async function recomputeBoothAssignment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  prospectId: string,
): Promise<string | null> {
  const { data } = await supabase.from('stands').select('number').eq('prospect_id', prospectId);
  const numbers = (data ?? [])
    .map((r: { number: string }) => r.number)
    .sort((a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true }));
  return numbers.length > 0 ? numbers.join(', ') : null;
}

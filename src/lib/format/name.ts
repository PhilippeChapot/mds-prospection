/**
 * Capitalisation des prenoms / noms a l'affichage — P5.x.3.
 *
 * Source MDS : les prenoms saisis dans le wizard public sont stockes
 * bruts en DB (doctrine moderne : ne pas normaliser cote stockage,
 * laisser la liberte d'edition). On capitalize uniquement a l'affichage.
 *
 * Cas geres :
 *   - simple    : "phil"          -> "Phil"
 *   - multi mot : "marie claire"   -> "Marie Claire"
 *   - composite : "jean-pierre"    -> "Jean-Pierre"  (split sur - et espace)
 *   - prefixe   : "marie-claude"   -> "Marie-Claude"
 *   - apostrophe: "d'arc"          -> "D'Arc"        (split sur ')
 *   - mixte     : "JEAN-Pierre"    -> "Jean-Pierre"  (lowercase puis cap)
 *   - empty     : "" / null        -> ""
 *
 * Volontairement simple : on ne traite pas les particules ("de", "du",
 * "von", "van", "le") qui restent en minuscule selon la convention,
 * car la liste est culturellement ambigue (ex: "Le Monde" garde "Le"
 * majuscule en ouverture). La regle "first letter of each subtoken =
 * uppercase" est conservatrice mais correcte dans 99% des cas.
 */

export function capitalizeName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  // Split sur espace, tiret ou apostrophe en preservant le separateur
  // pour pouvoir reconstruire la chaine identique (sans normaliser les
  // espaces multiples).
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

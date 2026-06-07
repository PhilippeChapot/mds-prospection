/**
 * P5.x.PhoneEnrichmentDisplay — helpers de normalisation + formatage
 * telephone.
 *
 * Storage : E.164 (`+33XXXXXXXXX`) cote DB pour permettre les liens
 * `tel:` cliquables (Mac Continuity, mobile native dialer).
 *
 * Display : format FR humanise (`01 23 45 67 89`) pour les listes admin.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure
 * functions sync, pas de 'use server'. Importable de partout (script
 * enrichment, server actions, composants React client).
 */

/**
 * Normalise un numero (chaine libre) vers E.164.
 *
 *  - "01 42 36 78 90"       -> "+33142367890"
 *  - "+33 1 42 36 78 90"    -> "+33142367890"
 *  - "0142367890"           -> "+33142367890"
 *  - "33142367890"          -> "+33142367890"
 *  - "+442079460958"        -> "+442079460958" (international garde)
 *  - "NULL" / null / ""     -> null
 *  - garbage / trop court   -> null
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toUpperCase() === 'NULL') return null;

  // International explicite (commence par +).
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Format FR national (10 chiffres commencant par 0).
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+33${digits.slice(1)}`;
  }
  // Format FR international sans + (11 chiffres : 33 + 9).
  if (digits.length === 11 && digits.startsWith('33')) {
    return `+${digits}`;
  }
  // 9 chiffres : on suppose FR sans le 0 initial.
  if (digits.length === 9) {
    return `+33${digits}`;
  }

  // International possible (>= 8 chiffres) mais sans + → on n a pas le
  // pays, on refuse pour eviter de stocker une chaine ambigue.
  return null;
}

/**
 * Formate un E.164 pour affichage UI. FR → "01 23 45 67 89", autre →
 * regroupe par paires (best effort).
 *
 *  - "+33142367890"   -> "01 42 36 78 90"
 *  - "+442079460958"  -> "+44 20 79 46 09 58"
 *  - null             -> null
 */
export function formatPhoneForDisplay(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const value = String(e164).trim();
  if (!value || !value.startsWith('+')) return value || null;

  // Cas FR : +33 + 9 chiffres → "0X XX XX XX XX".
  if (value.startsWith('+33') && value.length === 12) {
    const d = value.slice(3); // 9 chiffres
    return `0${d.slice(0, 1)} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }

  // International generique : on extrait le country code via une map des
  // longueurs connues (les pays a 1 chiffre = NANP/Russie, 2 chiffres =
  // UK/DE/IT/etc., 3 chiffres = reste). On fallback sur 2 chiffres si
  // longueur unknown — couvre 90% des cas.
  const onlyDigits = value.slice(1);
  const country1 = onlyDigits.slice(0, 1);
  const country3 = onlyDigits.slice(0, 3);
  let ccLen = 2;
  if (country1 === '1' || country1 === '7') ccLen = 1;
  else if (
    ['350', '351', '352', '353', '354', '355', '356', '358', '359', '420', '421'].includes(country3)
  )
    ccLen = 3;

  const countryCode = `+${onlyDigits.slice(0, ccLen)}`;
  const rest = onlyDigits.slice(ccLen);
  // Groupes de 2 a partir de la fin pour rester lisible.
  const groups: string[] = [];
  let remaining = rest;
  while (remaining.length > 2) {
    groups.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }
  if (remaining) groups.unshift(remaining);
  return `${countryCode} ${groups.join(' ')}`;
}

/**
 * Helper unifie pour stocker (E.164) + retourner display en meme temps.
 * Utile cote script d enrichissement et UI.
 */
export function parsePhone(raw: string | null | undefined): {
  e164: string | null;
  display: string | null;
} {
  const e164 = normalizePhoneE164(raw);
  return { e164, display: formatPhoneForDisplay(e164) };
}

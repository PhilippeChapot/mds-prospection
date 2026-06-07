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
 * P5.x.PhoneEnrichmentDisplay-bis — country codes ITU-T E.164 connus
 * pour reconnaitre les prefixes pays nus (sans `+`). Sources curated :
 * NANP + EU pays principaux + IL + APAC populaires.
 *
 * Note : 1 = NANP (US/CA/etc.), 7 = Russie/Kazakhstan.
 */
const KNOWN_COUNTRY_CODES = new Set<string>([
  // 1 chiffre
  '1', // NANP (US, CA, etc.)
  '7', // RU, KZ
  // 2 chiffres
  '20', // EG
  '27', // ZA
  '30', // GR
  '31', // NL
  '32', // BE
  '33', // FR
  '34', // ES
  '36', // HU
  '39', // IT
  '40', // RO
  '41', // CH
  '43', // AT
  '44', // GB
  '45', // DK
  '46', // SE
  '47', // NO
  '48', // PL
  '49', // DE
  '51', // PE
  '52', // MX
  '54', // AR
  '55', // BR
  '56', // CL
  '57', // CO
  '58', // VE
  '60', // MY
  '61', // AU
  '62', // ID
  '63', // PH
  '64', // NZ
  '65', // SG
  '66', // TH
  '81', // JP
  '82', // KR
  '84', // VN
  '86', // CN
  '90', // TR
  '91', // IN
  '92', // PK
  '94', // LK
  '98', // IR
  // 3 chiffres (sous-ensemble courant)
  '212', // MA
  '213', // DZ
  '216', // TN
  '218', // LY
  '220', // GM
  '221', // SN
  '225', // CI
  '230', // MU
  '233', // GH
  '234', // NG
  '237', // CM
  '243', // CD
  '350', // GI
  '351', // PT
  '352', // LU
  '353', // IE
  '354', // IS
  '355', // AL
  '356', // MT
  '357', // CY
  '358', // FI
  '359', // BG
  '370', // LT
  '371', // LV
  '372', // EE
  '380', // UA
  '381', // RS
  '385', // HR
  '386', // SI
  '387', // BA
  '389', // MK
  '420', // CZ
  '421', // SK
  '423', // LI
  '852', // HK
  '886', // TW
  '961', // LB
  '962', // JO
  '965', // KW
  '966', // SA
  '971', // AE
  '972', // IL
  '974', // QA
  '975', // BT
]);

/**
 * Normalise un numero (chaine libre) vers E.164.
 *
 *  - "01 42 36 78 90"       -> "+33142367890"
 *  - "+33 1 42 36 78 90"    -> "+33142367890"
 *  - "0142367890"           -> "+33142367890"
 *  - "33142367890"          -> "+33142367890"
 *  - "+442079460958"        -> "+442079460958" (international garde)
 *  - "34699248200"          -> "+34699248200"  (ES sans +)
 *  - "49 1514 2613393"      -> "+4915142613393" (DE sans +)
 *  - "972 9 744 0055"       -> "+97297440055"  (IL sans +)
 *  - "NULL" / null / ""     -> null
 *  - garbage / trop court   -> null
 *
 * @param raw chaine libre du XLSX / DB / input user.
 * @param defaultCountryCode prefixe pays par defaut quand 9 chiffres
 *   ambigus ('33' = FR par defaut, '34' pour ES, etc.). Mettre `null`
 *   pour desactiver l auto-FR (V1 conservatif = '33').
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  defaultCountryCode: string | null = '33',
): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toUpperCase() === 'NULL') return null;

  // 1. International explicite (commence par +) → trust.
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // 2. Format FR national (10 chiffres commencant par 0).
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+33${digits.slice(1)}`;
  }
  // 3. Format FR international sans + (11 chiffres : 33 + 9).
  if (digits.length === 11 && digits.startsWith('33')) {
    return `+${digits}`;
  }

  // 4. 9 chiffres sans 0 initial → suppose defaultCountryCode (FR par defaut).
  //    Check AVANT prefix detection pour eviter le faux positif "1" NANP
  //    sur des numeros FR sans 0 (ex: 142367890 → +33142367890 et pas
  //    +142367890 NANP).
  if (digits.length === 9 && defaultCountryCode) {
    return `+${defaultCountryCode}${digits}`;
  }

  // 5. P5.x.PhoneEnrichmentDisplay-bis : detecter un prefixe pays nu.
  //    On essaye 3 chiffres puis 2 puis 1 par ordre decroissant
  //    (KNOWN_COUNTRY_CODES). Apres prefixe, verifier que le reste est
  //    plausible (7-12 chiffres = bornes E.164 raisonnables).
  for (const prefixLen of [3, 2, 1]) {
    if (digits.length <= prefixLen + 6) continue; // trop court pour ce prefixe
    const prefix = digits.slice(0, prefixLen);
    if (KNOWN_COUNTRY_CODES.has(prefix)) {
      const rest = digits.slice(prefixLen);
      if (rest.length >= 7 && rest.length <= 12) {
        return `+${digits}`;
      }
    }
  }

  // 6. International possible mais sans prefix connu → refuse.
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

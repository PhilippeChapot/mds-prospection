/**
 * P6.x.4-a-ter — table de traduction EN des 69 sous-secteurs MDS 2026.
 *
 * Le JSON taxonomie reste l'unique source de vérité côté FR (parsé depuis
 * src/data/mds-taxonomy.md). Les libellés sont retournés tels quels pour
 * la locale 'fr' ; pour 'en', on lookup cette table. Fallback FR + log
 * console.warn si un libellé n'a pas son équivalent EN (drift markdown).
 *
 * À mettre à jour manuellement si un nouveau sous-secteur apparaît dans
 * le markdown source.
 */

const SUB_SECTOR_EN: Record<string, string> = {
  // RÉGIES & RETAIL MEDIA
  'Régies TV': 'TV media agencies',
  'Régies Radio': 'Radio media agencies',
  'Régies Presse / Digital': 'Press / Digital media agencies',
  'Régies PQR': 'Regional press media agencies',
  "Régies OOH / Outdoor (vendeurs d'espace)": 'OOH / Outdoor media agencies (space sellers)',
  'Régies Retail Media (enseignes)': 'Retail Media agencies (retailers)',
  'Régies digitales & spécialisées': 'Digital & specialized media agencies',
  'Plateformes pub grand compte': 'Major ad platforms',
  'Agences créatives': 'Creative agencies',
  'Agences content / branded': 'Content / branded agencies',
  'Éditeurs médias premium': 'Premium media publishers',
  'Événementiel / services médias': 'Events / media services',

  // AUDIO & RADIO
  'Diffusion audio broadcast (codecs, AoIP, automation)':
    'Audio broadcast distribution (codecs, AoIP, automation)',
  'Hébergement & plateformes audio/radio': 'Audio/radio hosting & platforms',
  'Ad insertion / programmatique audio': 'Audio ad insertion / programmatic',
  "Mesure d'audience audio": 'Audio audience measurement',
  'Outils de production audio': 'Audio production tools',
  'IA voix / synthèse vocale': 'Voice AI / TTS',
  'Studios production & habillage (jingles, imagerie)':
    'Production & branding studios (jingles, imaging)',
  'Équipement audio pro (micros, monitoring)': 'Pro audio equipment (mics, monitoring)',
  'Logiciels radio (automation, programmation, music scheduling)':
    'Radio software (automation, scheduling, music scheduling)',
  'Radio hybride / automobile / connectée': 'Hybrid / connected / automotive radio',
  'Visuel radio / Radio visuelle / Apps plateau': 'Visual radio / Studio apps',
  'Conseil / stratégie radio': 'Radio strategy & consulting',
  'Formation / emploi audio': 'Audio training & jobs',
  'Intégrateurs broadcast & studio radio': 'Broadcast & studio integrators',
  'Promotion musicale & RP artistes': 'Music promotion & artist PR',

  // DIFFUSION & INFRA
  'Opérateurs FM / DAB+': 'FM / DAB+ operators',
  'Émetteurs & infrastructure RF': 'Transmitters & RF infrastructure',
  'Satellites & fibre broadcast': 'Satellite & fiber broadcast',
  'Cloud broadcast & CDN': 'Cloud broadcast & CDN',
  'Transmission live IP / 5G': 'Live IP / 5G transmission',
  'Ad serving vidéo / audio': 'Video / audio ad serving',
  'Playout / Distribution multicanale': 'Playout / Multi-channel distribution',
  'Alertes / sécurité diffusion': 'Broadcast alerts / safety',
  'Streaming & OTT tech': 'Streaming & OTT tech',

  // VIDÉO & CTV
  'Players & CMS vidéo': 'Video players & CMS',
  'Solutions streaming / live': 'Streaming / live solutions',
  'CTV / AVOD / FAST': 'CTV / AVOD / FAST',
  'Monétisation vidéo': 'Video monetization',
  'Analytics vidéo & QoE': 'Video analytics & QoE',
  'Optimisation contenu / IA vidéo': 'Content optimization / Video AI',
  'Production — caméras & capture': 'Production — cameras & capture',
  'Production — post-prod & édition': 'Production — post-production & editing',
  'Production — live / régie / mélangeurs': 'Production — live / studio / mixers',
  'Éclairage plateau & cinéma': 'Studio & cinema lighting',
  'Écrans pro & LED (studio / plateau)': 'Pro & LED displays (studio)',
  'Intercom & communication plateau': 'Studio intercom & communication',
  'Intégrateurs AV': 'AV integrators',
  'Découpage / redistribution sociale': 'Social clipping / redistribution',

  // OUTDOOR & DOOH
  'Plateformes DOOH / Programmatique DOOH': 'DOOH platforms / Programmatic DOOH',
  'Data géolocalisée (usage DOOH)': 'Geolocated data (DOOH use)',
  'Technologies écrans connectés (outdoor / retail)':
    'Connected screen technologies (outdoor / retail)',
  'Mobilier urbain connecté': 'Connected street furniture',
  'CMS / Signage software': 'CMS / Signage software',
  'In-store audio & ambiance': 'In-store audio & atmosphere',

  // DATA & ADTECH
  "Mesure d'audience & certification": 'Audience measurement & certification',
  'DSP (achat programmatique)': 'DSP (programmatic buying)',
  'SSP (vente programmatique)': 'SSP (programmatic selling)',
  'Data clean rooms': 'Data clean rooms',
  'CDP / DMP': 'CDP / DMP',
  'Attribution & mesure': 'Attribution & measurement',
  'Retail Media Tech': 'Retail Media Tech',
  'IA marketing & data science': 'Marketing AI & data science',
  'Consent & privacy tech': 'Consent & privacy tech',
  'Fintech média / Monétisation / Subscription': 'Media fintech / Monetization / Subscription',
  'Identifiants alternatifs (post-cookies)': 'Alternative IDs (post-cookies)',
  'Performance / affiliation': 'Performance / affiliation',
  'Pub éditorialisée': 'Editorial advertising',
};

export function getSubSectorLabel(frenchName: string, locale: string): string {
  if (locale === 'en') {
    const en = SUB_SECTOR_EN[frenchName];
    if (en) return en;
    console.warn('[i18n] sous-secteur sans traduction EN, fallback FR:', frenchName);
    return frenchName;
  }
  return frenchName;
}

export function listSubSectorTranslations(): Record<string, string> {
  return SUB_SECTOR_EN;
}

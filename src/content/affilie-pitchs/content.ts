/**
 * P7.x.AffiliePitchsAndChat — contenu structure de la rubrique "Mes pitchs"
 * (espace affilie).
 *
 * Source de verite : 3 DOCX rediges par Phil (FR-tu, FR-vous, EN), extraits
 * en V1 dans cette constante TypeScript pour iteration rapide. V2 future :
 * editeur admin / DB si besoin d'updates frequents.
 *
 * Bilingue obligatoire (doctrine [[feedback_traduction_ia_emails_mds]]).
 *
 * Le contenu suit la structure du DOCX FR vouvoiement (forme officielle B2B) :
 *   hero -> pitch20s -> 5 poles -> 3 cities -> Solutions vs Classic ->
 *   golden rule -> 4 arguments -> objections -> how to conclude -> closing line.
 */

export interface AffilieContent {
  hero: {
    title: string;
    subtitle: string;
    intro: string;
    plural_note: string;
  };
  pitch20s: {
    title: string;
    text: string;
  };
  poles: {
    title: string;
    intro: string;
    items: Array<{ emoji: string; label: string; description: string }>;
  };
  cities: {
    title: string;
    items: Array<{ city: string; date: string; venue: string; tag?: string }>;
    organizer_note: string;
  };
  paris_radio_show: {
    title: string;
    text: string;
    argument: string;
  };
  arguments: {
    title: string;
    items: Array<{ heading: string; body: string }>;
  };
  classic_comparison: {
    title: string;
    intro: string;
    what_is_classic: string;
    table: {
      header_solutions: string;
      header_classic: string;
      rows: Array<{ label: string; solutions: string; classic: string }>;
    };
  };
  golden_rule: {
    title: string;
    text: string;
    doubt: string;
  };
  objections: {
    title: string;
    items: Array<{ question: string; answer: string }>;
  };
  how_to_conclude: {
    title: string;
    steps: string[];
  };
  closing_line: {
    title: string;
    text: string;
  };
}

export const AFFILIE_CONTENT_FR: AffilieContent = {
  hero: {
    title: 'Vos pitchs pour démarcher',
    subtitle: 'Argumentaire affilié — recruter des Partenaires & Sponsors',
    intro:
      'Votre rôle en une phrase : amener des sociétés tech des médias à devenir Partenaires ou Sponsors des MediaDays Solutions. Ce document vous donne le pitch, les arguments, les réponses aux objections — et la règle à ne jamais oublier : vous rapportez des partenaires pour les MediaDays Solutions, pas pour les MediaDays Classic.',
    plural_note:
      "À retenir : on dit toujours « aux MediaDays » (au pluriel) — c'est une marque pluriel.",
  },
  pitch20s: {
    title: 'Le pitch en 20 secondes',
    text: "« Les MediaDays Solutions, c'est le seul rendez-vous français qui réunit toute la chaîne tech des médias : audio, radio, vidéo, CTV, outdoor, DOOH, diffusion et data sur un même salon. En face de vous : les décideurs des radios, TV, plateformes et régies qui viennent acheter, comparer et signer. Trois villes — Marseille, Paris, Bruxelles — fin 2026. Réservez votre espace avant que votre pôle ne sature. »",
  },
  poles: {
    title: 'Les 5 pôles',
    intro:
      'Le salon est structuré en cinq pôles, calqués sur les lignes de force du marché. Chaque pôle réunit fabricants, intégrateurs, distributeurs et prestataires face aux médias qui achètent et déploient leurs technologies.',
    items: [
      {
        emoji: '🎙️',
        label: 'Audio & Radio',
        description:
          "C'est le Paris Radio Show : fabricants broadcast, plateformes podcast, régies et technos audio. Le pôle audio des MediaDays Solutions, c'est lui.",
      },
      {
        emoji: '🎥',
        label: 'Vidéo & CTV',
        description:
          'Caméras, captation, streaming, télévision connectée et acteurs de la vidéo premium.',
      },
      {
        emoji: '📢',
        label: 'Outdoor & DOOH',
        description: 'Affichage dynamique, régies outdoor, publicité extérieure programmatique.',
      },
      {
        emoji: '📡',
        label: 'Diffusion & Infra',
        description:
          "Émetteurs, satellite, réseaux, cloud broadcast, 5G — toute l'infrastructure de diffusion.",
      },
      {
        emoji: '📊',
        label: 'Data & Adtech',
        description:
          'Chaîne programmatique et mesure : DSP, SSP, DMP, CDP, clean rooms, attribution cross-média, IA.',
      },
    ],
  },
  cities: {
    title: 'Les 3 étapes — fin 2026',
    items: [
      { city: 'Marseille', date: '10 décembre 2026', venue: 'Palais du Pharo' },
      {
        city: 'Paris',
        date: '15 décembre 2026',
        venue: 'Carrousel du Louvre',
        tag: 'Étape principale — intègre le Paris Radio Show',
      },
      {
        city: 'Bruxelles',
        date: '26 novembre 2026',
        venue: 'Mix Brussels',
        tag: 'Étape internationale',
      },
    ],
    organizer_note:
      'Organisé par Havas, avec Editions HF — Podcast & RadioHouse (Brive) comme prestataire technique (espace & logistique). Toutes les infos partenaire : mediadays.solutions.',
  },
  paris_radio_show: {
    title: '« Et le Paris Radio Show, alors ? »',
    text: "Le Paris Radio Show n'est pas un salon séparé : c'est le pôle Audio & Radio des MediaDays Solutions. Si vous démarchez un fabricant broadcast, une plateforme podcast ou une régie audio, vous lui parlez du Paris Radio Show — et il est présent au Carrousel du Louvre le 15 décembre, dans le même territoire que les quatre autres pôles.",
    argument:
      "Argument fort pour l'audio : « Le Paris Radio Show garde toute son audience radio/podcast historique, mais vos visiteurs croisent désormais aussi les acheteurs vidéo, data et diffusion. Vous touchez plus large, sans changer de salon. »",
  },
  arguments: {
    title: 'Les 4 arguments qui font signer',
    items: [
      {
        heading: "Une audience qu'aucun autre salon ne réunit",
        body: "Responsables techniques de groupes médias, DSI d'antennes, directeurs broadcast, acheteurs d'infrastructures, patrons de studios podcast, trading desks programmatique — sous un même toit.",
      },
      {
        heading: 'Un territoire en convergence, pas une niche',
        body: 'Le partenaire ne touche pas que « son » secteur : il rencontre des acheteurs des pôles voisins, là où se font les vraies opportunités de demain.',
      },
      {
        heading: 'Trois villes, un seul événement',
        body: 'Marseille, Paris et Bruxelles : présence nationale et ouverture internationale dans un seul partenariat.',
      },
      {
        heading: 'La place se réserve avant que le pôle ne sature',
        body: "Le nombre de stands est limité (≈ 184 au Carrousel). C'est un argument d'urgence réel : les meilleurs emplacements partent en premier.",
      },
    ],
  },
  classic_comparison: {
    title: 'MediaDays Solutions ≠ MediaDays Classic',
    intro:
      'Il existe deux événements sous le nom MediaDays. Vous devez savoir les distinguer — pour ne pas vous tromper de cible, et pour répondre clairement si un prospect vous pose la question.',
    what_is_classic:
      "Les MediaDays Classic, c'est l'événement « historique » organisé par Havas depuis 2023. Il rassemble le monde des régies, du retail media, des agences et des éditeurs — autrement dit la vente d'espace publicitaire et la monétisation média côté annonceurs. C'est un univers respectable et complémentaire, mais c'est un autre périmètre, avec son propre site : mediadays.net.",
    table: {
      header_solutions: 'MediaDays SOLUTIONS',
      header_classic: 'MediaDays CLASSIC',
      rows: [
        {
          label: 'Organisateur',
          solutions: 'Havas — Editions HF prestataire technique (espace & logistique)',
          classic: 'Havas',
        },
        {
          label: 'Périmètre',
          solutions: 'Tech des médias : audio, radio, vidéo, CTV, outdoor, DOOH, diffusion, data',
          classic: 'Régies, retail media, agences, éditeurs',
        },
        {
          label: 'Site partenaire',
          solutions: 'mediadays.solutions',
          classic: 'mediadays.net',
        },
        {
          label: 'Votre affiliation',
          solutions: "✅ OUI — c'est votre terrain",
          classic: '❌ NON — hors périmètre',
        },
      ],
    },
  },
  golden_rule: {
    title: "⚠️ La règle d'or de votre affiliation",
    text: 'Vous rapportez des partenaires pour les MediaDays Solutions (les 5 pôles tech, site mediadays.solutions). Vous ne démarchez jamais pour les MediaDays Classic : les régies, le retail media, les agences créa et les éditeurs presse/digital relèvent de Havas et ne comptent pas dans votre affiliation.',
    doubt:
      "En cas de doute sur un prospect : « Est-ce qu'il fabrique, distribue ou opère une techno média ? » Si oui → c'est pour vous. Si c'est une régie qui vend de la pub → c'est Classic, pas vous.",
  },
  objections: {
    title: 'Réponses aux objections',
    items: [
      {
        question: "« C'est un nouveau salon, je ne connais pas. »",
        answer:
          "« Le pôle Audio, c'est le Paris Radio Show — un événement installé, avec son audience. Les MediaDays Solutions l'élargissent à toute la chaîne tech : vous bénéficiez de la notoriété PRS plus d'un public d'acheteurs beaucoup plus large. »",
      },
      {
        question: "« Je suis déjà présent sur d'autres salons / aux MediaDays Classic. »",
        answer:
          "« Ce n'est pas le même public. Classic réunit les régies et les annonceurs ; Solutions réunit ceux qui achètent et déploient de la techno média. Vos clients techniques sont chez Solutions. »",
      },
      {
        question: "« C'est cher pour un stand. »",
        answer:
          "« Combien vaut un rendez-vous avec un directeur broadcast ou un DSI d'antenne ? Ici vous en croisez des dizaines en trois jours, dans trois villes. Le coût par contact qualifié est imbattable. Et il y a plusieurs formats d'espace selon votre budget. »",
      },
      {
        question: "« Je n'ai pas le temps d'organiser ça. »",
        answer:
          "« L'inscription se fait en ligne sur mediadays.solutions, et l'équipe vous accompagne. Réservez l'emplacement maintenant, on cale les détails ensuite — l'important c'est de sécuriser la place avant que le pôle ne sature. »",
      },
    ],
  },
  how_to_conclude: {
    title: 'Comment conclure',
    steps: [
      "Qualifiez : le prospect fabrique/distribue/opère une techno média ? (sinon, ce n'est pas un partenaire Solutions).",
      'Placez-le dans son pôle et nommez un bénéfice concret : « vous êtes pile dans le pôle Vidéo & CTV, juste à côté des acheteurs broadcast ».',
      "Créez l'urgence : nombre de stands limité, meilleurs emplacements d'abord.",
      "Orientez vers l'action : réservation sur mediadays.solutions, ou transmettez le contact pour qu'on prenne le relais.",
    ],
  },
  closing_line: {
    title: 'Le mot de la fin',
    text: "« Les MediaDays Solutions, c'est le hotspot européen où se rencontrent ceux qui construisent les médias de demain. Et il reste de la place dans votre pôle — pour l'instant. »",
  },
};

export const AFFILIE_CONTENT_EN: AffilieContent = {
  hero: {
    title: 'Your pitches for outreach',
    subtitle: 'Affiliate pitch — recruiting Partners & Sponsors',
    intro:
      'Your role in one sentence: get media-tech companies to become Partners or Sponsors of the MediaDays Solutions. This document gives you the pitch, the arguments, the objection-handling — and the one rule never to forget: you bring in partners for the MediaDays Solutions, not for the MediaDays Classic.',
    plural_note: 'Note: the brand is plural — always "the MediaDays".',
  },
  pitch20s: {
    title: 'The 20-second pitch',
    text: '"The MediaDays Solutions is the only French event that brings together the entire media-tech value chain: audio, radio, video, CTV, outdoor, DOOH, broadcast and data on a single show floor. Across the aisle: the decision-makers from radio, TV, platforms and ad networks who come to buy, compare and sign. Three cities — Marseille, Paris, Brussels — late 2026. Book your space before your sector fills up."',
  },
  poles: {
    title: 'The 5 sectors',
    intro:
      "The show is built around five sectors, mapped to the market's driving forces. Each sector brings together manufacturers, integrators, distributors and service providers, facing the media buyers who deploy their technology.",
    items: [
      {
        emoji: '🎙️',
        label: 'Audio & Radio',
        description:
          "This is the Paris Radio Show: broadcast manufacturers, podcast platforms, audio ad networks and technology. The audio sector of the MediaDays Solutions — that's it.",
      },
      {
        emoji: '🎥',
        label: 'Video & CTV',
        description: 'Cameras, capture, streaming, connected TV and premium video players.',
      },
      {
        emoji: '📢',
        label: 'Outdoor & DOOH',
        description: 'Digital signage, outdoor ad networks, programmatic out-of-home advertising.',
      },
      {
        emoji: '📡',
        label: 'Broadcast & Infra',
        description:
          'Transmitters, satellite, networks, cloud broadcast, 5G — the full broadcast infrastructure.',
      },
      {
        emoji: '📊',
        label: 'Data & Adtech',
        description:
          'Programmatic and measurement chain: DSP, SSP, DMP, CDP, clean rooms, cross-media attribution, AI.',
      },
    ],
  },
  cities: {
    title: 'Three stops — late 2026',
    items: [
      { city: 'Marseille', date: '10 December 2026', venue: 'Palais du Pharo' },
      {
        city: 'Paris',
        date: '15 December 2026',
        venue: 'Carrousel du Louvre',
        tag: 'Flagship stop — includes the Paris Radio Show',
      },
      {
        city: 'Brussels',
        date: '26 November 2026',
        venue: 'Mix Brussels',
        tag: 'International stop',
      },
    ],
    organizer_note:
      'Organised by Havas, with Editions HF — Podcast & RadioHouse (Brive) as technical provider (space & logistics). Full partner information: mediadays.solutions.',
  },
  paris_radio_show: {
    title: '"And what about the Paris Radio Show?"',
    text: 'The Paris Radio Show is not a separate show: it is the Audio & Radio sector of the MediaDays Solutions. If you approach a broadcast manufacturer, a podcast platform or an audio ad network, you talk to them about the Paris Radio Show — and they are present at the Carrousel du Louvre on 15 December, in the same space as the four other sectors.',
    argument:
      'Strong argument for audio: "The Paris Radio Show keeps its entire historic radio/podcast audience, but your visitors now also cross paths with video, data and broadcast buyers. You reach a wider audience without switching shows."',
  },
  arguments: {
    title: 'The 4 arguments that close the deal',
    items: [
      {
        heading: 'An audience no other show brings together',
        body: 'Technical directors of media groups, station CIOs, broadcast directors, infrastructure buyers, podcast studio heads, programmatic trading desks — all under one roof.',
      },
      {
        heading: 'A converging space, not a niche',
        body: 'Partners don\'t just reach "their" sector: they meet buyers from the neighbouring sectors, where tomorrow\'s real opportunities lie.',
      },
      {
        heading: 'Three cities, one event',
        body: 'Marseille, Paris and Brussels: national presence and international reach in a single partnership.',
      },
      {
        heading: 'Space books up before the sector fills',
        body: 'The number of stands is limited (≈ 184 at the Carrousel). It is a real urgency argument: the best locations go first.',
      },
    ],
  },
  classic_comparison: {
    title: 'MediaDays Solutions ≠ MediaDays Classic',
    intro:
      "There are two events under the MediaDays name. You need to tell them apart — so you don't target the wrong companies, and so you can answer clearly if a prospect asks.",
    what_is_classic:
      'MediaDays Classic is the "legacy" event organised by Havas since 2023. It brings together the world of ad networks, retail media, agencies and publishers — in other words, ad-space sales and media monetisation on the advertiser side. It is a respectable, complementary world, but it is a different scope, with its own website: mediadays.net.',
    table: {
      header_solutions: 'MediaDays SOLUTIONS',
      header_classic: 'MediaDays CLASSIC',
      rows: [
        {
          label: 'Organiser',
          solutions: 'Havas — Editions HF technical provider (space & logistics)',
          classic: 'Havas',
        },
        {
          label: 'Scope',
          solutions: 'Media tech: audio, radio, video, CTV, outdoor, DOOH, broadcast, data',
          classic: 'Ad networks, retail media, agencies, publishers',
        },
        {
          label: 'Partner site',
          solutions: 'mediadays.solutions',
          classic: 'mediadays.net',
        },
        {
          label: 'Your affiliation',
          solutions: '✅ YES — this is your turf',
          classic: '❌ NO — out of scope',
        },
      ],
    },
  },
  golden_rule: {
    title: '⚠️ The golden rule of your affiliation',
    text: 'You bring in partners for the MediaDays Solutions (the 5 tech sectors, site mediadays.solutions). You never prospect for the MediaDays Classic: ad networks, retail media, creative agencies and press/digital publishers belong to Havas and do not count toward your affiliation.',
    doubt:
      'When in doubt about a prospect: "Do they build, distribute or operate media technology?" If yes → it is for you. If it is an ad network that sells advertising → it is Classic, not you.',
  },
  objections: {
    title: 'Objection-handling',
    items: [
      {
        question: '"It\'s a new show, I don\'t know it."',
        answer:
          '"The Audio sector is the Paris Radio Show — an established event with its own audience. The MediaDays Solutions expand it to the whole tech value chain: you get the Paris Radio Show\'s reputation plus a much wider buyer audience."',
      },
      {
        question: '"I\'m already present at other shows / at MediaDays Classic."',
        answer:
          '"It\'s not the same audience. Classic gathers ad networks and advertisers; Solutions gathers the people who buy and deploy media technology. Your technical customers are at Solutions."',
      },
      {
        question: '"A stand is expensive."',
        answer:
          '"What is a meeting with a broadcast director or a station CIO worth? Here you meet dozens of them in three days, across three cities. The cost per qualified contact is unbeatable. And there are several space formats to fit your budget."',
      },
      {
        question: '"I don\'t have time to organise this."',
        answer:
          '"Registration is done online at mediadays.solutions, and the team supports you. Book the location now, we\'ll sort out the details later — what matters is securing the space before the sector fills up."',
      },
    ],
  },
  how_to_conclude: {
    title: 'How to close',
    steps: [
      'Qualify: does the prospect build/distribute/operate media technology? (if not, they are not a Solutions partner).',
      'Place them in their sector and name a concrete benefit: "you\'re right in the Video & CTV sector, next to the broadcast buyers".',
      'Create urgency: limited number of stands, best locations first.',
      'Drive to action: booking at mediadays.solutions, or pass on the contact and we will take it from there.',
    ],
  },
  closing_line: {
    title: 'The closing line',
    text: '"The MediaDays Solutions is the European hotspot where the people building tomorrow\'s media meet. And there is still space in your sector — for now."',
  },
};

export function getAffilieContent(locale: 'fr' | 'en'): AffilieContent {
  return locale === 'en' ? AFFILIE_CONTENT_EN : AFFILIE_CONTENT_FR;
}

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import styles from './kpi.module.css';

/**
 * Page KPI privée (cibles & KPI MDS 2026). Contenu repris des fichiers source
 * autonomes kpi-fr.html / kpi-en.html. Server Component statique, AUCUN état.
 *
 * Confidentialité : noindex/nofollow/noarchive (metadata.robots), absente du
 * sitemap (aucun sitemap dans l'app) et d'aucune navigation/lien public.
 * Accessible uniquement par URL directe /fr/kpi et /en/kpi.
 */

export const dynamic = 'force-static';

type StatItem = { num: string; lbl: string };
type Card = { tag: string; h3: string; sub: string; stats: StatItem[]; bullets: string[] };
type DateCard = {
  city: string;
  cc: string;
  when: string;
  where: string;
  fmt: string;
  xxl?: boolean;
  flagParis?: boolean;
};
type Pole = { name: string; desc: string; sub: string; targets: string };
type Family = { pct: string; name: string; ex: string; width: string };

type Content = {
  title: string;
  kicker: string;
  leadHtml: string;
  dates: DateCard[];
  kpiTitle: string;
  kpiIntroHtml: string;
  cards: Card[];
  projectionBig: string;
  projectionSmall: string;
  projectionHtml: string;
  polesTitle: string;
  polesIntro: string;
  polesHead: { hub: string; sub: string; targets: string };
  poles: Pole[];
  polesTotal: { label: string; sub: string; targets: string };
  visitorsTitle: string;
  visitorsIntro: string;
  families: Family[];
  footHtml: string;
};

const FAMILY_META: { ex: string; width: string }[] = [
  { ex: 'L’Oréal · Orange · Renault', width: '55%' },
  { ex: 'Havas Media · Zenith · Starcom', width: '55%' },
  { ex: 'BETC · Publicis Conseil · Havas Paris', width: '45%' },
  { ex: 'RTL · RTL2 · Fun Radio', width: '55%' },
  { ex: 'TF1 · M6 · France TV', width: '45%' },
  { ex: 'Le Monde · Le Figaro · Les Echos', width: '30%' },
  { ex: 'Iconoclast · Wanda · Big Productions', width: '35%' },
  { ex: 'DT Radios · DT TV · DT Plateformes OTT', width: '12%' },
  { ex: 'Head of Data · Chief Data Officers', width: '12%' },
  { ex: 'Carrefour · Fnac-Darty · Intermarché', width: '20%' },
  { ex: 'UDECAM · UDM · SRI', width: '45%' },
  { ex: 'LaLettre.pro · Podcast Magazine · Stratégies', width: '40%' },
  { ex: 'ECS · Iscom · CELSA', width: '35%' },
  { ex: 'Idinvest · Serena Capital · Kima Ventures', width: '20%' },
];

function families(pcts: string[], names: string[], exEn?: string[]): Family[] {
  return FAMILY_META.map((m, i) => ({
    pct: pcts[i],
    name: names[i],
    ex: exEn?.[i] ?? m.ex,
    width: m.width,
  }));
}

const FR: Content = {
  title: 'MediaDays Solutions 2026 — Cibles & KPI',
  kicker: 'Édition 2026 · Le nouveau rendez-vous des médias',
  leadHtml:
    'Trois journées professionnelles dédiées aux acteurs de la radio, du podcast, de la vidéo et du média numérique. Toute la chaîne tech des médias réunie : audio, vidéo, CTV, outdoor, diffusion et data.',
  dates: [
    {
      city: 'MediaDays Bruxelles',
      cc: 'BE',
      when: '26 novembre 2026',
      where: 'Mix Brussels',
      fmt: 'Format régional ciblé',
    },
    {
      city: 'MediaDays Marseille',
      cc: 'FR',
      when: '10 décembre 2026',
      where: 'Palais du Pharo',
      fmt: 'Format régional ciblé',
    },
    {
      city: 'MediaDays Paris',
      cc: 'FR',
      when: '15 décembre 2026',
      where: 'Carrousel du Louvre',
      fmt: 'Édition XXL · 6 000 m²',
      xxl: true,
      flagParis: true,
    },
  ],
  kpiTitle: 'Les KPI de référence',
  kpiIntroHtml:
    "MediaDays Solutions est un <b>nouvel événement</b> : il n'a encore jamais eu lieu sous ce format. Les indicateurs ci-dessous proviennent des deux salons réels dont il est issu — le <b>Paris Radio Show</b> (qui rejoint MediaDays en 2026) et les <b>MediaDays « Classic » by Havas</b>, co-organisateur de l'édition 2026.",
  cards: [
    {
      tag: 'Salon réel · audio & radio',
      h3: 'Paris Radio Show 2025',
      sub: "La Bellevilloise, Paris — chiffres officiels de l'édition",
      stats: [
        { num: '4 200', lbl: 'Visiteurs' },
        { num: '73', lbl: 'Exposants' },
        { num: '50', lbl: 'Tables rondes & masterclasses' },
      ],
      bullets: [
        'Cœur audio : radios, podcast, plateformes, régies audio',
        'Édition 2026 intégrée aux MediaDays Solutions',
      ],
    },
    {
      tag: 'Salon réel · médias & régies',
      h3: 'MediaDays « Classic » by Havas',
      sub: 'Tournée multi-villes (Lyon, Lille, Bordeaux, Marseille…)',
      stats: [
        { num: '~2 000', lbl: 'Visiteurs / tournée' },
        { num: '600', lbl: 'Annonceurs' },
        { num: '120', lbl: 'Keynotes & tables rondes' },
      ],
      bullets: [
        '≈ 1 000 participants par étape (ex. Lyon 2025)',
        'Annonceurs, agences médias et régies au cœur de l’audience',
      ],
    },
  ],
  projectionBig: '3 000–5 000',
  projectionSmall: 'visiteurs attendus · Paris (XXL)',
  projectionHtml:
    "<b>Projection — édition XXL de Paris.</b> Le MediaDays Solutions de Paris se tient sur <b>6 000 m² au Carrousel du Louvre</b> : c'est le salon principal, auquel correspond cette fourchette. L'événement n'ayant jamais eu lieu sous ce format, l'estimation s'appuie sur la fréquentation réelle du Paris Radio Show (4 200 visiteurs) et sur la <b>dimension XXL du nouveau format</b>, qui réunit l'ensemble de la chaîne tech des médias. Les éditions de <b>Marseille</b> (Palais du Pharo) et <b>Bruxelles</b> (Mix) se déroulent sur un <b>format plus réduit</b>, avec des audiences plus ciblées.",
  polesTitle: 'Les 6 pôles & sous-secteurs ciblés',
  polesIntro:
    "L'offre MediaDays Solutions est structurée en 6 pôles, 69 sous-secteurs et 484 partenaires cibles identifiés.",
  polesHead: { hub: 'Pôle', sub: 'Sous-secteurs', targets: 'Partenaires cibles' },
  poles: [
    {
      name: 'Régies & Retail Media',
      desc: 'Régies, éditeurs, retailers, agences créa — accueille annonceurs & agences UDECAM',
      sub: '12',
      targets: '73',
    },
    {
      name: 'Audio & Radio',
      desc: 'Solutions audio pour radios, plateformes & régies audio — cœur du Paris Radio Show',
      sub: '15',
      targets: '148',
    },
    {
      name: 'Diffusion & Infra',
      desc: 'Cloud, distribution, transport du contenu, opérateurs FM / DAB+ / TNT / 5G',
      sub: '9',
      targets: '61',
    },
    {
      name: 'Vidéo & CTV',
      desc: 'Distribution, monétisation, analytics vidéo + production vidéo pro',
      sub: '14',
      targets: '88',
    },
    {
      name: 'Outdoor & DOOH',
      desc: "Tech DOOH, programmatique outdoor, solutions d'affichage",
      sub: '6',
      targets: '33',
    },
    {
      name: 'Data & AdTech',
      desc: 'Adtech, data, mesure, IA marketing, retail media tech — cœur business de MDS',
      sub: '13',
      targets: '81',
    },
  ],
  polesTotal: { label: 'Total — 6 pôles', sub: '69', targets: '484' },
  visitorsTitle: 'Les visiteurs attendus — répartition cible',
  visitorsIntro:
    'Mix d’audience visé sur 14 grandes familles de visiteurs professionnels (part estimée du public attendu).',
  families: families(
    [
      '11 %',
      '11 %',
      '9 %',
      '11 %',
      '9 %',
      '6 %',
      '7 %',
      '2 %',
      '2 %',
      '4 %',
      '9 %',
      '8 %',
      '7 %',
      '4 %',
    ],
    [
      'Annonceurs grands comptes',
      'Agences médias UDECAM',
      'Agences créatives & branded content',
      'Médias éditeurs — Radios',
      'Médias éditeurs — TV & plateformes',
      'Médias éditeurs — Presse & digital',
      'Producteurs & Studios',
      'Directeurs techniques / CTO médias',
      'Data officers & AdTech managers',
      'Retailers & e-commerçants',
      'Institutionnels & Syndicats',
      'Presse professionnelle',
      'Écoles & Formation',
      'Investisseurs / VCs tech média',
    ],
  ),
  footHtml:
    "<b>Sources & méthodologie.</b> Paris Radio Show 2025 : chiffres officiels (parisradioshow.com, édition La Bellevilloise). MediaDays « Classic » by Havas : données presse des éditions précédentes (≈ 2 000 visiteurs / 600 annonceurs / 120 keynotes sur la tournée ; ≈ 1 000 participants par étape, Lyon 2025). Pôles, sous-secteurs et familles de visiteurs : plateforme mediadays.solutions. La fourchette 3 000–5 000 visiteurs est une projection pour l'édition XXL de Paris (Carrousel du Louvre, 6 000 m²), à partir de la fréquentation du Paris Radio Show et de l'élargissement du format — l'événement n'a jamais eu lieu sous ce format. La répartition par famille est un mix d'audience cible, exprimé en part du public attendu.<br><br>Organisé par Editions HF (Brive-la-Gaillarde), co-organisé avec Havas Media. Page privée — non indexée, à usage commercial. Juin 2026.",
};

const EN: Content = {
  title: 'MediaDays Solutions 2026 — Targets & KPIs',
  kicker: '2026 edition · The new media gathering',
  leadHtml:
    'Three professional days dedicated to the players of radio, podcast, video and digital media. The entire media tech chain in one place: audio, video, CTV, outdoor, broadcast and data.',
  dates: [
    {
      city: 'MediaDays Brussels',
      cc: 'BE',
      when: '26 November 2026',
      where: 'Mix Brussels',
      fmt: 'Focused regional format',
    },
    {
      city: 'MediaDays Marseille',
      cc: 'FR',
      when: '10 December 2026',
      where: 'Palais du Pharo',
      fmt: 'Focused regional format',
    },
    {
      city: 'MediaDays Paris',
      cc: 'FR',
      when: '15 December 2026',
      where: 'Carrousel du Louvre',
      fmt: 'XXL edition · 6,000 m²',
      xxl: true,
      flagParis: true,
    },
  ],
  kpiTitle: 'Benchmark KPIs',
  kpiIntroHtml:
    'MediaDays Solutions is a <b>new event</b>: it has not yet taken place in this format. The indicators below come from the two real shows it is built on — the <b>Paris Radio Show</b> (joining MediaDays in 2026) and the <b>MediaDays "Classic" by Havas</b>, co-organiser of the 2026 edition.',
  cards: [
    {
      tag: 'Real show · audio & radio',
      h3: 'Paris Radio Show 2025',
      sub: 'La Bellevilloise, Paris — official edition figures',
      stats: [
        { num: '4,200', lbl: 'Visitors' },
        { num: '73', lbl: 'Exhibitors' },
        { num: '50', lbl: 'Panels & masterclasses' },
      ],
      bullets: [
        'Audio core: radio, podcast, platforms, audio sales houses',
        '2026 edition integrated into MediaDays Solutions',
      ],
    },
    {
      tag: 'Real show · media & sales houses',
      h3: 'MediaDays "Classic" by Havas',
      sub: 'Multi-city tour (Lyon, Lille, Bordeaux, Marseille…)',
      stats: [
        { num: '~2,000', lbl: 'Visitors / tour' },
        { num: '600', lbl: 'Advertisers' },
        { num: '120', lbl: 'Keynotes & panels' },
      ],
      bullets: [
        '≈ 1,000 attendees per stop (e.g. Lyon 2025)',
        'Advertisers, media agencies and sales houses at the core',
      ],
    },
  ],
  projectionBig: '3,000–5,000',
  projectionSmall: 'expected visitors · Paris (XXL)',
  projectionHtml:
    '<b>Projection — Paris XXL edition.</b> The Paris MediaDays Solutions runs across <b>6,000 m² at the Carrousel du Louvre</b>: it is the flagship show, to which this range applies. As the event has never taken place in this format, the estimate draws on the actual attendance of the Paris Radio Show (4,200 visitors) and on the <b>XXL scale of the new format</b>, bringing together the entire media tech chain. The <b>Marseille</b> (Palais du Pharo) and <b>Brussels</b> (Mix) editions run on a <b>more compact format</b>, with more focused audiences.',
  polesTitle: 'The 6 hubs & target sub-sectors',
  polesIntro:
    'The MediaDays Solutions offer is structured into 6 hubs, 69 sub-sectors and 484 identified target partners.',
  polesHead: { hub: 'Hub', sub: 'Sub-sectors', targets: 'Target partners' },
  poles: [
    {
      name: 'Sales Houses & Retail Media',
      desc: 'Sales houses, publishers, retailers, creative agencies — hosts advertisers & UDECAM agencies',
      sub: '12',
      targets: '73',
    },
    {
      name: 'Audio & Radio',
      desc: 'Audio solutions for radio, platforms & audio sales houses — core of the Paris Radio Show',
      sub: '15',
      targets: '148',
    },
    {
      name: 'Broadcast & Infra',
      desc: 'Cloud, distribution, content transport, FM / DAB+ / DTT / 5G operators',
      sub: '9',
      targets: '61',
    },
    {
      name: 'Video & CTV',
      desc: 'Video distribution, monetisation, analytics + pro video production',
      sub: '14',
      targets: '88',
    },
    {
      name: 'Outdoor & DOOH',
      desc: 'DOOH tech, programmatic outdoor, display solutions',
      sub: '6',
      targets: '33',
    },
    {
      name: 'Data & AdTech',
      desc: 'Adtech, data, measurement, marketing AI, retail media tech — business core of MDS',
      sub: '13',
      targets: '81',
    },
  ],
  polesTotal: { label: 'Total — 6 hubs', sub: '69', targets: '484' },
  visitorsTitle: 'Expected visitors — target mix',
  visitorsIntro:
    'Target audience mix across 14 major families of professional visitors (estimated share of the expected audience).',
  families: families(
    ['11%', '11%', '9%', '11%', '9%', '6%', '7%', '2%', '2%', '4%', '9%', '8%', '7%', '4%'],
    [
      'Key-account advertisers',
      'UDECAM media agencies',
      'Creative & branded content agencies',
      'Media publishers — Radio',
      'Media publishers — TV & platforms',
      'Media publishers — Press & digital',
      'Producers & Studios',
      'Technical directors / Media CTOs',
      'Data officers & AdTech managers',
      'Retailers & e-merchants',
      'Institutions & Trade bodies',
      'Trade press',
      'Schools & Training',
      'Investors / media-tech VCs',
    ],
    [
      'L’Oréal · Orange · Renault',
      'Havas Media · Zenith · Starcom',
      'BETC · Publicis Conseil · Havas Paris',
      'RTL · RTL2 · Fun Radio',
      'TF1 · M6 · France TV',
      'Le Monde · Le Figaro · Les Echos',
      'Iconoclast · Wanda · Big Productions',
      'Radio · TV · OTT platforms tech leads',
      'Head of Data · Chief Data Officers',
      'Carrefour · Fnac-Darty · Intermarché',
      'UDECAM · UDM · SRI',
      'LaLettre.pro · Podcast Magazine · Stratégies',
      'ECS · Iscom · CELSA',
      'Idinvest · Serena Capital · Kima Ventures',
    ],
  ),
  footHtml:
    '<b>Sources & methodology.</b> Paris Radio Show 2025: official figures (parisradioshow.com, La Bellevilloise edition). MediaDays "Classic" by Havas: press data from previous editions (≈ 2,000 visitors / 600 advertisers / 120 keynotes across the tour; ≈ 1,000 attendees per stop, Lyon 2025). Hubs, sub-sectors and visitor families: mediadays.solutions platform. The 3,000–5,000 visitor range is a projection for the Paris XXL edition (Carrousel du Louvre, 6,000 m²), based on the Paris Radio Show attendance and the larger format — the event has never taken place in this format. The per-family breakdown is a target audience mix, expressed as a share of the expected audience.<br><br>Organised by Editions HF (Brive-la-Gaillarde), co-organised with Havas Media. Private page — not indexed, for commercial use. June 2026.',
};

function pick(locale: string): Content {
  return locale === 'en' ? EN : FR;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pick(locale).title,
    // Page privée : noindex/nofollow/noarchive (équivaut au meta robots source).
    robots: 'noindex, nofollow, noarchive',
  };
}

export default async function KpiPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = pick(locale);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.kicker}>{c.kicker}</div>
          <h1>
            MediaDays Solutions <span className={styles.show}>&amp; Paris Radio Show</span>
          </h1>
          <p className={styles.lead}>{c.leadHtml}</p>
          <div className={styles.dates}>
            {c.dates.map((d) => (
              <div
                key={d.city}
                className={`${styles.dateCard} ${d.flagParis ? styles.flagParis : ''}`}
              >
                <div className={styles.city}>
                  {d.city} <span className={styles.cc}>{d.cc}</span>
                </div>
                <div className={styles.when}>{d.when}</div>
                <div className={styles.where}>{d.where}</div>
                <div className={`${styles.fmt} ${d.xxl ? styles.xxl : ''}`}>{d.fmt}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className={styles.wrap}>
        <h2 className={styles.section}>{c.kpiTitle}</h2>
        <p className={styles.intro} dangerouslySetInnerHTML={{ __html: c.kpiIntroHtml }} />

        <div className={styles.kpiRow}>
          {c.cards.map((card) => (
            <div key={card.h3} className={styles.kpiCard}>
              <span className={styles.tag}>{card.tag}</span>
              <h3>{card.h3}</h3>
              <div className={styles.sub}>{card.sub}</div>
              <div className={styles.statGrid}>
                {card.stats.map((s) => (
                  <div key={s.lbl} className={styles.stat}>
                    <div className={styles.num}>{s.num}</div>
                    <div className={styles.lbl}>{s.lbl}</div>
                  </div>
                ))}
              </div>
              <ul>
                {card.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.projection}>
          <div className={styles.big}>
            {c.projectionBig}
            <small>{c.projectionSmall}</small>
          </div>
          <div className={styles.txt} dangerouslySetInnerHTML={{ __html: c.projectionHtml }} />
        </div>

        <h2 className={styles.section}>{c.polesTitle}</h2>
        <p className={styles.intro}>{c.polesIntro}</p>
        <table>
          <thead>
            <tr>
              <th>{c.polesHead.hub}</th>
              <th className={styles.center}>{c.polesHead.sub}</th>
              <th className={styles.center}>{c.polesHead.targets}</th>
            </tr>
          </thead>
          <tbody>
            {c.poles.map((p) => (
              <tr key={p.name}>
                <td>
                  <span className={styles.poleName}>{p.name}</span>
                  <div className={styles.poleDesc}>{p.desc}</div>
                </td>
                <td className={styles.center}>{p.sub}</td>
                <td className={styles.center}>{p.targets}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{c.polesTotal.label}</td>
              <td className={styles.center}>{c.polesTotal.sub}</td>
              <td className={styles.center}>{c.polesTotal.targets}</td>
            </tr>
          </tfoot>
        </table>

        <h2 className={styles.section}>{c.visitorsTitle}</h2>
        <p className={styles.intro}>{c.visitorsIntro}</p>
        <div className={styles.famGrid}>
          {c.families.map((f) => (
            <div key={f.name} className={styles.fam}>
              <span className={styles.pct}>{f.pct}</span>
              <div className={styles.name}>{f.name}</div>
              <div className={styles.ex}>{f.ex}</div>
              <div className={styles.bar}>
                <span style={{ width: f.width }} />
              </div>
            </div>
          ))}
        </div>

        <div className={styles.foot} dangerouslySetInnerHTML={{ __html: c.footHtml }} />
      </main>
    </div>
  );
}

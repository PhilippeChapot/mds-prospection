/**
 * Mock data pour le dashboard P1/M3.
 * Sera remplace par des fetchs Supabase reels en P2 (CRUD pipeline).
 */
import type { PoleCode } from '@/lib/design-tokens';

export type ProspectStatus =
  | 'lead'
  | 'contact'
  | 'devis_envoye'
  | 'acompte_paye'
  | 'signe'
  | 'perdu';

export type CategoryTarif = 'prs_exhibitor' | 'standard' | 'non_eligible';

export type SyncTarget = 'sellsy' | 'brevo' | 'stripe' | 'canva';
export type SyncState = 'synced' | 'pending' | 'idle';

export type RecentActivityRow = {
  id: string;
  companyName: string;
  contactEmail: string;
  initials: string;
  initialsBg: string;
  status: ProspectStatus;
  pole: PoleCode;
  pack: string | null;
  lastAction: string;
  syncs: { target: SyncTarget; state: SyncState }[];
};

export const KPI_CARDS = [
  {
    label: 'Prospects actifs',
    value: 142,
    deltaLabel: '+18 cette semaine',
    deltaTone: 'up' as const,
    tone: 'default' as const,
  },
  {
    label: 'Inscriptions web',
    value: 37,
    deltaLabel: '+6 ces 7j',
    deltaTone: 'up' as const,
    tone: 'accent' as const,
  },
  {
    label: 'Devis envoyes',
    value: 22,
    deltaLabel: '8 en attente',
    deltaTone: 'neutral' as const,
    tone: 'warning' as const,
  },
  {
    label: 'Acomptes payes',
    value: 9,
    deltaLabel: 'via Stripe',
    deltaTone: 'up' as const,
    tone: 'success' as const,
  },
  {
    label: 'Signes',
    value: 14,
    deltaLabel: 'CA 186 200 €',
    deltaTone: 'up' as const,
    tone: 'success' as const,
  },
];

export const POLE_DISTRIBUTION: { code: PoleCode; label: string; count: number }[] = [
  { code: 'AUDIO_RADIO', label: '🎙️ Audio & Radio', count: 38 },
  { code: 'DATA_ADTECH', label: '📊 Data & AdTech', count: 29 },
  { code: 'VIDEO_CTV', label: '🎥 Video & CTV', count: 23 },
  { code: 'REGIES_RETAIL_MEDIA', label: '🏛️ Regies & Retail Media', count: 19 },
  { code: 'DIFFUSION_INFRA', label: '📡 Diffusion & Infra', count: 15 },
  { code: 'OUTDOOR_DOOH', label: '📢 Outdoor & DOOH', count: 12 },
];

export const CONVERSION_FUNNEL = [
  { label: '👀 Clics affilies', value: 847, percent: null, bg: '#F2F4FB' },
  { label: '📝 Inscriptions etape 1', value: 312, percent: 37, bg: '#E5E9F5' },
  { label: '✅ Email verifie', value: 198, percent: 63, bg: '#FFE6F1' },
  { label: '📄 Formulaire 2 soumis', value: 142, percent: 72, bg: '#FFF3DD' },
  { label: '🎉 Signes', value: 14, percent: 10, bg: '#DDF6E8' },
];

export const RECENT_ACTIVITY: RecentActivityRow[] = [
  {
    id: 'r1',
    companyName: 'NRJ Group',
    contactEmail: 'm.lambert@nrj.fr',
    initials: 'NR',
    initialsBg: 'var(--color-md-magenta)',
    status: 'acompte_paye',
    pole: 'AUDIO_RADIO',
    pack: 'CLASSIC PRS',
    lastAction: "Aujourd'hui · paiement Stripe",
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'synced' },
      { target: 'stripe', state: 'synced' },
    ],
  },
  {
    id: 'r2',
    companyName: 'Radio France',
    contactEmail: 'm.dupont@radiofrance.com',
    initials: 'RF',
    initialsBg: '#5C6A8A',
    status: 'signe',
    pole: 'AUDIO_RADIO',
    pack: 'PREMIUM',
    lastAction: 'Hier · facture emise',
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'synced' },
      { target: 'canva', state: 'synced' },
    ],
  },
  {
    id: 'r3',
    companyName: 'Europe 1',
    contactEmail: 'partenariats@europe1.fr',
    initials: 'EU',
    initialsBg: '#117A4A',
    status: 'devis_envoye',
    pole: 'AUDIO_RADIO',
    pack: null,
    lastAction: 'Il y a 2j · relance prog.',
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'pending' },
      { target: 'stripe', state: 'idle' },
    ],
  },
  {
    id: 'r4',
    companyName: 'Podcast Deluxe Studios',
    contactEmail: 'hello@pdstudios.com',
    initials: 'PD',
    initialsBg: '#8B5A00',
    status: 'lead',
    pole: 'AUDIO_RADIO',
    pack: 'Visibilite +',
    lastAction: "Aujourd'hui · a qualifier",
    syncs: [
      { target: 'sellsy', state: 'pending' },
      { target: 'brevo', state: 'idle' },
      { target: 'stripe', state: 'idle' },
    ],
  },
  {
    id: 'r5',
    companyName: 'Mediawan Radio',
    contactEmail: 'k.bertin@mediawan.com',
    initials: 'MR',
    initialsBg: '#A8262B',
    status: 'perdu',
    pole: 'AUDIO_RADIO',
    pack: null,
    lastAction: 'Lundi · injoignable',
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'idle' },
      { target: 'stripe', state: 'idle' },
    ],
  },
];

/* ---------------------------- Liste Prospects ----------------------------- */

export type ProspectListRow = {
  id: string;
  companyName: string;
  contactEmail: string;
  initials: string;
  initialsBg: string;
  status: ProspectStatus;
  pole: PoleCode;
  category: CategoryTarif;
  pack: string | null;
  owner: string;
  affiliate: string | null;
  amountEur: number | null;
  syncs: { target: SyncTarget; state: SyncState }[];
};

export const PROSPECTS_MOCK: ProspectListRow[] = [
  {
    id: 'p1',
    companyName: 'NRJ Group',
    contactEmail: 'm.lambert@nrj.fr',
    initials: 'NR',
    initialsBg: 'var(--color-md-magenta)',
    status: 'acompte_paye',
    pole: 'AUDIO_RADIO',
    category: 'prs_exhibitor',
    pack: 'CLASSIC',
    owner: 'Phil',
    affiliate: 'B. Associes',
    amountEur: 5975,
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'synced' },
      { target: 'stripe', state: 'synced' },
    ],
  },
  {
    id: 'p2',
    companyName: 'Radio France',
    contactEmail: 'm.dupont@radiofrance.com',
    initials: 'RF',
    initialsBg: '#5C6A8A',
    status: 'signe',
    pole: 'AUDIO_RADIO',
    category: 'standard',
    pack: 'PREMIUM',
    owner: 'Phil',
    affiliate: null,
    amountEur: 20500,
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'synced' },
      { target: 'canva', state: 'synced' },
    ],
  },
  {
    id: 'p3',
    companyName: 'Europe 1',
    contactEmail: 'partenariats@europe1.fr',
    initials: 'EU',
    initialsBg: '#117A4A',
    status: 'devis_envoye',
    pole: 'AUDIO_RADIO',
    category: 'standard',
    pack: 'CLASSIC',
    owner: 'Commerciale',
    affiliate: 'LaLettre.pro',
    amountEur: 14800,
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'pending' },
      { target: 'stripe', state: 'idle' },
    ],
  },
  {
    id: 'p4',
    companyName: 'RTL Group',
    contactEmail: 'k.petit@rtlgroup.com',
    initials: 'RT',
    initialsBg: '#0265B5',
    status: 'contact',
    pole: 'AUDIO_RADIO',
    category: 'prs_exhibitor',
    pack: null,
    owner: 'Phil',
    affiliate: 'B. Associes',
    amountEur: null,
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'idle' },
      { target: 'stripe', state: 'idle' },
    ],
  },
  {
    id: 'p5',
    companyName: 'Podcast Deluxe Studios',
    contactEmail: 'hello@pdstudios.com',
    initials: 'PD',
    initialsBg: '#8B5A00',
    status: 'lead',
    pole: 'AUDIO_RADIO',
    category: 'standard',
    pack: null,
    owner: '—',
    affiliate: null,
    amountEur: null,
    syncs: [
      { target: 'sellsy', state: 'pending' },
      { target: 'brevo', state: 'idle' },
      { target: 'stripe', state: 'idle' },
    ],
  },
  {
    id: 'p6',
    companyName: 'Mediawan Radio',
    contactEmail: 'k.bertin@mediawan.com',
    initials: 'MR',
    initialsBg: '#A8262B',
    status: 'perdu',
    pole: 'AUDIO_RADIO',
    category: 'standard',
    pack: null,
    owner: 'Commerciale',
    affiliate: null,
    amountEur: null,
    syncs: [
      { target: 'sellsy', state: 'synced' },
      { target: 'brevo', state: 'idle' },
      { target: 'stripe', state: 'idle' },
    ],
  },
];

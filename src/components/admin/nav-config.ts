/**
 * Configuration de la navigation admin (sidebar) — SPEC §5.1.
 * `enabled: false` = item visible mais grise (route a venir en P2-P5).
 */

export type AdminNavItem = {
  href: string;
  label: string;
  emoji: string;
  enabled: boolean;
  phase?: 'P2' | 'P3' | 'P4' | 'P5';
  badge?: string;
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    title: 'Pipeline',
    items: [
      { href: '/admin', label: 'Dashboard', emoji: '📊', enabled: true },
      { href: '/admin/prospects', label: 'Prospects', emoji: '👥', enabled: true },
      { href: '/admin/companies', label: 'Societes', emoji: '🏢', enabled: true },
      { href: '/admin/contacts', label: 'Contacts', emoji: '📞', enabled: true },
      { href: '/admin/contacts/quick-add', label: 'Smart Add', emoji: '✨', enabled: true },
      {
        href: '/admin/signups',
        label: 'Inscriptions web',
        emoji: '📨',
        enabled: true,
      },
      {
        href: '/admin/contacts-sync',
        label: 'Sync Brevo',
        emoji: '📬',
        enabled: true,
      },
    ],
  },
  {
    title: 'Salon',
    items: [
      { href: '/admin/booths', label: 'Emplacements', emoji: '🪑', enabled: false, phase: 'P2' },
      {
        href: '/admin/booths/plan',
        label: 'Plan Canva',
        emoji: '🗺️',
        enabled: false,
        phase: 'P2',
      },
      { href: '/admin/pricing', label: 'Tarifs', emoji: '💰', enabled: false, phase: 'P2' },
      {
        href: '/admin/sellsy-products',
        label: 'Catalogue Sellsy',
        emoji: '🛒',
        enabled: true,
      },
    ],
  },
  {
    title: 'Croissance',
    items: [
      { href: '/admin/affiliates', label: 'Affilies', emoji: '🤝', enabled: false, phase: 'P3' },
      {
        href: '/admin/exhibitors-profiles',
        label: 'Profils partenaires',
        emoji: '📋',
        enabled: false,
        phase: 'P5',
      },
      {
        href: '/admin/exhibitor-resources',
        label: 'Ressources',
        emoji: '📚',
        enabled: false,
        phase: 'P3',
      },
    ],
  },
  {
    title: 'Reglages',
    items: [
      {
        href: '/admin/preferences',
        label: 'Preferences',
        emoji: '⚙️',
        enabled: false,
        phase: 'P2',
      },
      { href: '/admin/seasons', label: 'Saisons', emoji: '🗓️', enabled: false, phase: 'P5' },
      { href: '/admin/users', label: 'Utilisateurs', emoji: '👤', enabled: false, phase: 'P5' },
      { href: '/admin/sync-logs', label: 'Logs sync', emoji: '🔄', enabled: false, phase: 'P4' },
      { href: '/admin/audit-log', label: 'Audit log', emoji: '📜', enabled: true },
      { href: '/admin/mcp-tokens', label: 'Tokens MCP', emoji: '🔌', enabled: false, phase: 'P5' },
    ],
  },
  {
    title: 'Dev',
    items: [{ href: '/admin/styleguide', label: 'Styleguide', emoji: '🎨', enabled: true }],
  },
];

/**
 * Lookup label par href (pour le breadcrumb).
 */
export const ADMIN_LABEL_BY_HREF: Record<string, { label: string; section: string }> = (() => {
  const map: Record<string, { label: string; section: string }> = {};
  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      map[item.href] = { label: item.label, section: section.title };
    }
  }
  // Routes hors sidebar mais pertinentes pour le breadcrumb.
  map['/admin/styleguide'] = { label: 'Styleguide', section: 'Dev' };
  map['/admin/quotes/new'] = { label: 'Nouveau devis', section: 'Pipeline' };
  return map;
})();

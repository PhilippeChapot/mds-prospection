/**
 * Configuration de la navigation admin (sidebar) — SPEC §5.1.
 * `enabled: false` = item visible mais grise (route a venir en P2-P5).
 *
 * P5.x.1-quater (bug #2) — ajout de `roles_allowed?: UserRole[]` :
 *   - absent  => visible pour tous les roles admin (super_admin, admin, sales)
 *   - present => visible UNIQUEMENT pour les roles listes
 *
 * Le filtre est applique cote client par `AdminSidebar` (cf. helper
 * `filterNavSectionsForRole` ci-dessous). La defense-in-depth cote serveur
 * vit dans chaque page (requireSuperAdmin / hasAdminAccess + redirect).
 */

import type { UserRole } from '@/lib/supabase/auth-helpers';

export type AdminNavItem = {
  href: string;
  label: string;
  emoji: string;
  enabled: boolean;
  phase?: 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P15' | 'P16';
  badge?: string;
  /** Si present, item visible uniquement pour ces roles. */
  roles_allowed?: readonly UserRole[];
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

// Roles helpers — references symboliques pour eviter les typos.
const ADMIN_PLUS: readonly UserRole[] = ['super_admin', 'admin'] as const;
const SUPER_ONLY: readonly UserRole[] = ['super_admin'] as const;

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    title: 'Pipeline',
    items: [
      { href: '/admin', label: 'Dashboard', emoji: '📊', enabled: true },
      { href: '/admin/prospects', label: 'Prospects', emoji: '👥', enabled: true },
      { href: '/admin/companies', label: 'Societes', emoji: '🏢', enabled: true },
      { href: '/admin/contacts', label: 'Contacts', emoji: '📞', enabled: true },
      { href: '/admin/visitors', label: 'Visiteurs', emoji: '👥', enabled: true },
      // P16 roadmap (shells créés en P15.1, UI à venir) — placeholders grisés.
      { href: '/admin/speakers', label: 'Speakers', emoji: '🎤', enabled: false, phase: 'P16' },
      {
        href: '/admin/conferences',
        label: 'Conférences',
        emoji: '📅',
        enabled: false,
        phase: 'P16',
      },
      { href: '/admin/contacts/quick-add', label: 'Smart Add', emoji: '✨', enabled: true },
      {
        href: '/admin/messages',
        label: 'Messages',
        emoji: '💬',
        enabled: true,
      },
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
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/calendar',
        label: 'Calendrier',
        emoji: '📅',
        enabled: true,
      },
    ],
  },
  {
    title: 'Salon',
    items: [
      { href: '/admin/emplacements', label: 'Emplacements', emoji: '🪑', enabled: true },
      // P6.x.3-bis : l'entree "Plan Canva (P2)" retiree -- le toggle Plan
      // visuel est integre directement dans /admin/emplacements (P6.x.3).
      {
        href: '/admin/tarifs',
        label: 'Tarifs',
        emoji: '💰',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
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
      {
        href: '/admin/campaigns',
        label: 'Campagnes',
        emoji: '💌',
        enabled: true,
      },
      {
        href: '/admin/lifecycle',
        label: 'Relances auto',
        emoji: '🔁',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/affiliates',
        label: 'Affilies',
        emoji: '🤝',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/affiliate-claims',
        label: 'Claims affiliés',
        emoji: '🔖',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/partners-profiles',
        label: 'Profils partenaires',
        emoji: '📋',
        enabled: false,
        phase: 'P5',
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/partner-resources',
        label: 'Ressources',
        emoji: '📚',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
    ],
  },
  {
    title: 'Reglages',
    items: [
      {
        href: '/admin/preferences',
        label: 'Préférences',
        emoji: '⚙️',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/seasons',
        label: 'Saisons',
        emoji: '🗓️',
        enabled: false,
        phase: 'P5',
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/users',
        label: 'Utilisateurs',
        emoji: '👤',
        enabled: true,
        roles_allowed: SUPER_ONLY,
      },
      {
        href: '/admin/sync-logs',
        label: 'Logs sync',
        emoji: '🔄',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/audit-log',
        label: 'Audit log',
        emoji: '📜',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
      {
        href: '/admin/mcp-tokens',
        label: 'Tokens MCP',
        emoji: '🔌',
        enabled: false,
        phase: 'P5',
        roles_allowed: SUPER_ONLY,
      },
    ],
  },
  {
    title: 'Dev',
    items: [
      {
        href: '/admin/styleguide',
        label: 'Styleguide',
        emoji: '🎨',
        enabled: true,
        roles_allowed: ADMIN_PLUS,
      },
    ],
  },
];

/**
 * P5.x.1-quater (bug #2) — filtre les sections + items selon le role courant.
 *
 * Comportement :
 *   - item sans `roles_allowed` => visible pour tous les roles admin.
 *   - item avec `roles_allowed` => visible UNIQUEMENT si role ∈ roles_allowed.
 *   - section dont tous les items sont filtres => section retiree.
 */
export function filterNavSectionsForRole(
  sections: AdminNavSection[],
  role: UserRole,
): AdminNavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((it) => !it.roles_allowed || it.roles_allowed.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

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

/**
 * Helpers session Espace Partenaire — P5.x.2 / P5.x.17-bis.
 *
 * Deux niveaux d'API pour distinguer "valider l'auth" (cheap, cookie+JWT
 * uniquement) de "charger toutes les donnees du dashboard" (DB roundtrip
 * sur prospect/contact/company + count clicks). Sert a l'Espace Partenaire
 * V1.3 ou le layout a besoin d'un check rapide tandis que chaque page
 * fait le fetch complet :
 *
 *   - `requireEspacePartenaireSession(locale)` : valide cookie + JWT ;
 *     redirect vers /espace-partenaire?error=expired|invalid si KO.
 *     Retourne `{ prospectId }`. ZERO query DB. Utilise par layout.tsx.
 *
 *   - `loadDashboardData(locale)` : appelle requireEspacePartenaireSession
 *     puis fetch prospect + contact + company + invite-clicks. Utilise
 *     par chaque sous-page (stand, coordonnees, documents, etc.).
 *
 * P5.x.17-bis : on supprime le wrap `cache()` qui faisait double-emploi
 * avec l'auth en layout. Une seule query par sous-page suffit (meme cout
 * que pre-P5.x.17 quand le dashboard etait une page unique).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type SupabaseClient } from '@supabase/supabase-js';
import {
  verifySessionToken,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  EspacePartenaireTokenError,
} from './jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { resolveActiveProspectIdForContact } from './resolve-prospect';

const LOG_PREFIX = '[espace-partenaire/session]';

export interface EspacePartenaireDashboardData {
  prospect: {
    id: string;
    status: string;
    pack_code: string | null;
    estimated_amount: number | null;
    payment_path: string | null;
    events_interest: string[] | null;
    sellsy_devis_id: string | null;
    sellsy_devis_number: string | null;
    sellsy_devis_public_url: string | null;
    sellsy_devis_emitted_at: string | null;
    sellsy_devis_total_ttc: number | null;
    acompte_amount_eur: number | null;
    acompte_paid_at: string | null;
    acompte_payment_link_url: string | null;
    acompte_payment_link_expires_at: string | null;
    // P5.x.10 — facture Sellsy + booth allocation.
    sellsy_invoice_public_url: string | null;
    // P5.x.SellsyDocumentsFlow — pro-forma Sellsy (gap d'affichage corrigé).
    sellsy_proforma_number: string | null;
    sellsy_proforma_public_url: string | null;
    sellsy_proforma_emitted_at: string | null;
    sellsy_invoice_number: string | null;
    sellsy_invoice_emitted_at: string | null;
    booth_assignment: string | null;
    booth_assigned_at: string | null;
  };
  contact: {
    first_name: string | null;
    last_name: string | null;
    language: string | null;
    // P5.x.10 — editables depuis l'Espace Partenaire.
    email: string | null;
    phone: string | null;
    role: string | null;
  };
  company: {
    id: string;
    name: string;
    /** P5.x.10.bis — distingue partenaires PRS (tarif preferentiel) vs MDS. */
    category: 'prs_exhibitor' | 'standard' | 'non_eligible' | null;
    /** P5.x.12 — logo upload partenaire ou sync Connectonair. */
    logoUrl: string | null;
    /** P5.x.16-bis — slug court nominatif pour URL d'invitation. */
    slug: string | null;
  };
  /**
   * Indique si le payment-link acompte est expire au moment du fetch.
   * Calcule cote helper (impure Date.now() interdit dans le composant
   * server selon la regle ESLint react-hooks/purity).
   */
  paymentLinkExpired: boolean;
  /**
   * P5.x.16 — nombre de clicks sur le lien d'invitation visiteur
   * (/i/<company_id>) genere pour cet partenaire. Proxy d'engagement
   * reseau, affiche dans la section "Invitez vos clients".
   */
  inviteClicks: number;
}

/**
 * Valide le cookie session Espace Partenaire + JWT, SANS query DB.
 *
 * P5.x.17-bis — extrait de loadDashboardData pour permettre au layout
 * du dashboard de proteger toutes les sous-routes sans relancer une
 * query DB a chaque navigation. Les pages appellent loadDashboardData
 * pour leur fetch complet (qui appelle ce helper en interne).
 *
 * En cas d'echec, redirect vers /espace-partenaire?error=expired|invalid.
 * Log toujours en console le resultat (raison du reject + match
 * eventuel) pour debug Vercel.
 */
export async function requireEspacePartenaireSession(
  locale: string,
): Promise<{ prospectId: string }> {
  const session = await requireContactSession(locale);
  if (!session.prospectId) {
    // P8.2-redirect-loop : contact simple sans prospect -> redirect vers
    // /dashboard/profil (page always-on, safe) au lieu de /dashboard racine.
    // La racine /dashboard fait elle-meme un dispatch intelligent vers
    // /dashboard/stand ou /dashboard/profil selon profil ; rediriger ici
    // vers /dashboard creerait une boucle root->stand->root->stand pour
    // un contact simple (stand utilise loadDashboardData qui appelle ce
    // helper, qui re-rediriger vers root, qui redirige vers stand...).
    console.warn(
      '%s no-prospect-for-contact contact=%s locale=%s — redirect to /dashboard/profil',
      LOG_PREFIX,
      session.contactId,
      locale,
    );
    redirect(`/${locale}/espace-partenaire/dashboard/profil`);
  }
  return { prospectId: session.prospectId };
}

/**
 * P8.2 — helper unifie pour la session espace contact (incluant les
 * contacts simples sans prospect). Retourne :
 *   - contactId : toujours present.
 *   - prospectId : present si le contact est lie a un prospect actif
 *                  (via primary_contact_id) ; null pour contact simple.
 *
 * Resolution selon le kind du JWT :
 *   - kind='contact' (P8.2)        : sub = contact_id direct.
 *   - kind='prospect' (legacy)     : sub = prospect_id -> resolve
 *     primary_contact_id pour contactId.
 */
export async function requireContactSession(
  locale: string,
): Promise<{ contactId: string; prospectId: string | null }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    console.warn(
      '%s no-cookie locale=%s expected=%s — redirect to /espace-partenaire?error=expired',
      LOG_PREFIX,
      locale,
      ESPACE_EXPOSANT_SESSION_COOKIE,
    );
    redirect(`/${locale}/espace-partenaire?error=expired`);
  }

  let claims;
  try {
    claims = await verifySessionToken(sessionCookie.value);
  } catch (err) {
    const code =
      err instanceof EspacePartenaireTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn(
      '%s jwt-reject code=%s msg=%s — redirect',
      LOG_PREFIX,
      code,
      err instanceof Error ? err.message : String(err),
    );
    redirect(`/${locale}/espace-partenaire?error=${code}`);
  }

  const supabase = getSupabaseServiceClient();

  if (claims.kind === 'contact') {
    // P8.2 : sub = contact_id.
    const contactId = claims.prospectId; // sub stocke contact_id pour kind=contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .maybeSingle();
    if (!contact) {
      console.warn('%s contact-not-found id=%s', LOG_PREFIX, contactId);
      redirect(`/${locale}/espace-partenaire?error=invalid`);
    }
    // P11.x.MultiPartnerContentResolution : on résout le prospect par
    // company (partner_access_grants) et non plus par primary_contact_id —
    // un contact secondaire d'une société voit le dossier de la société.
    // Fallback legacy primary_contact_id intégré dans le helper.
    const prospectId = await resolveActiveProspectIdForContact(
      supabase as unknown as SupabaseClient,
      contactId,
    );
    return { contactId, prospectId };
  }

  // Legacy : sub = prospect_id. Resolve primary_contact_id pour contactId.
  const { data: prospect } = await supabase
    .from('prospects')
    .select('id, primary_contact_id')
    .eq('id', claims.prospectId)
    .maybeSingle();
  if (!prospect?.primary_contact_id) {
    // Prospect sans primary contact -> peut arriver historiquement.
    // On garde le prospectId mais le contactId est inconnu — l'appelant
    // (loadDashboardData) gere ce cas via les anciens helpers.
    console.warn('%s legacy-prospect-no-primary-contact id=%s', LOG_PREFIX, claims.prospectId);
    return { contactId: '', prospectId: claims.prospectId };
  }
  return {
    contactId: prospect.primary_contact_id,
    prospectId: prospect.id,
  };
}

/**
 * Lit le cookie session, valide le JWT, fetch les donnees du prospect.
 *
 * Appelle requireEspacePartenaireSession() en amont -> meme comportement
 * de redirect en cas de cookie/JWT absent ou invalide.
 *
 * P5.x.17-bis : suppression du wrap React.cache(). Le layout fait
 * l'auth seul (sans DB), chaque page fait son fetch. Une seule query
 * DB par render de page, pas de cache cross-component a debugger.
 */
export async function loadDashboardData(locale: string): Promise<EspacePartenaireDashboardData> {
  const { prospectId } = await requireEspacePartenaireSession(locale);

  const supabase = getSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from('prospects')
    .select(
      `
      id, status, pack_code, estimated_amount, payment_path, events_interest,
      sellsy_devis_id, sellsy_devis_number, sellsy_devis_public_url,
      sellsy_devis_emitted_at, sellsy_devis_total_ttc,
      sellsy_invoice_public_url, sellsy_invoice_number, sellsy_invoice_emitted_at,
      sellsy_proforma_number, sellsy_proforma_public_url, sellsy_proforma_emitted_at,
      acompte_amount_eur, acompte_paid_at,
      acompte_payment_link_url, acompte_payment_link_expires_at,
      booth_assignment, booth_assigned_at,
      company:companies!inner(id, name, slug, category, logo_url),
      contact:contacts!primary_contact_id(first_name, last_name, language, email, phone, role)
      `,
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (error || !row) {
    console.warn('%s prospect-not-found id=%s — redirect invalid', LOG_PREFIX, prospectId);
    redirect(`/${locale}/espace-partenaire?error=invalid`);
  }

  const company = pickFirst(row.company);
  const contact = pickFirst(row.contact);

  const paymentLinkExpired = row.acompte_payment_link_expires_at
    ? new Date(row.acompte_payment_link_expires_at).getTime() < Date.now()
    : false;

  // P5.x.16 — compteur de clicks sur le lien d'invitation visiteur.
  // Best-effort : si la table n'existe pas encore (migration 0037 pas
  // appliquee) ou erreur reseau, on tombe sur 0 plutot que de faire
  // crasher le dashboard.
  const companyIdForCount = (company as { id?: string } | null)?.id;
  let inviteClicks = 0;
  if (companyIdForCount) {
    const { count, error: countErr } = await supabase
      .from('visitor_invitations_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyIdForCount);
    if (countErr) {
      console.warn(
        '%s invite-clicks-count-failed company=%s msg=%s',
        LOG_PREFIX,
        companyIdForCount,
        countErr.message,
      );
    } else {
      inviteClicks = count ?? 0;
    }
  }

  return {
    prospect: {
      id: row.id,
      status: row.status,
      pack_code: row.pack_code,
      estimated_amount: row.estimated_amount,
      payment_path: row.payment_path,
      events_interest: row.events_interest,
      sellsy_devis_id: row.sellsy_devis_id,
      sellsy_devis_number: row.sellsy_devis_number,
      sellsy_devis_public_url: row.sellsy_devis_public_url,
      sellsy_devis_emitted_at: row.sellsy_devis_emitted_at,
      sellsy_devis_total_ttc: row.sellsy_devis_total_ttc,
      acompte_amount_eur: row.acompte_amount_eur,
      acompte_paid_at: row.acompte_paid_at,
      acompte_payment_link_url: row.acompte_payment_link_url,
      acompte_payment_link_expires_at: row.acompte_payment_link_expires_at,
      sellsy_invoice_public_url: row.sellsy_invoice_public_url,
      sellsy_proforma_number: row.sellsy_proforma_number,
      sellsy_proforma_public_url: row.sellsy_proforma_public_url,
      sellsy_proforma_emitted_at: row.sellsy_proforma_emitted_at,
      sellsy_invoice_number: row.sellsy_invoice_number,
      sellsy_invoice_emitted_at: row.sellsy_invoice_emitted_at,
      booth_assignment: row.booth_assignment,
      booth_assigned_at: row.booth_assigned_at,
    },
    contact: {
      first_name: contact?.first_name ?? null,
      last_name: contact?.last_name ?? null,
      language: contact?.language ?? null,
      email: (contact as { email?: string | null } | null)?.email ?? null,
      phone: (contact as { phone?: string | null } | null)?.phone ?? null,
      role: (contact as { role?: string | null } | null)?.role ?? null,
    },
    company: {
      id: (company as { id?: string } | null)?.id ?? '',
      name: company?.name ?? '',
      category:
        (company as { category?: 'prs_exhibitor' | 'standard' | 'non_eligible' | null } | null)
          ?.category ?? null,
      logoUrl: (company as { logo_url?: string | null } | null)?.logo_url ?? null,
      slug: (company as { slug?: string | null } | null)?.slug ?? null,
    },
    paymentLinkExpired,
    inviteClicks,
  };
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

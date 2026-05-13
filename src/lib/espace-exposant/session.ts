/**
 * Helpers session Espace Exposant — P5.x.2 / P5.x.17-bis.
 *
 * Deux niveaux d'API pour distinguer "valider l'auth" (cheap, cookie+JWT
 * uniquement) de "charger toutes les donnees du dashboard" (DB roundtrip
 * sur prospect/contact/company + count clicks). Sert a l'Espace Exposant
 * V1.3 ou le layout a besoin d'un check rapide tandis que chaque page
 * fait le fetch complet :
 *
 *   - `requireEspaceExposantSession(locale)` : valide cookie + JWT ;
 *     redirect vers /espace-exposant?error=expired|invalid si KO.
 *     Retourne `{ prospectId }`. ZERO query DB. Utilise par layout.tsx.
 *
 *   - `loadDashboardData(locale)` : appelle requireEspaceExposantSession
 *     puis fetch prospect + contact + company + invite-clicks. Utilise
 *     par chaque sous-page (stand, coordonnees, documents, etc.).
 *
 * P5.x.17-bis : on supprime le wrap `cache()` qui faisait double-emploi
 * avec l'auth en layout. Une seule query par sous-page suffit (meme cout
 * que pre-P5.x.17 quand le dashboard etait une page unique).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  verifySessionToken,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  EspaceExposantTokenError,
} from './jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[espace-exposant/session]';

export interface EspaceExposantDashboardData {
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
    booth_assignment: string | null;
    booth_assigned_at: string | null;
  };
  contact: {
    first_name: string | null;
    last_name: string | null;
    language: string | null;
    // P5.x.10 — editables depuis l'Espace Exposant.
    email: string | null;
    phone: string | null;
    role: string | null;
  };
  company: {
    id: string;
    name: string;
    /** P5.x.10.bis — distingue exposants PRS (tarif preferentiel) vs MDS. */
    category: 'prs_exhibitor' | 'standard' | 'non_eligible' | null;
    /** P5.x.12 — logo upload exposant ou sync Connectonair. */
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
   * (/i/<company_id>) genere pour cet exposant. Proxy d'engagement
   * reseau, affiche dans la section "Invitez vos clients".
   */
  inviteClicks: number;
}

/**
 * Valide le cookie session Espace Exposant + JWT, SANS query DB.
 *
 * P5.x.17-bis — extrait de loadDashboardData pour permettre au layout
 * du dashboard de proteger toutes les sous-routes sans relancer une
 * query DB a chaque navigation. Les pages appellent loadDashboardData
 * pour leur fetch complet (qui appelle ce helper en interne).
 *
 * En cas d'echec, redirect vers /espace-exposant?error=expired|invalid.
 * Log toujours en console le resultat (raison du reject + match
 * eventuel) pour debug Vercel.
 */
export async function requireEspaceExposantSession(
  locale: string,
): Promise<{ prospectId: string }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    console.warn(
      '%s no-cookie locale=%s expected=%s — redirect to /espace-exposant?error=expired',
      LOG_PREFIX,
      locale,
      ESPACE_EXPOSANT_SESSION_COOKIE,
    );
    redirect(`/${locale}/espace-exposant?error=expired`);
  }

  try {
    const claims = await verifySessionToken(sessionCookie.value);
    return { prospectId: claims.prospectId };
  } catch (err) {
    const code =
      err instanceof EspaceExposantTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn(
      '%s jwt-reject code=%s msg=%s — redirect',
      LOG_PREFIX,
      code,
      err instanceof Error ? err.message : String(err),
    );
    redirect(`/${locale}/espace-exposant?error=${code}`);
  }
}

/**
 * Lit le cookie session, valide le JWT, fetch les donnees du prospect.
 *
 * Appelle requireEspaceExposantSession() en amont -> meme comportement
 * de redirect en cas de cookie/JWT absent ou invalide.
 *
 * P5.x.17-bis : suppression du wrap React.cache(). Le layout fait
 * l'auth seul (sans DB), chaque page fait son fetch. Une seule query
 * DB par render de page, pas de cache cross-component a debugger.
 */
export async function loadDashboardData(locale: string): Promise<EspaceExposantDashboardData> {
  const { prospectId } = await requireEspaceExposantSession(locale);

  const supabase = getSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from('prospects')
    .select(
      `
      id, status, pack_code, estimated_amount, payment_path, events_interest,
      sellsy_devis_id, sellsy_devis_number, sellsy_devis_public_url,
      sellsy_devis_emitted_at, sellsy_devis_total_ttc,
      sellsy_invoice_public_url,
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
    redirect(`/${locale}/espace-exposant?error=invalid`);
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

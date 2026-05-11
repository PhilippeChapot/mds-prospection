/**
 * Helpers session Espace Exposant — P5.x.2.
 *
 * Utilise par layout.tsx du dashboard pour lire le cookie + valider le
 * JWT session, et fetch les donnees prospect via service-role (safe :
 * on filtre sur prospect.id du cookie verifie, donc pas d'enumeration).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  verifySessionToken,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  EspaceExposantTokenError,
} from './jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

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
    name: string;
    /** P5.x.10.bis — distingue exposants PRS (tarif preferentiel) vs MDS. */
    category: 'prs_exhibitor' | 'standard' | 'non_eligible' | null;
  };
  /**
   * Indique si le payment-link acompte est expire au moment du fetch.
   * Calcule cote helper (impure Date.now() interdit dans le composant
   * server selon la regle ESLint react-hooks/purity).
   */
  paymentLinkExpired: boolean;
}

/**
 * Lit le cookie session, valide le JWT, fetch les donnees du prospect.
 *
 * En cas d'echec (cookie absent / JWT invalide / prospect introuvable),
 * redirect vers la page de demande de magic-link avec error=expired ou
 * error=invalid. Aucune erreur ne remonte jamais au client.
 */
export async function loadDashboardData(locale: string): Promise<EspaceExposantDashboardData> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    redirect(`/${locale}/espace-exposant?error=expired`);
  }

  let prospectId: string;
  try {
    const claims = await verifySessionToken(sessionCookie.value);
    prospectId = claims.prospectId;
  } catch (err) {
    const code =
      err instanceof EspaceExposantTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    redirect(`/${locale}/espace-exposant?error=${code}`);
  }

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
      company:companies!inner(name, category),
      contact:contacts!primary_contact_id(first_name, last_name, language, email, phone, role)
      `,
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (error || !row) {
    console.warn(
      '[espace-exposant/session] prospect-not-found id=%s — clearing session',
      prospectId,
    );
    redirect(`/${locale}/espace-exposant?error=invalid`);
  }

  const company = pickFirst(row.company);
  const contact = pickFirst(row.contact);

  const paymentLinkExpired = row.acompte_payment_link_expires_at
    ? new Date(row.acompte_payment_link_expires_at).getTime() < Date.now()
    : false;

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
      name: company?.name ?? '',
      category:
        (company as { category?: 'prs_exhibitor' | 'standard' | 'non_eligible' | null } | null)
          ?.category ?? null,
    },
    paymentLinkExpired,
  };
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

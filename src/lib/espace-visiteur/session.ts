/**
 * P15.3 — session Espace Visiteur (cookie + JWT, sans/avec DB).
 *
 * - requireVisitorSession(locale) : valide cookie + JWT, ZÉRO query DB.
 *   Redirect vers /{locale}/espace-visiteur?error=expired|invalid si KO.
 * - loadVisitorData(locale) : requireVisitorSession + fetch visiteur +
 *   contact + société. Utilisé par les pages connectées.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  verifyVisitorSessionToken,
  ESPACE_VISITEUR_SESSION_COOKIE,
  EspaceVisiteurTokenError,
} from './jwt';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[espace-visiteur/session]';

export interface EspaceVisiteurData {
  visitor: {
    id: string;
    status: string;
    visitor_type: string | null;
    pole: string | null;
    is_vip: boolean;
    language: string;
  };
  contact: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone_mobile: string | null;
  } | null;
  company: { id: string; name: string } | null;
  account: { password_set_at: string | null } | null;
}

/** Valide le cookie session visiteur + JWT, sans query DB. */
export async function requireVisitorSession(locale: string): Promise<{ visitorId: string }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_VISITEUR_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    console.warn('%s no-cookie locale=%s — redirect error=expired', LOG_PREFIX, locale);
    redirect(`/${locale}/espace-visiteur?error=expired`);
  }

  try {
    const claims = await verifyVisitorSessionToken(sessionCookie.value);
    return { visitorId: claims.visitorId };
  } catch (err) {
    const code =
      err instanceof EspaceVisiteurTokenError && err.code === 'expired' ? 'expired' : 'invalid';
    console.warn('%s jwt-reject code=%s — redirect', LOG_PREFIX, code);
    redirect(`/${locale}/espace-visiteur?error=${code}`);
  }
}

/** Charge les données du visiteur connecté (visiteur + contact + société). */
export async function loadVisitorData(locale: string): Promise<EspaceVisiteurData> {
  const { visitorId } = await requireVisitorSession(locale);
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('visitors')
    .select(
      `
      id, status, visitor_type, pole, is_vip, language,
      contact:contacts!visitors_contact_id_fkey(first_name, last_name, email, phone_mobile),
      company:companies(id, name),
      account:visitor_accounts(password_set_at)
      `,
    )
    .eq('id', visitorId)
    .maybeSingle();

  if (error || !row) {
    console.warn('%s visitor-not-found id=%s — redirect invalid', LOG_PREFIX, visitorId);
    redirect(`/${locale}/espace-visiteur?error=invalid`);
  }

  const r = row as Record<string, unknown>;
  const pickFirst = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  return {
    visitor: {
      id: r.id as string,
      status: r.status as string,
      visitor_type: (r.visitor_type as string | null) ?? null,
      pole: (r.pole as string | null) ?? null,
      is_vip: Boolean(r.is_vip),
      language: r.language as string,
    },
    contact: pickFirst(r.contact as EspaceVisiteurData['contact']),
    company: pickFirst(r.company as EspaceVisiteurData['company']),
    account: pickFirst(r.account as EspaceVisiteurData['account']),
  };
}

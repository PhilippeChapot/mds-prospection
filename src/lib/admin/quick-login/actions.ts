'use server';

/**
 * P12.x.SuperAdminQuickLogin — raccourcis super_admin pour acceder en
 * 1 clic aux 2 espaces front (Affilié + Partenaire).
 *
 * Reutilise les helpers signAffilieSessionToken / signContactSessionToken
 * (PAS de duplication de logique JWT). Set le cookie de session
 * directement (skip envoi email magic link).
 *
 * RBAC strict : super_admin uniquement. Audit log obligatoire.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * 'use server' n exporte QUE des async functions (les types sont dans
 * ./types.ts, sans 'use server').
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  signAffilieSessionToken,
  AFFILIE_SESSION_COOKIE,
  AFFILIE_SESSION_MAX_AGE,
} from '@/lib/affilie/jwt';
import {
  signContactSessionToken,
  ESPACE_EXPOSANT_SESSION_COOKIE,
  ESPACE_EXPOSANT_SESSION_MAX_AGE,
} from '@/lib/espace-partenaire/jwt';

type QuickLoginResult = { ok: true; redirect_url: string } | { ok: false; error: string };

const DEMO_AFFILIATE_KEY = 'demo_affiliate_id';
const DEMO_PARTENAIRE_KEY = 'demo_partenaire_contact_id';

// ---------------------------------------------------------------------------
// quickLoginAsAffilieDemoAction
// ---------------------------------------------------------------------------

export async function quickLoginAsAffilieDemoAction(): Promise<QuickLoginResult> {
  const profile = await requireSuperAdmin();
  const supabase = getSupabaseServiceClient();

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', DEMO_AFFILIATE_KEY)
    .maybeSingle();
  const demoId = typeof setting?.value === 'string' ? setting.value.trim() : null;
  if (!demoId) {
    return {
      ok: false,
      error: 'demo_affiliate_id non configuré dans /admin/preferences.',
    };
  }

  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, display_name, contact_email')
    .eq('id', demoId)
    .maybeSingle();
  if (!affiliate) {
    return { ok: false, error: `Affilié démo introuvable (id=${demoId}).` };
  }

  const sessionToken = await signAffilieSessionToken(affiliate.id);
  const cookieStore = await cookies();
  cookieStore.set(AFFILIE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AFFILIE_SESSION_MAX_AGE,
  });

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'affiliates',
    entity_id: affiliate.id,
    action: 'update',
    after: {
      kind: 'super_admin_quick_login_affilie',
      actor_role: profile.role,
      affiliate_name: affiliate.display_name,
      affiliate_email: affiliate.contact_email,
    } as never,
  });

  revalidatePath('/admin');
  return { ok: true, redirect_url: '/fr/affilie/dashboard' };
}

// ---------------------------------------------------------------------------
// quickLoginAsPartenaireDemoAction
// ---------------------------------------------------------------------------

export async function quickLoginAsPartenaireDemoAction(): Promise<QuickLoginResult> {
  const profile = await requireSuperAdmin();
  const supabase = getSupabaseServiceClient();

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', DEMO_PARTENAIRE_KEY)
    .maybeSingle();
  const demoId = typeof setting?.value === 'string' ? setting.value.trim() : null;
  if (!demoId) {
    return {
      ok: false,
      error: 'demo_partenaire_contact_id non configuré dans /admin/preferences.',
    };
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company_id')
    .eq('id', demoId)
    .maybeSingle();
  if (!contact) {
    return { ok: false, error: `Contact démo introuvable (id=${demoId}).` };
  }

  const sessionToken = await signContactSessionToken(contact.id);
  const cookieStore = await cookies();
  cookieStore.set(ESPACE_EXPOSANT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ESPACE_EXPOSANT_SESSION_MAX_AGE,
  });

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'contacts',
    entity_id: contact.id,
    action: 'update',
    after: {
      kind: 'super_admin_quick_login_partenaire',
      actor_role: profile.role,
      contact_email: contact.email,
      contact_name: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
    } as never,
  });

  revalidatePath('/admin');
  return { ok: true, redirect_url: '/fr/espace-partenaire/dashboard' };
}

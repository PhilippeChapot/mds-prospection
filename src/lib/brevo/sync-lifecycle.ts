/**
 * syncBrevoLifecycle — P5.x.4 Phase C.
 *
 * Helper exporte appele depuis :
 *   - post-conversion (apres emission devis -> isQuoted=true)
 *   - webhook Sellsy signature.completed (-> isSigned=true)
 *   - webhook Sellsy paymentadd (-> isAcomptePaid=true)
 *   - webhook Stripe checkout.session.completed (-> isAcomptePaid=true)
 *   - admin updateProspectStatusAction (-> isLost / isSigned / isAcomptePaid
 *     selon le nouveau statut)
 *
 * Lit le state actuel du prospect en DB et upsert le contact Brevo avec :
 *   - les attributs marketing complets (firstName, devis number/url/total,
 *     etc.) pour les variables de la sequence "MDS Devis Emis"
 *   - les listes lifecycle correctes (mutuellement exclusives) avec
 *     unlinkListIds pour sortir des automations precedentes
 *
 * Idempotent et best-effort : si Brevo down, on log un warning et on
 * UPDATE last_sync_error_message pour visibilite admin (pas de throw).
 *
 * Logs structures (prefix [brevo/sync-lifecycle]).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { upsertContactBrevo, type ProspectPole, type ProspectCategory } from './lifecycle';
import { logBrevoCall } from './sync-logger';

const LOG_PREFIX = '[brevo/sync-lifecycle]';

interface ProspectRow {
  id: string;
  is_test: boolean;
  status: string;
  pack_code: string | null;
  signed_at: string | null;
  acompte_paid_at: string | null;
  sellsy_devis_id: string | null;
  sellsy_devis_number: string | null;
  sellsy_devis_public_url: string | null;
  sellsy_devis_emitted_at: string | null;
  sellsy_devis_total_ttc: number | null;
  acompte_payment_link_url: string | null;
  company: { name: string; category: ProspectCategory; pole: { code: string } | null } | null;
  contact: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    language: string | null;
    marketing_consent: boolean;
  } | null;
}

export interface SyncBrevoLifecycleResult {
  ok: boolean;
  skipped?: 'no_contact_email' | 'prospect_not_found' | 'is_test';
  error?: string;
}

export async function syncBrevoLifecycle(prospectId: string): Promise<SyncBrevoLifecycleResult> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('prospects')
    .select(
      `
      id, is_test, status, pack_code, signed_at, acompte_paid_at,
      sellsy_devis_id, sellsy_devis_number, sellsy_devis_public_url,
      sellsy_devis_emitted_at, sellsy_devis_total_ttc,
      acompte_payment_link_url,
      company:companies!inner(name, category, pole:poles(code)),
      contact:contacts!primary_contact_id(email, first_name, last_name, language, marketing_consent)
      `,
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (error || !data) {
    console.warn('%s prospect-not-found prospect=%s', LOG_PREFIX, prospectId);
    return { ok: false, skipped: 'prospect_not_found' };
  }

  const row = normalizeRow(data);
  const contact = row.contact;
  const company = row.company;

  if (!contact?.email) {
    console.warn('%s no-contact-email prospect=%s', LOG_PREFIX, prospectId);
    return { ok: false, skipped: 'no_contact_email' };
  }

  const pole = (company?.pole?.code as ProspectPole | null) ?? 'INCONNU';
  const category = (company?.category ?? 'standard') as ProspectCategory;

  // Derive lifecycle flags from columns. Mutuellement exclusifs cote
  // getListIdsForProspect (priorite lost > signed > acompte_paid > quoted),
  // mais on les passe tous : la priorite est calculee la-bas.
  const isLost = row.status === 'perdu';
  const isSigned = !!row.signed_at;
  const isAcomptePaid = !!row.acompte_paid_at;
  const isQuoted = !!row.sellsy_devis_id; // devis emis Sellsy

  try {
    await upsertContactBrevo({
      is_test: row.is_test,
      email: contact.email,
      firstName: contact.first_name,
      lastName: contact.last_name,
      companyName: company?.name ?? null,
      pole,
      category,
      language: (contact.language ?? 'FR') as 'FR' | 'EN',
      marketingConsent: Boolean(contact.marketing_consent),
      // P5.x.4 — flags lifecycle pour calcul listes Brevo
      isQuoted,
      isAcomptePaid,
      isSigned,
      isLost,
      // P5.x.4 — attributs sequence "MDS Devis Emis"
      sellsyDevisNumber: row.sellsy_devis_number,
      sellsyDevisUrl: row.sellsy_devis_public_url,
      sellsyDevisTotalTtc:
        row.sellsy_devis_total_ttc != null ? Number(row.sellsy_devis_total_ttc) : null,
      sellsyDevisEmittedAt: row.sellsy_devis_emitted_at,
      packCode: row.pack_code,
      acomptePaymentLinkUrl: row.acompte_payment_link_url,
    });

    await supabase
      .from('prospects')
      .update({ last_synced_brevo_at: new Date().toISOString() })
      .eq('id', prospectId);

    // P4.x.1 — sync_logs (audit Brevo).
    await logBrevoCall({
      entityType: 'prospects',
      entityId: prospectId,
      operation: 'update',
      status: 'success',
      payload: {
        flow: 'lifecycle',
        flags: { isQuoted, isAcomptePaid, isSigned, isLost },
        email: contact.email,
      },
    });

    console.log(
      '%s success prospect=%s flags={quoted=%s,acompte_paid=%s,signed=%s,lost=%s}',
      LOG_PREFIX,
      prospectId,
      isQuoted,
      isAcomptePaid,
      isSigned,
      isLost,
    );

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed prospect=%s msg=%s', LOG_PREFIX, prospectId, msg);
    await supabase
      .from('prospects')
      .update({
        last_sync_error_message: msg.slice(0, 1000),
        last_sync_error_provider: 'brevo',
        last_sync_error_at: new Date().toISOString(),
      })
      .eq('id', prospectId);
    // P4.x.1 — log error pour debug admin via /admin/sync-logs.
    await logBrevoCall({
      entityType: 'prospects',
      entityId: prospectId,
      operation: 'update',
      status: 'error',
      errorMessage: msg,
      payload: { flow: 'lifecycle', email: contact.email },
    });
    return { ok: false, error: msg };
  }
}

/**
 * Helper : Supabase JOIN renvoie company/contact en array OU object selon
 * la cardinalite. On normalise en object | null.
 */
function normalizeRow(raw: unknown): ProspectRow {
  const r = raw as Record<string, unknown>;
  function pickFirst(value: unknown): Record<string, unknown> | null {
    if (value == null) return null;
    if (Array.isArray(value)) {
      const first = value[0];
      return (first as Record<string, unknown> | null) ?? null;
    }
    return value as Record<string, unknown>;
  }

  const company = pickFirst(r.company);
  const pole = company ? pickFirst(company.pole) : null;
  const contact = pickFirst(r.contact);

  return {
    id: r.id as string,
    is_test: r.is_test as boolean,
    status: r.status as string,
    pack_code: (r.pack_code as string | null) ?? null,
    signed_at: (r.signed_at as string | null) ?? null,
    acompte_paid_at: (r.acompte_paid_at as string | null) ?? null,
    sellsy_devis_id: (r.sellsy_devis_id as string | null) ?? null,
    sellsy_devis_number: (r.sellsy_devis_number as string | null) ?? null,
    sellsy_devis_public_url: (r.sellsy_devis_public_url as string | null) ?? null,
    sellsy_devis_emitted_at: (r.sellsy_devis_emitted_at as string | null) ?? null,
    sellsy_devis_total_ttc: (r.sellsy_devis_total_ttc as number | null) ?? null,
    acompte_payment_link_url: (r.acompte_payment_link_url as string | null) ?? null,
    company: company
      ? {
          name: company.name as string,
          category: company.category as ProspectCategory,
          pole: pole ? { code: pole.code as string } : null,
        }
      : null,
    contact: contact
      ? {
          email: contact.email as string,
          first_name: (contact.first_name as string | null) ?? null,
          last_name: (contact.last_name as string | null) ?? null,
          language: (contact.language as string | null) ?? null,
          marketing_consent: Boolean(contact.marketing_consent),
        }
      : null,
  };
}

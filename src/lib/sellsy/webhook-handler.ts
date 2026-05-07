/**
 * Sellsy webhook handler — logique metier separee de la route HTTP pour
 * faciliter les tests Vitest sans monter une vraie requete.
 *
 * Events traites (P4 M7) :
 *   - document.signed : devis Sellsy passe en "accepte"
 *     -> UPDATE prospects.signed_at + status='signe'
 *     -> Brevo : addContactToList(BREVO_LIST_ID_SIGNED)
 *     -> Email admin : renderAdminSignatureFinaleEmail
 *     -> Si type=estimate (devis) : trigger creation facture integrale
 *        (sera fait async, best-effort — l'admin peut le faire manuel)
 *   - document.paid : facture entierement encaissee
 *     -> UPDATE prospects.acompte_paid_at + acompte_status='paid'
 *     -> Email admin : variant "paye" du template signature
 *   - autres : log + ignore
 *
 * Logs structures (prefix [sellsy/webhook]).
 */

import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { renderAdminSignatureFinaleEmail } from '@/lib/resend/templates/admin-notifications';
import { addContactToList } from '@/lib/brevo/lifecycle';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/database.types';

type ProspectUpdate = Database['public']['Tables']['prospects']['Update'];

const LOG_PREFIX = '[sellsy/webhook]';

export interface SellsyWebhookEvent {
  /** Identifiant unique fourni par Sellsy (utilise pour l'idempotence). */
  event_id?: string;
  type?: string;
  data?: {
    id?: number;
    type?: 'estimate' | 'proforma' | 'invoice';
    [k: string]: unknown;
  };
  // Selon les versions Sellsy V2, les events peuvent venir avec d'autres clefs.
  [k: string]: unknown;
}

export async function handleSellsyEvent(event: SellsyWebhookEvent): Promise<void> {
  const eventType = event.type ?? '';
  console.log(
    '%s dispatch type=%s event_id=%s document_id=%s',
    LOG_PREFIX,
    eventType,
    event.event_id ?? '(no id)',
    event.data?.id ?? '(no doc id)',
  );

  switch (eventType) {
    case 'document.signed':
      await handleDocumentSigned(event);
      break;
    case 'document.paid':
      await handleDocumentPaid(event);
      break;
    default:
      console.log('%s unhandled-type type=%s — ignore', LOG_PREFIX, eventType);
  }
}

async function handleDocumentSigned(event: SellsyWebhookEvent): Promise<void> {
  const docId = event.data?.id;
  const docType = event.data?.type ?? null;
  if (!docId) {
    console.error('%s signed-no-doc-id', LOG_PREFIX);
    return;
  }

  const supabase = getSupabaseServiceClient();
  // Match prospect par sellsy_devis_id, _proforma_id, ou _invoice_id (string en DB).
  const docIdStr = String(docId);
  const { data: prospect } = await supabase
    .from('prospects')
    .select(
      `
      id, sellsy_devis_id, sellsy_proforma_id, sellsy_invoice_id,
      sellsy_devis_number, sellsy_devis_public_url,
      contact:contacts(brevo_contact_id),
      company:companies!inner(name)
      `,
    )
    .or(
      `sellsy_devis_id.eq.${docIdStr},sellsy_proforma_id.eq.${docIdStr},sellsy_invoice_id.eq.${docIdStr}`,
    )
    .maybeSingle();

  if (!prospect) {
    console.warn('%s signed-no-prospect-match doc_id=%s', LOG_PREFIX, docIdStr);
    return;
  }

  // 1. UPDATE prospect : status='signe' + signed_at + last_synced_sellsy_at.
  const now = new Date().toISOString();
  const update: ProspectUpdate = {
    status: 'signe',
    signed_at: now,
    last_synced_sellsy_at: now,
    last_activity_at: now,
  };
  await supabase.from('prospects').update(update).eq('id', prospect.id);

  // 2. Brevo : ajouter a BREVO_LIST_ID_SIGNED si on a un brevo_contact_id.
  const contact = pickFirst(prospect.contact);
  const brevoIdRaw = contact?.brevo_contact_id;
  const brevoId = brevoIdRaw ? Number(brevoIdRaw) : NaN;
  const signedListId = Number(process.env.BREVO_LIST_ID_SIGNED ?? '');
  if (
    Number.isFinite(brevoId) &&
    brevoId > 0 &&
    Number.isFinite(signedListId) &&
    signedListId > 0
  ) {
    try {
      await addContactToList(brevoId, signedListId);
    } catch (err) {
      console.warn(
        '%s brevo-add-to-signed-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospect.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  } else {
    console.log(
      '%s brevo-skip-list-signed prospect=%s reason=%s',
      LOG_PREFIX,
      prospect.id,
      !brevoIdRaw ? 'no_brevo_contact_id' : 'no_BREVO_LIST_ID_SIGNED_env',
    );
  }

  // 3. Email admin notif signature.
  const company = pickFirst(prospect.company);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const tpl = renderAdminSignatureFinaleEmail({
    prospectUrl: `${baseUrl}/admin/prospects/${prospect.id}`,
    companyName: company?.name ?? '(société inconnue)',
    documentNumber: prospect.sellsy_devis_number ?? `DOC-${docIdStr}`,
    amountEur: '—',
    sellsyDocumentUrl:
      prospect.sellsy_devis_public_url ?? `https://go.sellsy.com/documents/${docIdStr}`,
  });
  await sendAdminNotification('admin_signature_finale', tpl);

  console.log(
    '%s signed-success prospect=%s doc_id=%s doc_type=%s',
    LOG_PREFIX,
    prospect.id,
    docIdStr,
    docType ?? '?',
  );
}

async function handleDocumentPaid(event: SellsyWebhookEvent): Promise<void> {
  const docId = event.data?.id;
  if (!docId) {
    console.error('%s paid-no-doc-id', LOG_PREFIX);
    return;
  }

  const supabase = getSupabaseServiceClient();
  const docIdStr = String(docId);
  const { data: prospect } = await supabase
    .from('prospects')
    .select(
      `
      id, sellsy_devis_id, sellsy_proforma_id, sellsy_invoice_id,
      sellsy_devis_number, sellsy_devis_public_url,
      company:companies!inner(name)
      `,
    )
    .or(
      `sellsy_devis_id.eq.${docIdStr},sellsy_proforma_id.eq.${docIdStr},sellsy_invoice_id.eq.${docIdStr}`,
    )
    .maybeSingle();

  if (!prospect) {
    console.warn('%s paid-no-prospect-match doc_id=%s', LOG_PREFIX, docIdStr);
    return;
  }

  const now = new Date().toISOString();
  const update: ProspectUpdate = {
    status: 'signe',
    acompte_status: 'paid',
    acompte_paid_at: now,
    last_synced_sellsy_at: now,
    last_activity_at: now,
  };
  await supabase.from('prospects').update(update).eq('id', prospect.id);

  // Notif admin (variant paye = on reuse signature_finale, le subject reste OK).
  const company = pickFirst(prospect.company);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const tpl = renderAdminSignatureFinaleEmail({
    prospectUrl: `${baseUrl}/admin/prospects/${prospect.id}`,
    companyName: company?.name ?? '(société inconnue)',
    documentNumber: prospect.sellsy_devis_number ?? `DOC-${docIdStr}`,
    amountEur: '—',
    sellsyDocumentUrl:
      prospect.sellsy_devis_public_url ?? `https://go.sellsy.com/documents/${docIdStr}`,
  });
  await sendAdminNotification('admin_signature_finale', tpl);

  console.log('%s paid-success prospect=%s doc_id=%s', LOG_PREFIX, prospect.id, docIdStr);
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Sellsy webhook handler — logique metier separee de la route HTTP pour
 * faciliter les tests Vitest sans monter une vraie requete.
 *
 * Quirk #22 — Sellsy V2 webhook payload shape :
 *   {
 *     eventType: "docslog" | "client" | "prospect" | ...,
 *     event:     "step" | "created" | "updated" | "emailsent" | ...,
 *     timestamp: "1778187955",
 *     ownerid:   "1084",
 *     ownertype: "staff",
 *     ... champs additionnels selon eventType
 *   }
 *
 * Quirk #23 — pour eventType=docslog (changement statut document) :
 *   {
 *     ...
 *     relatedid: "52437688",            // l'ID Sellsy du document (string)
 *     relatedtype: "estimate",           // "estimate" | "invoice" | "proforma"
 *     corpid: "929",
 *     relatedobject: {
 *       id: 52437688,
 *       status: "accepted" | "signed" | "paid" | "draft" | ...,
 *       number, date, related[], ...
 *     }
 *   }
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

/**
 * Shape Sellsy V2 webhook payload (quirks #22 + #23). Sellsy serialise
 * les nombres en string dans les webhooks.
 */
export interface SellsyWebhookEvent {
  eventType?: string;
  event?: string;
  timestamp?: string;
  ownerid?: string;
  ownertype?: string;
  // docslog (changement statut document) :
  relatedid?: string | number;
  relatedtype?: 'estimate' | 'invoice' | 'proforma' | string;
  corpid?: string;
  relatedobject?: {
    id?: number;
    status?: string;
    number?: string;
    date?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export async function handleSellsyEvent(event: SellsyWebhookEvent): Promise<void> {
  const key = `${event.eventType ?? 'unknown'}.${event.event ?? 'unknown'}`;
  console.log(
    '%s dispatch key=%s timestamp=%s ownerid=%s',
    LOG_PREFIX,
    key,
    event.timestamp ?? '?',
    event.ownerid ?? '?',
  );

  switch (key) {
    case 'docslog.step':
      await handleDocslogStep(event);
      break;
    case 'docslog.emailsent':
      console.log(
        '%s emailsent-skip relatedid=%s relatedtype=%s',
        LOG_PREFIX,
        event.relatedid ?? '?',
        event.relatedtype ?? '?',
      );
      break;
    default:
      // Log payload partiel pour identifier les events non geres.
      console.log(
        '%s unhandled-key key=%s payload=%s',
        LOG_PREFIX,
        key,
        JSON.stringify(event).slice(0, 500),
      );
  }
}

/**
 * Event docslog.step — Sellsy a fait avancer un document (devis -> signe,
 * facture -> payee, etc.). Routing :
 *   - status='accepted'|'signed' : prospect status='signe', signed_at,
 *     Brevo SIGNED, admin email. Si estimate -> trigger facture integrale.
 *   - status='paid' (invoice) : prospect acompte_status='paid', admin email.
 *   - autres ('draft', 'sent', 'expired'...) : log + skip.
 */
async function handleDocslogStep(event: SellsyWebhookEvent): Promise<void> {
  if (!event.relatedid || !event.relatedtype) {
    console.warn(
      '%s step-missing-related relatedid=%s relatedtype=%s',
      LOG_PREFIX,
      event.relatedid ?? '?',
      event.relatedtype ?? '?',
    );
    return;
  }

  const documentId = String(event.relatedid);
  const documentType = event.relatedtype as 'estimate' | 'invoice' | 'proforma';
  const status = (event.relatedobject?.status ?? '').toLowerCase().trim();

  const isAccepted = status === 'accepted' || status === 'signed';
  const isPaid = status === 'paid';

  if (!isAccepted && !isPaid) {
    console.log(
      '%s step-status-not-tracked doc_id=%s type=%s status=%s — skip',
      LOG_PREFIX,
      documentId,
      documentType,
      status || '(empty)',
    );
    return;
  }

  // Lookup prospect par la colonne dediee selon le type Sellsy.
  const matchColumn =
    documentType === 'estimate'
      ? 'sellsy_devis_id'
      : documentType === 'invoice'
        ? 'sellsy_invoice_id'
        : documentType === 'proforma'
          ? 'sellsy_proforma_id'
          : null;

  if (!matchColumn) {
    console.warn('%s step-unknown-relatedtype type=%s', LOG_PREFIX, documentType);
    return;
  }

  const supabase = getSupabaseServiceClient();
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
    .eq(matchColumn, documentId)
    .maybeSingle();

  if (!prospect) {
    // Pas dans notre app (ex: devis Sellsy direct cree par Phil sans passer
    // par notre flow). C'est attendu, on log info et on retourne.
    console.log(
      '%s no-prospect-match-info doc_id=%s type=%s — devis hors flow MDS, ignore',
      LOG_PREFIX,
      documentId,
      documentType,
    );
    return;
  }

  const now = new Date().toISOString();
  const update: ProspectUpdate = {
    last_synced_sellsy_at: now,
    last_activity_at: now,
  };

  if (isAccepted) {
    update.status = 'signe';
    update.signed_at = now;
  }
  if (isPaid) {
    update.status = 'signe';
    update.acompte_status = 'paid';
    update.acompte_paid_at = now;
  }

  await supabase.from('prospects').update(update).eq('id', prospect.id);

  // Brevo SIGNED uniquement sur acceptation (pas sur paiement seul).
  if (isAccepted) {
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
  }

  // Email admin notif (signature ou paiement integral).
  const company = pickFirst(prospect.company);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const tpl = renderAdminSignatureFinaleEmail({
    prospectUrl: `${baseUrl}/admin/prospects/${prospect.id}`,
    companyName: company?.name ?? '(société inconnue)',
    documentNumber:
      prospect.sellsy_devis_number ?? event.relatedobject?.number ?? `DOC-${documentId}`,
    amountEur: '—',
    sellsyDocumentUrl:
      prospect.sellsy_devis_public_url ?? `https://go.sellsy.com/documents/${documentId}`,
  });
  await sendAdminNotification('admin_signature_finale', tpl);

  // Si devis signe (estimate accepted) -> trigger creation facture
  // integrale en best-effort. L'admin pourra retry manuellement si fail.
  if (isAccepted && documentType === 'estimate') {
    try {
      const { createSellsyDocument } = await import('./create-document');
      const inv = await createSellsyDocument(prospect.id, 'invoice');
      console.log(
        '%s invoice-auto-created prospect=%s invoice_id=%d',
        LOG_PREFIX,
        prospect.id,
        inv.documentId,
      );
      // Persist invoice_id pour le rapprochement futur.
      await supabase
        .from('prospects')
        .update({ sellsy_invoice_id: String(inv.documentId) })
        .eq('id', prospect.id);
    } catch (err) {
      console.warn(
        '%s invoice-auto-create-failed prospect=%s msg=%s — admin pourra retry',
        LOG_PREFIX,
        prospect.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(
    '%s success prospect=%s doc_id=%s type=%s status=%s accepted=%s paid=%s',
    LOG_PREFIX,
    prospect.id,
    documentId,
    documentType,
    status,
    isAccepted,
    isPaid,
  );
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

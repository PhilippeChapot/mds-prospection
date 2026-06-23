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
import {
  renderAdminSignatureFinaleEmail,
  renderAdminPaymentAddEmail,
} from '@/lib/resend/templates/admin-notifications';
// P5.x.4 Phase C : addContactToList remplace par syncBrevoLifecycle
// (import dynamique dans le handler signature.completed pour eviter
// le bundle SSR).
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { calculatePaymentStatus } from '@/lib/prospects/calculate-payment-status';
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
    case 'docslog.paymentadd':
      // P4.x.1 Bug G : reglement ajoute sur un devis/facture/proforma cote
      // Sellsy (manuel admin OU webhook signature OU virement SEPA imp).
      await handleDocslogPaymentAdd(event);
      break;
    case 'signature.completed':
      // Signature electronique completee (DocuSign-like Sellsy). Memes effets
      // que docslog.step status=accepted, mais log distinct pour traceability.
      await handleSignatureCompleted(event);
      break;
    case 'docslog.created':
    case 'docslog.emailsent':
    case 'signature.created':
    case 'signature.signature':
      // Events informatifs : on log la presence + relatedid pour audit
      // mais pas d'action metier (la creation Sellsy = nous-memes via API,
      // les emails Sellsy n'affectent pas notre statut prospect, et les
      // events intermediaires de signature sont couverts par signature.completed).
      console.log(
        '%s informational-skip key=%s relatedid=%s relatedtype=%s',
        LOG_PREFIX,
        key,
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
      id, company_id, signed_at,
      sellsy_devis_id, sellsy_proforma_id, sellsy_invoice_id,
      sellsy_devis_number, sellsy_devis_public_url,
      contact:contacts!primary_contact_id(brevo_contact_id),
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

  // P8.1 — auto-enable preferences communication des contacts a la signature.
  // Idempotent : on ne re-coche que si l'evenement a effectivement marque
  // une transition (signed_at passe de null a non-null). Si le webhook
  // est rejoue, prospect.signed_at est deja non-null et on skip.
  if (isAccepted && !prospect.signed_at && prospect.company_id) {
    try {
      const { autoEnableExpoPreferencesOnSignature } =
        await import('@/lib/admin/contact-preferences/auto-enable');
      const result = await autoEnableExpoPreferencesOnSignature({
        prospectId: prospect.id,
        companyId: prospect.company_id,
      });
      console.log(
        '%s auto-enable-prefs prospect=%s updated=%d skipped=%d',
        LOG_PREFIX,
        prospect.id,
        result.contacts_updated,
        result.contacts_skipped_locked,
      );
    } catch (err) {
      console.warn(
        '%s auto-enable-prefs-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospect.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // P5.x.4 Phase C : sync Brevo complet (upsert attributs + listes
  // lifecycle avec exit conditions). Remplace le simple addContactToList
  // qui n'enlevait pas le contact de "MDS Devis Emis" -> les automations
  // continuaient apres signature.
  if (isAccepted || isPaid) {
    try {
      const { syncBrevoLifecycle } = await import('@/lib/brevo/sync-lifecycle');
      await syncBrevoLifecycle(prospect.id);
    } catch (err) {
      console.warn(
        '%s brevo-sync-failed prospect=%s msg=%s',
        LOG_PREFIX,
        prospect.id,
        err instanceof Error ? err.message : String(err),
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

/**
 * Event docslog.paymentadd — un reglement a ete ajoute sur le document
 * (paiement Stripe arrivant via /v2/payments link, ou virement SEPA saisi
 * manuellement dans Sellsy par l'admin, ou paiement reconcile).
 *
 * Le payload contient relatedid (le document) et relatedobject avec les
 * totaux du document (pas le montant du paiement specifique). On marque
 * le prospect comme `acompte_status=paid` + `acompte_paid_at=now()`. Le
 * detail des montants n'est pas critique cote MDS — c'est Sellsy qui
 * gere la balance, on synchro juste l'etat "encaisse" cote DB.
 */
async function handleDocslogPaymentAdd(event: SellsyWebhookEvent): Promise<void> {
  if (!event.relatedid || !event.relatedtype) {
    console.warn(
      '%s paymentadd-missing-related relatedid=%s relatedtype=%s',
      LOG_PREFIX,
      event.relatedid ?? '?',
      event.relatedtype ?? '?',
    );
    return;
  }

  const documentId = String(event.relatedid);
  const documentType = event.relatedtype as 'estimate' | 'invoice' | 'proforma';

  const matchColumn =
    documentType === 'estimate'
      ? 'sellsy_devis_id'
      : documentType === 'invoice'
        ? 'sellsy_invoice_id'
        : documentType === 'proforma'
          ? 'sellsy_proforma_id'
          : null;
  if (!matchColumn) {
    console.warn('%s paymentadd-unknown-relatedtype type=%s', LOG_PREFIX, documentType);
    return;
  }

  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select(
      `
      id, sellsy_devis_id, sellsy_proforma_id, sellsy_invoice_id,
      sellsy_devis_number, sellsy_devis_public_url, sellsy_devis_total_ttc,
      acompte_amount_eur,
      company:companies!inner(name)
      `,
    )
    .eq(matchColumn, documentId)
    .maybeSingle();

  if (!prospect) {
    console.log(
      '%s paymentadd-no-prospect-match doc_id=%s type=%s — devis hors flow MDS, ignore',
      LOG_PREFIX,
      documentId,
      documentType,
    );
    return;
  }

  // P4.x.2 sujet C : montant du paiement specifique. Sellsy paymentadd
  // peut envoyer soit relatedobject.amounts.total (le total du DOCUMENT,
  // pas du paiement) soit un champ amount dedie. On essaie d'abord
  // amount/payment_amount/value (paiement specifique), fallback sur
  // amounts.total - acompte deja paye (delta).
  const paymentAmountRaw =
    (event as { amount?: number | string }).amount ??
    (event as { payment_amount?: number | string }).payment_amount;
  let paymentEur: number | null = null;
  if (paymentAmountRaw != null) {
    paymentEur = Number(paymentAmountRaw);
  } else {
    // Fallback : total document - paye precedent. Approximation : si
    // acompte_amount_eur est null et qu'on recoit total, on assume que
    // c'est le 1er paiement et qu'il fait `total`.
    const totalRaw = event.relatedobject?.amounts as { total?: string | number } | undefined;
    const totalDocEur = totalRaw?.total != null ? Number(totalRaw.total) : null;
    if (totalDocEur != null) {
      const previousPaid = Number(prospect.acompte_amount_eur ?? 0);
      paymentEur = Math.max(0, totalDocEur - previousPaid);
    }
  }

  if (paymentEur == null || paymentEur <= 0) {
    console.warn(
      '%s paymentadd-no-amount doc_id=%s payload-amount=%s — skip update DB',
      LOG_PREFIX,
      documentId,
      JSON.stringify(paymentAmountRaw ?? null),
    );
    return;
  }

  // Cumul + status auto via helper P4.x.2 sujet C.
  const previousPaid = Number(prospect.acompte_amount_eur ?? 0);
  const cumulativePaid = previousPaid + paymentEur;
  const devisTotalTtc = prospect.sellsy_devis_total_ttc
    ? Number(prospect.sellsy_devis_total_ttc)
    : null;
  const computedStatus = calculatePaymentStatus(cumulativePaid, devisTotalTtc);

  console.log(
    '%s paymentadd-computed-status prospect=%s previous=%d new=%d cumul=%d ttc=%s -> status=%s',
    LOG_PREFIX,
    prospect.id,
    previousPaid,
    paymentEur,
    cumulativePaid,
    devisTotalTtc ?? 'null',
    computedStatus,
  );

  const now = new Date().toISOString();
  await supabase
    .from('prospects')
    .update({
      status: computedStatus,
      acompte_status: 'paid',
      acompte_paid_at: now,
      acompte_amount_eur: cumulativePaid,
      last_synced_sellsy_at: now,
      last_activity_at: now,
    })
    .eq('id', prospect.id);

  // P5.x.4 Phase C : sync Brevo (transition -> isAcomptePaid=true ou
  // isSigned=true selon computedStatus). L'automation "MDS Devis Emis"
  // s'arrete naturellement via unlinkListIds.
  try {
    const { syncBrevoLifecycle } = await import('@/lib/brevo/sync-lifecycle');
    await syncBrevoLifecycle(prospect.id);
  } catch (err) {
    console.warn(
      '%s brevo-sync-failed prospect=%s msg=%s',
      LOG_PREFIX,
      prospect.id,
      err instanceof Error ? err.message : String(err),
    );
  }

  // P5.x.7 : calcul auto commission affilie (idempotent).
  const { maybeRecordAffiliateCommission } =
    await import('@/lib/affiliates/maybe-record-commission');
  await maybeRecordAffiliateCommission(prospect.id);

  // P4.x.2 sujet H : nouveau template admin_paymentadd dedie (au lieu
  // de signature_finale qui parlait de "Devis signe" a tort pour un
  // paiement). Subject "Paiement reçu — {company} ({amount})".
  const company = pickFirst(prospect.company);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const tpl = renderAdminPaymentAddEmail({
    prospectUrl: `${baseUrl}/admin/prospects/${prospect.id}`,
    companyName: company?.name ?? '(société inconnue)',
    documentNumber:
      prospect.sellsy_devis_number ?? event.relatedobject?.number ?? `DOC-${documentId}`,
    amountEur: formatEur(paymentEur),
    cumulativeEur: formatEur(cumulativePaid),
    devisTotalTtcEur: devisTotalTtc != null ? formatEur(devisTotalTtc) : '—',
    newStatus: computedStatus,
    sellsyDocumentUrl:
      prospect.sellsy_devis_public_url ?? `https://go.sellsy.com/documents/${documentId}`,
  });
  await sendAdminNotification('admin_paymentadd', tpl);

  console.log(
    '%s paymentadd-success prospect=%s doc_id=%s type=%s payment=%d cumul=%d status=%s',
    LOG_PREFIX,
    prospect.id,
    documentId,
    documentType,
    paymentEur,
    cumulativePaid,
    computedStatus,
  );
}

/**
 * Event signature.completed — signature electronique completee. Memes
 * effets que docslog.step status=accepted (status=signe + Brevo SIGNED
 * + admin email + auto-creation facture si estimate). On reuse en
 * synthetisant un faux event docslog.step pour passer dans le meme code.
 */
async function handleSignatureCompleted(event: SellsyWebhookEvent): Promise<void> {
  // Le payload signature.* peut avoir relatedid + relatedtype directement,
  // ou les nicher dans relatedobject. On essaie les deux.
  const relatedid =
    event.relatedid ??
    (event.relatedobject?.id != null ? String(event.relatedobject.id) : undefined);
  const relatedtype =
    event.relatedtype ??
    ((event.relatedobject as { type?: string } | undefined)?.type as 'estimate' | undefined) ??
    'estimate'; // par defaut estimate (signature electronique = devis le plus souvent)

  if (!relatedid) {
    console.warn(
      '%s signature-completed-no-relatedid payload=%s',
      LOG_PREFIX,
      JSON.stringify(event).slice(0, 300),
    );
    return;
  }

  // Synthese : on fabrique un event docslog.step avec status=accepted
  // pour reutiliser handleDocslogStep (eviter la duplication).
  const synthetic: SellsyWebhookEvent = {
    ...event,
    eventType: 'docslog',
    event: 'step',
    relatedid,
    relatedtype,
    relatedobject: {
      ...(event.relatedobject ?? {}),
      status: 'accepted',
    },
  };
  console.log(
    '%s signature-completed-synthese-step relatedid=%s relatedtype=%s',
    LOG_PREFIX,
    relatedid,
    relatedtype,
  );
  await handleDocslogStep(synthetic);
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

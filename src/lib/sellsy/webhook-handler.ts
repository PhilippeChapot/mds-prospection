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
 *     ... champs additionnels selon eventType (docid, status, etc.)
 *   }
 *
 * On switch sur la combinaison `eventType.event` :
 *   - 'docslog.step'      : changement de statut document (signe / paye / etc.)
 *   - 'docslog.emailsent' : email envoye (log + skip)
 *   - autres              : log + skip
 *
 * Les noms de champs additionnels (docid vs document_id, step vs status)
 * ne sont pas confirmes par la doc V2 — on log le payload complet quand on
 * tombe dans un cas non geree pour identifier la shape exacte.
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
 * Shape Sellsy V2 webhook payload (quirk #22). Tous les champs en string
 * (Sellsy serialise les nombres en string dans les webhooks).
 */
export interface SellsyWebhookEvent {
  eventType?: string; // "docslog" / "client" / "prospect" / ...
  event?: string; // "step" / "created" / "updated" / "emailsent" / ...
  timestamp?: string;
  ownerid?: string;
  ownertype?: string;
  // Champs additionnels selon le type d'event (non documentes officiellement) :
  docid?: string | number;
  document_id?: string | number;
  doctype?: string;
  step?: string;
  status?: string;
  // Catch-all pour les events qu'on n'a pas encore observes.
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
      console.log('%s emailsent-skip key=%s docid=%s', LOG_PREFIX, key, extractDocId(event));
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
 * Event docslog.step : Sellsy a fait avancer un document (devis -> signe,
 * facture -> payee, etc.). Le payload contient :
 *   - docid (ou document_id) : l'id Sellsy du document
 *   - step (ou status) : le nouveau statut texte ("Signé", "Payé", "Accepté"...)
 *   - doctype : "estimate" | "invoice" | "proforma" (probable)
 *
 * On ne sait pas exactement quels termes Sellsy utilise pour "Signé" vs
 * "Payé". Strategie : on detecte sur la racine du mot, en lower-case +
 * accents stripped, pour matcher "signe", "accept", "paye", "paid".
 */
async function handleDocslogStep(event: SellsyWebhookEvent): Promise<void> {
  const docId = extractDocId(event);
  if (!docId) {
    console.error('%s step-no-doc-id payload=%s', LOG_PREFIX, JSON.stringify(event).slice(0, 300));
    return;
  }

  const stepNorm = normalize(String(event.step ?? event.status ?? ''));
  const isSigned = /signe|accept/i.test(stepNorm);
  const isPaid = /paye|paid/i.test(stepNorm);

  if (!isSigned && !isPaid) {
    console.log(
      '%s step-status-not-tracked doc_id=%s step=%s — log + skip',
      LOG_PREFIX,
      docId,
      stepNorm,
    );
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
      contact:contacts(brevo_contact_id),
      company:companies!inner(name)
      `,
    )
    .or(
      `sellsy_devis_id.eq.${docIdStr},sellsy_proforma_id.eq.${docIdStr},sellsy_invoice_id.eq.${docIdStr}`,
    )
    .maybeSingle();

  if (!prospect) {
    console.warn('%s no-prospect-match doc_id=%s', LOG_PREFIX, docIdStr);
    return;
  }

  const now = new Date().toISOString();
  const update: ProspectUpdate = {
    status: 'signe',
    last_synced_sellsy_at: now,
    last_activity_at: now,
    ...(isSigned ? { signed_at: now } : {}),
    ...(isPaid ? { acompte_status: 'paid' as const, acompte_paid_at: now } : {}),
  };
  await supabase.from('prospects').update(update).eq('id', prospect.id);

  // Brevo : ajouter a BREVO_LIST_ID_SIGNED si on a un brevo_contact_id (
  // uniquement sur signature, pas sur paiement seul — pour ne pas duplicate
  // les ajouts list).
  if (isSigned) {
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

  // Email admin notif signature (peu importe signed vs paid, le template
  // signature_finale couvre les deux).
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
    '%s success prospect=%s doc_id=%s step=%s signed=%s paid=%s',
    LOG_PREFIX,
    prospect.id,
    docIdStr,
    stepNorm,
    isSigned,
    isPaid,
  );
}

/**
 * Sellsy V2 envoie le doc id sous des noms variables selon le webhook
 * (docid, document_id, id...). On essaie tous les candidats connus.
 */
function extractDocId(event: SellsyWebhookEvent): string | null {
  const candidates = [event.docid, event.document_id, (event as { id?: unknown }).id];
  for (const c of candidates) {
    if (c != null && c !== '') return String(c);
  }
  return null;
}

/**
 * Normalise une chaine pour comparaison fuzzy : lowercase + strip
 * diacritics. "Signé" -> "signe", "Payé" -> "paye".
 */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

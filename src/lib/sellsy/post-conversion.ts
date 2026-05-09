/**
 * Workflow post-conversion : declenche apres convertSignupToProspect.
 *
 *   1. syncProspectToSellsy : find/create company + individual + opportunity
 *      (P4 M2, deja en place, fait en background non-bloquant).
 *   2. createSellsyDocument : emission devis/facture selon payment_path
 *      (P4 M3 — ce module).
 *   3. sendDevisConciergeEmail : email Resend au prospect avec le lien
 *      Sellsy du devis (parcours devis_sepa uniquement en M3).
 *      Pour acompte_stripe / proforma / facture_integrale : doc cree mais
 *      email reporte en P4 M4 (avec le lien Stripe Checkout).
 *
 * Mode test/sandbox : assertSyncAllowed verifie en debut. is_test=true
 * skip toutes les etapes 2 et 3 (la sync M2 a deja skippe).
 *
 * Logs structures (prefix [sellsy/post-conversion]).
 */

import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderDevisConciergeTemplate } from '@/lib/resend/templates/devis-concierge';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { renderAdminSignupConvertiEmail } from '@/lib/resend/templates/admin-notifications';
import { upsertContactBrevo, type ProspectPole } from '@/lib/brevo/lifecycle';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  createSellsyDocument,
  endpointForDocumentType,
  paymentPathToDocumentType,
  type SellsyDocumentType,
} from './create-document';
import { syncProspectToSellsy } from './sync-prospect';
import { sellsyFetch } from './client';

const LOG_PREFIX = '[sellsy/post-conversion]';

/**
 * Orchestre les 3 etapes post-conversion.
 * Best-effort : chaque step est isolee. Si l'emission devis echoue, la
 * sync prospect reste OK (deja persistee). L'admin peut retry via le
 * bouton "Resynchroniser" sur la fiche prospect.
 *
 * Le caller (convertSignupToProspect) appelle en background :
 *   void runPostConversion(prospectId).catch(err => { ... });
 */
export async function runPostConversion(prospectId: string): Promise<void> {
  console.log('%s start prospect_id=%s', LOG_PREFIX, prospectId);

  // Detection Cas A (signup avec pack PRS) vs Cas B (manifestation d'interet
  // sans pack). En Cas B on skip toute la partie Sellsy/devis pour eviter
  // un "step2_payload Cas A introuvable" qui faisait planter la suite.
  const isCasB = await detectCasB(prospectId);

  if (isCasB) {
    console.log(
      '%s case-b-detected prospect_id=%s — skip Sellsy doc, jump to Brevo + admin email',
      LOG_PREFIX,
      prospectId,
    );
  } else {
    // Cas A : flow Sellsy + devis. Wrappee en try/catch pour que les
    // etapes Brevo + admin email restent tjs appelees a la fin (M6.1).
    try {
      await runCaseAFlow(prospectId);
    } catch (err) {
      console.error(
        '%s case-a-flow-failed prospect_id=%s msg=%s — Brevo + admin email seront tentes quand meme',
        LOG_PREFIX,
        prospectId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // M6.1 : TOUJOURS appeler Brevo + admin email (best-effort), peu importe
  // le succes / echec / skip de la partie Sellsy. allSettled isole les 2
  // promesses : si Brevo fail, l'admin email part quand meme et inversement.
  await Promise.allSettled([
    triggerBrevoLifecycle(prospectId),
    notifyAdminSignupConverted(prospectId, isCasB),
  ]);

  console.log(
    '%s done prospect_id=%s mode=%s',
    LOG_PREFIX,
    prospectId,
    isCasB ? 'case_b' : 'case_a',
  );
}

/**
 * Detecte Cas B (manifestation d'interet sans pack PRS) par double-check :
 *   - prospect.payment_path IS NULL  -> Cas B confirme (Cas A en a tjs un)
 *   - sinon, lookup signup.step2_payload.mode -> 'caseA' explicite uniquement
 *
 * False positives moins graves que false negatives : preferer "skip Sellsy"
 * que "tenter Sellsy et planter".
 */
async function detectCasB(prospectId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select('payment_path, pack_code')
    .eq('id', prospectId)
    .maybeSingle();
  if (!prospect) return true; // pas de prospect = on skip pour ne pas crasher
  if (!prospect.payment_path && !prospect.pack_code) return true;
  if (!prospect.payment_path) {
    // Cas borderline : pack_code set mais payment_path null. On verifie le
    // signup pour decider — si mode='caseA' on tente quand meme.
    const { data: signup } = await supabase
      .from('public_signup_attempts')
      .select('step2_payload')
      .eq('converted_to_prospect_id', prospectId)
      .maybeSingle();
    const draft = (signup?.step2_payload as { mode?: string } | null) ?? null;
    return draft?.mode !== 'caseA';
  }
  return false;
}

/**
 * Flow Cas A : sync Sellsy + emission document + email concierge.
 * Sort des helpers Brevo/admin pour qu'ils restent appeles a la fin de
 * runPostConversion meme si cette fonction throw.
 */
async function runCaseAFlow(prospectId: string): Promise<void> {
  // P4.x.1 Bug F : guard idempotence early-return avant tout traitement
  // (sync Sellsy + creation document). Sans ca, 2 invocations concurrentes
  // de runPostConversion (re-invocation Server Action Next 16) creent 2
  // devis Sellsy a 170ms d'intervalle. Le check "existingDocId" plus bas
  // ne suffit pas car les 2 invocations passent le check avant que l'une
  // ait fini. Le lock atomique est libere en fin de fonction (succes ou
  // echec) — TTL 5min cote DB en garde-fou.
  const lockAcquired = await acquireEmitLock(prospectId);
  if (!lockAcquired) {
    console.log(
      '%s emit-lock-already-held prospect_id=%s — invocation concurrente, skip',
      LOG_PREFIX,
      prospectId,
    );
    return;
  }

  try {
    await runCaseAFlowLocked(prospectId);
  } finally {
    await releaseEmitLock(prospectId);
  }
}

/**
 * Tente d'acquerir le verrou d'emission devis pour un prospect.
 * Retourne true si on a le lock, false sinon (deja pris par une autre
 * invocation en cours, ou crash recent < 5min). INSERT atomique via
 * ON CONFLICT DO NOTHING (Supabase upsert ignoreDuplicates).
 */
async function acquireEmitLock(prospectId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  // 1. Cleanup les locks expires (TTL > 5min) — best-effort, sans bloquer.
  await supabase.from('sellsy_emit_locks').delete().lt('expires_at', new Date().toISOString());

  // 2. Tentative d'insertion. Si conflict (PK violation 23505), echec silencieux
  //    via la 2e branche.
  const { error } = await supabase.from('sellsy_emit_locks').insert({ prospect_id: prospectId });
  if (!error) {
    console.log('%s emit-lock-acquired prospect=%s', LOG_PREFIX, prospectId);
    return true;
  }
  if (error.code === '23505') {
    console.log(
      '%s emit-lock-conflict prospect=%s — invocation concurrente',
      LOG_PREFIX,
      prospectId,
    );
    return false;
  }
  // Erreur autre que conflict : log mais on laisse passer (best-effort,
  // le check existingDocId plus bas reste un garde-fou).
  console.warn(
    '%s emit-lock-acquire-error prospect=%s code=%s msg=%s',
    LOG_PREFIX,
    prospectId,
    error.code,
    error.message,
  );
  return true;
}

async function releaseEmitLock(prospectId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from('sellsy_emit_locks').delete().eq('prospect_id', prospectId);
  if (error) {
    // P4.x.2 sujet H' : log explicite + ne throw pas pour ne pas masquer
    // l'erreur originale du try (qui aurait deja loggue son contexte).
    console.error(
      '%s emit-lock-release-failed prospect=%s code=%s msg=%s — sera nettoye par le cron TTL',
      LOG_PREFIX,
      prospectId,
      error.code,
      error.message,
    );
    return;
  }
  console.log('%s emit-lock-released prospect=%s', LOG_PREFIX, prospectId);
}

async function runCaseAFlowLocked(prospectId: string): Promise<void> {
  // 1. Sync Sellsy (find-or-create company + individual + opportunity).
  //    Cette etape gere elle-meme is_test + retry + UPDATE error en DB.
  await syncProspectToSellsy(prospectId);

  // 2. Lookup post-sync : recupere prospect + status (peut avoir des
  //    erreurs de la sync), payment_path, sellsy_devis_id deja set, etc.
  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select(
      'id, is_test, payment_path, sellsy_devis_id, sellsy_proforma_id, sellsy_invoice_id, last_sync_error_provider, company:companies!inner(sellsy_id), contact:contacts(email, first_name, language)',
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (!prospect) {
    console.error('%s prospect-not-found prospect_id=%s', LOG_PREFIX, prospectId);
    return;
  }

  if (prospect.is_test) {
    console.log('%s skipped is_test=true prospect_id=%s', LOG_PREFIX, prospectId);
    return;
  }

  if (prospect.last_sync_error_provider === 'sellsy') {
    console.log(
      '%s skip-emit-after-sync-error prospect_id=%s — sync prospect a echoue, on emet pas de devis',
      LOG_PREFIX,
      prospectId,
    );
    return;
  }

  // 3. Determiner le type de document selon payment_path.
  const docType = paymentPathToDocumentType(prospect.payment_path);

  // Si un document du meme type existe deja, on ne reemet pas (idempotent).
  const existingDocId =
    docType === 'estimate'
      ? prospect.sellsy_devis_id
      : docType === 'proforma'
        ? prospect.sellsy_proforma_id
        : prospect.sellsy_invoice_id;
  if (existingDocId) {
    console.log(
      '%s document-exists prospect_id=%s type=%s doc_id=%s — skip',
      LOG_PREFIX,
      prospectId,
      docType,
      existingDocId,
    );
    return;
  }

  // 4. Creer le document Sellsy.
  let documentId: number;
  try {
    const result = await createSellsyDocument(prospectId, docType);
    documentId = result.documentId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      '%s create-document-failed prospect_id=%s type=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      docType,
      msg,
    );
    await supabase
      .from('prospects')
      .update({
        last_sync_error_message: msg.slice(0, 1000),
        last_sync_error_provider: 'sellsy',
        last_sync_error_at: new Date().toISOString(),
      })
      .eq('id', prospectId);
    return;
  }

  // 5. Stocker le document_id + number + public_url + emitted_at dans les
  //    colonnes dediees selon le type. Permet a l'UI fiche prospect d'afficher
  //    "Devis emis le {date}" + numero cliquable sans devoir refetch Sellsy.
  const docIdStr = String(documentId);
  const docDetailsForPersist = await fetchSellsyDocumentDetails(documentId, docType);
  const emittedAt = new Date().toISOString();
  // public_link est utilisable seulement si public_link_enabled=true (cf.
  // quirk #17). Sinon on persiste pdf_link comme fallback partageable.
  const linkToPersist =
    (docDetailsForPersist.publicLinkEnabled && docDetailsForPersist.publicUrl) ||
    docDetailsForPersist.pdfLink ||
    null;

  // P4.x.2 sujet C : persiste le total TTC pour permettre le calcul
  // paid_pct cote webhooks (Stripe + Sellsy paymentadd) sans re-fetcher
  // Sellsy a chaque event.
  const totalTtcToPersist =
    docDetailsForPersist.totalTtc > 0 ? docDetailsForPersist.totalTtc : null;

  const updateValues =
    docType === 'estimate'
      ? {
          sellsy_devis_id: docIdStr,
          sellsy_devis_number: docDetailsForPersist.number,
          sellsy_devis_public_url: linkToPersist,
          sellsy_devis_emitted_at: emittedAt,
          sellsy_devis_total_ttc: totalTtcToPersist,
        }
      : docType === 'proforma'
        ? {
            sellsy_proforma_id: docIdStr,
            sellsy_proforma_number: docDetailsForPersist.number,
            sellsy_proforma_public_url: linkToPersist,
            sellsy_proforma_emitted_at: emittedAt,
          }
        : {
            sellsy_invoice_id: docIdStr,
            sellsy_invoice_number: docDetailsForPersist.number,
            sellsy_invoice_public_url: linkToPersist,
            sellsy_invoice_emitted_at: emittedAt,
          };

  await supabase.from('prospects').update(updateValues).eq('id', prospectId);

  // P4.x.2 sujet E : transition status lead -> devis_envoye apres
  // emission devis reussie. Ne regresse pas si deja plus avance
  // (ex: devis re-emis apres signature, ne revient pas de signe a
  // devis_envoye). On utilise une condition "status='lead'" cote update
  // pour eviter d'ecraser des status plus avances.
  if (docType === 'estimate') {
    await supabase
      .from('prospects')
      .update({ status: 'devis_envoye', last_activity_at: new Date().toISOString() })
      .eq('id', prospectId)
      .eq('status', 'lead');
  }

  // 6. Envoyer l'email de notification au prospect (selon payment_path).
  const contact = pickFirst(prospect.contact);
  if (!contact?.email) {
    console.error('%s no-contact-email prospect_id=%s', LOG_PREFIX, prospectId);
    return;
  }
  const locale: 'fr' | 'en' = contact.language === 'EN' ? 'en' : 'fr';

  if (prospect.payment_path === 'devis_sepa') {
    await sendDevisConciergeEmail({
      prospectId,
      documentId,
      docType,
      docDetails: docDetailsForPersist,
      contactEmail: contact.email,
      contactFirstName: contact.first_name ?? '',
      locale,
    });
  } else if (prospect.payment_path === 'devis_acompte_stripe') {
    // P4.x.2 sujet D : auto-creation Payment Link 30% + email prospect.
    if (totalTtcToPersist != null) {
      await triggerAcomptePaymentLink({
        prospectId,
        documentId,
        docDetails: docDetailsForPersist,
        totalTtc: totalTtcToPersist,
        contactEmail: contact.email,
        contactFirstName: contact.first_name ?? '',
        locale,
      });
    } else {
      console.warn(
        '%s acompte-skip-no-ttc prospect_id=%s — sellsy n a pas renvoye amounts.total, retry necessaire',
        LOG_PREFIX,
        prospectId,
      );
    }
  } else {
    console.log(
      '%s email-skipped-payment-path prospect_id=%s payment_path=%s (proforma_acompte / facture_integrale : pas d auto-email)',
      LOG_PREFIX,
      prospectId,
      prospect.payment_path,
    );
  }

  console.log(
    '%s case-a-flow-success prospect_id=%s document_id=%d',
    LOG_PREFIX,
    prospectId,
    documentId,
  );
}

// ---------------------------------------------------------------------------
// triggerAcomptePaymentLink (P4.x.2 sujet D)
// ---------------------------------------------------------------------------

interface TriggerAcompteInput {
  prospectId: string;
  documentId: number;
  docDetails: SellsyDocumentDetails;
  totalTtc: number;
  contactEmail: string;
  contactFirstName: string;
  locale: 'fr' | 'en';
}

async function triggerAcomptePaymentLink(input: TriggerAcompteInput): Promise<void> {
  try {
    // 1. Calcul acompte 30% TTC, arrondi 2 decimales.
    const acompteTtc = Math.round(input.totalTtc * 0.3 * 100) / 100;
    const resteDu = Math.round((input.totalTtc - acompteTtc) * 100) / 100;

    // 2. Cree le Payment Link Stripe (skip si is_test).
    const { createAcomptePaymentLink } = await import('@/lib/stripe/payment-link');
    const result = await createAcomptePaymentLink({
      prospectId: input.prospectId,
      amountEurTtc: acompteTtc,
      devisNumber: input.docDetails.number,
    });
    if ('skipped' in result) {
      console.log(
        '%s acompte-payment-link-skipped prospect=%s reason=%s',
        LOG_PREFIX,
        input.prospectId,
        result.skipped,
      );
      return;
    }

    // 3. Email prospect avec lien Sellsy + Payment Link Stripe.
    const { renderProspectAcomptePaymentLinkTemplate } =
      await import('@/lib/resend/templates/prospect-acompte-paymentlink');
    const sellsyDocUrl =
      (input.docDetails.publicLinkEnabled && input.docDetails.publicUrl) ||
      input.docDetails.pdfLink ||
      `https://www.sellsy.com/document/${input.documentId}`;
    const tpl = renderProspectAcomptePaymentLinkTemplate(input.locale, {
      firstName: input.contactFirstName,
      companyName: '', // sera relu via contact si besoin futur
      documentNumber: input.docDetails.number ?? `D-${input.documentId}`,
      sellsyDocumentUrl: sellsyDocUrl,
      paymentLinkUrl: result.url,
      acompteAmount: formatEur(acompteTtc),
      resteDuAmount: formatEur(resteDu),
    });

    await sendTransactionalEmailViaResend({
      to: input.contactEmail,
      toName: input.contactFirstName,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [
        { name: 'category', value: 'prospect_acompte_paymentlink' },
        { name: 'locale', value: input.locale },
      ],
    });

    console.log(
      '%s acompte-payment-link-sent prospect=%s acompte=%d reste=%d to=%s',
      LOG_PREFIX,
      input.prospectId,
      acompteTtc,
      resteDu,
      input.contactEmail,
    );
  } catch (err) {
    console.error(
      '%s acompte-payment-link-failed prospect=%s msg=%s',
      LOG_PREFIX,
      input.prospectId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ---------------------------------------------------------------------------
// triggerBrevoLifecycle (P4 M6) — upsert contact + assign listes
// ---------------------------------------------------------------------------

async function triggerBrevoLifecycle(prospectId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  try {
    const { data, error } = await supabase
      .from('prospects')
      .select(
        `
        id, is_test,
        company:companies!inner(name, category, pole:poles(code)),
        contact:contacts(email, first_name, last_name, language, marketing_consent)
        `,
      )
      .eq('id', prospectId)
      .maybeSingle();
    if (error || !data) {
      console.warn('%s brevo-lookup-failed prospect=%s', LOG_PREFIX, prospectId);
      return;
    }
    const company = pickFirst(data.company);
    const contact = pickFirst(data.contact);
    if (!contact?.email) {
      console.warn('%s brevo-no-email prospect=%s', LOG_PREFIX, prospectId);
      return;
    }
    const pole = pickFirst(company?.pole)?.code as ProspectPole | undefined;
    await upsertContactBrevo({
      is_test: data.is_test,
      email: contact.email,
      firstName: contact.first_name,
      lastName: contact.last_name,
      companyName: company?.name ?? null,
      pole: pole ?? 'INCONNU',
      category: company?.category ?? 'standard',
      language: (contact.language ?? 'FR') as 'FR' | 'EN',
      marketingConsent: Boolean(contact.marketing_consent),
    });
    await supabase
      .from('prospects')
      .update({ last_synced_brevo_at: new Date().toISOString() })
      .eq('id', prospectId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s brevo-failed prospect=%s msg=%s', LOG_PREFIX, prospectId, msg);
    await supabase
      .from('prospects')
      .update({
        last_sync_error_message: msg.slice(0, 1000),
        last_sync_error_provider: 'brevo',
        last_sync_error_at: new Date().toISOString(),
      })
      .eq('id', prospectId);
  }
}

// ---------------------------------------------------------------------------
// notifyAdminSignupConverted (P4 M6) — email admin best-effort
// ---------------------------------------------------------------------------

async function notifyAdminSignupConverted(prospectId: string, isCasB: boolean): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('prospects')
      .select(
        `
        id, pack_code, payment_path, estimated_amount, selected_addon_ids,
        company:companies!inner(name, category, pole:poles(code)),
        contact:contacts(email, first_name, last_name, language)
        `,
      )
      .eq('id', prospectId)
      .maybeSingle();
    if (error || !data) return;

    const company = pickFirst(data.company);
    const contact = pickFirst(data.contact);
    if (!contact?.email) return;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const prospectUrl = `${baseUrl}/admin/prospects/${prospectId}`;
    const amountFmt = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(Number(data.estimated_amount ?? 0));

    // Recupere step2_payload pour decoder le presence_type cote Cas B
    // (manifestation d'interet : visiteur, sponsor, partenaire, autre).
    let presenceType: string | null = null;
    if (isCasB) {
      const { data: signup } = await supabase
        .from('public_signup_attempts')
        .select('step2_payload')
        .eq('converted_to_prospect_id', prospectId)
        .maybeSingle();
      const draft = (signup?.step2_payload as { presenceType?: string } | null) ?? null;
      presenceType = draft?.presenceType ?? null;
    }

    const tpl = renderAdminSignupConvertiEmail({
      prospectUrl,
      companyName: company?.name ?? '(société inconnue)',
      contactEmail: contact.email,
      contactName: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || '(sans nom)',
      pole: pickFirst(company?.pole)?.code ?? 'INCONNU',
      category: company?.category ?? 'standard',
      packCode: data.pack_code,
      paymentPath: data.payment_path,
      estimatedAmountEur: amountFmt,
      language: (contact.language ?? 'FR') as 'FR' | 'EN',
      addonCount: (data.selected_addon_ids ?? []).length,
      isCasB,
      presenceType,
    });
    await sendAdminNotification('admin_signup_converti', tpl);
  } catch (err) {
    console.error(
      '%s admin-notify-failed prospect=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ---------------------------------------------------------------------------
// sendDevisConciergeEmail
// ---------------------------------------------------------------------------

interface SendDevisInput {
  prospectId: string;
  documentId: number;
  docType: SellsyDocumentType;
  /** Reutilise le fetch deja effectue par runPostConversion pour la persistence
   *  (number, public_url, etc.). Evite un GET /estimates/{id} en double. */
  docDetails: SellsyDocumentDetails;
  contactEmail: string;
  contactFirstName: string;
  locale: 'fr' | 'en';
}

async function sendDevisConciergeEmail(input: SendDevisInput): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const docDetails = input.docDetails;

  // Debug : on a vu un bug ou totalHt ressortait a 0 EUR. Logger toute la
  // shape utile pour le template avant l'appel render.
  console.log(
    '[debug-email] document for template: %s',
    JSON.stringify(
      {
        id: input.documentId,
        number: docDetails.number,
        total_excl_tax: docDetails.totalHt,
        public_url: docDetails.publicUrl,
        public_link_enabled: docDetails.publicLinkEnabled,
        pdf_link: docDetails.pdfLink,
      },
      null,
      2,
    ),
  );

  // URL Sellsy : on prefere public_link MAIS uniquement s'il est active
  // (public_link_enabled=true). Sinon Sellsy renvoie une page "Document
  // inaccessible". Fallback sur pdf_link (toujours accessible via son
  // token sign). Quirk #17.
  const sellsyDocumentUrl =
    (docDetails.publicLinkEnabled && docDetails.publicUrl) ||
    docDetails.pdfLink ||
    `https://www.sellsy.com/document/${input.documentId}`;

  const { data: prospect } = await supabase
    .from('prospects')
    .select('company:companies!inner(name)')
    .eq('id', input.prospectId)
    .maybeSingle();
  const companyName = pickFirst(prospect?.company)?.name ?? '';

  const totalHt = formatEur(docDetails.totalHt);

  const template = renderDevisConciergeTemplate(input.locale, {
    firstName: input.contactFirstName,
    companyName,
    documentNumber: docDetails.number ?? `DEV-${input.documentId}`,
    totalHt,
    sellsyDocumentUrl,
  });

  await sendTransactionalEmailViaResend({
    to: input.contactEmail,
    toName: input.contactFirstName,
    subject: template.subject,
    html: template.html,
    text: template.text,
    tags: [
      { name: 'category', value: 'devis_concierge' },
      { name: 'locale', value: input.locale },
    ],
  });

  console.log(
    '%s email-sent prospect_id=%s to=%s document_id=%d',
    LOG_PREFIX,
    input.prospectId,
    input.contactEmail,
    input.documentId,
  );
}

interface SellsyDocumentDetails {
  number: string | null;
  totalHt: number;
  /** Total TTC du devis (P4.x.2 sujet C : utilise pour calculer paid_pct
   *  et la transition vers paye_integral). 0 si Sellsy ne renvoie pas
   *  amounts.total. */
  totalTtc: number;
  publicUrl: string | null;
  publicLinkEnabled: boolean;
  pdfLink: string | null;
}

async function fetchSellsyDocumentDetails(
  documentId: number,
  docType: SellsyDocumentType,
): Promise<SellsyDocumentDetails> {
  // Quirk #8 : pas de /documents/{id} en V2, il faut switcher l'endpoint
  // selon le type (cf. endpointForDocumentType).
  const endpoint = `${endpointForDocumentType(docType)}/${documentId}`;

  // Sellsy V2 expose les amounts sous `total_excl_tax` (pas `tax_excluded_amount`,
  // qui etait V1) et le lien public sous `public_link` (URL complete, pas un
  // public_link_id a recomposer). Cf. spec OpenAPI components.schemas.Estimate.
  type SellsyDoc = {
    number?: string;
    amounts?: { total_excl_tax?: string; total?: string };
    public_link?: string | null;
    public_link_enabled?: boolean;
    pdf_link?: string;
  };

  try {
    const res = await sellsyFetch<{ data?: SellsyDoc } & SellsyDoc>(endpoint);
    // extractSellsyId-style flexible parsing
    const d: SellsyDoc = (res as { data?: SellsyDoc }).data ?? (res as SellsyDoc);

    const totalHt = d.amounts?.total_excl_tax ? Number(d.amounts.total_excl_tax) : 0;
    const totalTtc = d.amounts?.total ? Number(d.amounts.total) : 0;
    const publicUrl = d.public_link ?? null;
    const publicLinkEnabled = Boolean(d.public_link_enabled);
    const pdfLink = d.pdf_link ?? null;

    return { number: d.number ?? null, totalHt, totalTtc, publicUrl, publicLinkEnabled, pdfLink };
  } catch (err) {
    console.warn(
      '%s fetch-document-details-failed document_id=%d msg=%s — fallback minimal',
      LOG_PREFIX,
      documentId,
      err instanceof Error ? err.message : String(err),
    );
    return {
      number: null,
      totalHt: 0,
      totalTtc: 0,
      publicUrl: null,
      publicLinkEnabled: false,
      pdfLink: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatEur(amount: number): string {
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' €'
  );
}

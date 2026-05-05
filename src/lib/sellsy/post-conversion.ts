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

  // 5. Stocker le document_id dans la colonne dediee selon le type.
  const docIdStr = String(documentId);
  const updateValues =
    docType === 'estimate'
      ? { sellsy_devis_id: docIdStr }
      : docType === 'proforma'
        ? { sellsy_proforma_id: docIdStr }
        : { sellsy_invoice_id: docIdStr };

  await supabase.from('prospects').update(updateValues).eq('id', prospectId);

  // 6. Envoyer l'email de notification au prospect (parcours devis_sepa
  //    uniquement en M3 — les autres parcours auront leur email avec
  //    Stripe Checkout en M4).
  if (prospect.payment_path !== 'devis_sepa') {
    console.log(
      '%s email-skipped-non-sepa prospect_id=%s payment_path=%s (P4 M4)',
      LOG_PREFIX,
      prospectId,
      prospect.payment_path,
    );
    return;
  }

  const contact = pickFirst(prospect.contact);
  if (!contact?.email) {
    console.error('%s no-contact-email prospect_id=%s', LOG_PREFIX, prospectId);
    return;
  }

  await sendDevisConciergeEmail({
    prospectId,
    documentId,
    docType,
    contactEmail: contact.email,
    contactFirstName: contact.first_name ?? '',
    locale: contact.language === 'EN' ? 'en' : 'fr',
  });

  console.log('%s success prospect_id=%s document_id=%d', LOG_PREFIX, prospectId, documentId);
}

// ---------------------------------------------------------------------------
// sendDevisConciergeEmail
// ---------------------------------------------------------------------------

interface SendDevisInput {
  prospectId: string;
  documentId: number;
  docType: SellsyDocumentType;
  contactEmail: string;
  contactFirstName: string;
  locale: 'fr' | 'en';
}

async function sendDevisConciergeEmail(input: SendDevisInput): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // Recupere le numero du document Sellsy + la company name pour le subject.
  const docDetails = await fetchSellsyDocumentDetails(input.documentId, input.docType);

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
    const publicUrl = d.public_link ?? null;
    const publicLinkEnabled = Boolean(d.public_link_enabled);
    const pdfLink = d.pdf_link ?? null;

    return { number: d.number ?? null, totalHt, publicUrl, publicLinkEnabled, pdfLink };
  } catch (err) {
    console.warn(
      '%s fetch-document-details-failed document_id=%d msg=%s — fallback minimal',
      LOG_PREFIX,
      documentId,
      err instanceof Error ? err.message : String(err),
    );
    return { number: null, totalHt: 0, publicUrl: null, publicLinkEnabled: false, pdfLink: null };
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

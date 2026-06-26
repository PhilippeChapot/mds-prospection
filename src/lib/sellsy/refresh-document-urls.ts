/**
 * P5.x.SellsyInvoiceCreationFixes (Fix 3) — re-fetch des URLs publiques des
 * documents Sellsy déjà émis pour un prospect (devis / proforma / facture).
 *
 * Sert au bouton « Resynchroniser » de la fiche prospect : avant ce fix, la
 * resync ne touchait QUE company/individual/opportunity (sync-prospect.ts) et
 * ne rafraîchissait jamais les liens des documents. Du coup, une facture
 * passée de brouillon → finalisée gardait son ancien lien cassé en DB.
 *
 * Pour chaque document présent (id non nul), on GET le document Sellsy et on
 * ré-extrait l'URL publique stable via extractSellsyPublicUrl (cf. la shape
 * objet { enabled, url } vs pdf_link cassé). Best-effort : un GET qui échoue
 * (doc supprimé côté Sellsy, perm OAuth, etc.) est loggé puis ignoré, les
 * autres documents sont quand même rafraîchis.
 */

import { sellsyFetch } from './client';
import { extractSellsyPublicUrl, type SellsyDocLinkFields } from './public-url';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[sellsy/refresh-urls]';

interface DocKind {
  idCol: 'sellsy_devis_id' | 'sellsy_proforma_id' | 'sellsy_invoice_id';
  urlCol: 'sellsy_devis_public_url' | 'sellsy_proforma_public_url' | 'sellsy_invoice_public_url';
  numCol: 'sellsy_devis_number' | 'sellsy_proforma_number' | 'sellsy_invoice_number';
  endpoint: '/estimates' | '/proformas' | '/invoices';
}

const DOC_KINDS: readonly DocKind[] = [
  {
    idCol: 'sellsy_devis_id',
    urlCol: 'sellsy_devis_public_url',
    numCol: 'sellsy_devis_number',
    endpoint: '/estimates',
  },
  {
    idCol: 'sellsy_proforma_id',
    urlCol: 'sellsy_proforma_public_url',
    numCol: 'sellsy_proforma_number',
    endpoint: '/proformas',
  },
  {
    idCol: 'sellsy_invoice_id',
    urlCol: 'sellsy_invoice_public_url',
    numCol: 'sellsy_invoice_number',
    endpoint: '/invoices',
  },
];

export interface RefreshDocumentUrlsResult {
  /** Endpoints des documents dont l'URL a été (re)posée. */
  refreshed: string[];
}

/**
 * Re-fetch + re-persiste les URLs publiques des documents Sellsy d'un prospect.
 * Ne throw jamais : best-effort par document.
 */
export async function refreshSellsyDocumentUrls(
  prospectId: string,
): Promise<RefreshDocumentUrlsResult> {
  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select('sellsy_devis_id, sellsy_proforma_id, sellsy_invoice_id')
    .eq('id', prospectId)
    .maybeSingle();

  if (!prospect) return { refreshed: [] };

  const patch: Record<string, unknown> = {};
  const refreshed: string[] = [];

  for (const kind of DOC_KINDS) {
    const docId = (prospect as Record<string, unknown>)[kind.idCol] as string | null;
    if (!docId) continue;
    try {
      const res = await sellsyFetch<{ data?: SellsyDocLinkFields } & SellsyDocLinkFields>(
        `${kind.endpoint}/${docId}`,
      );
      const d = ((res as { data?: SellsyDocLinkFields }).data ?? res) as SellsyDocLinkFields & {
        number?: string;
      };
      const url = extractSellsyPublicUrl(d);
      if (url) {
        patch[kind.urlCol] = url;
        refreshed.push(kind.endpoint);
      }
      if (d.number) patch[kind.numCol] = d.number;
    } catch (err) {
      console.warn(
        '%s refresh-failed prospect=%s doc=%s endpoint=%s msg=%s',
        LOG_PREFIX,
        prospectId,
        docId,
        kind.endpoint,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (Object.keys(patch).length > 0) {
    await supabase
      .from('prospects')
      .update(patch as never)
      .eq('id', prospectId);
    console.log(
      '%s refreshed prospect=%s endpoints=%s',
      LOG_PREFIX,
      prospectId,
      refreshed.join(',') || '-',
    );
  }

  return { refreshed };
}

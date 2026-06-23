/**
 * P5.x.SellsyDocumentsFlow — lectures document_requests côté admin.
 *
 * Pas de 'use server' : fonctions appelées depuis des Server Components.
 * La table document_requests n'est pas encore dans database.types.ts
 * (générée après `pnpm db:push` 0103) → service client casté en any.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface DocumentRequestRow {
  id: string;
  document_type: 'proforma' | 'invoice';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requires_purchase_order: boolean;
  purchase_order_number: string | null;
  requested_billing_contact_id: string | null;
  requested_billing_email: string | null;
  requested_note: string | null;
  requested_at: string;
  decided_at: string | null;
  decided_note: string | null;
  sellsy_document_id: string | null;
  contact: { first_name: string | null; last_name: string | null; email: string } | null;
}

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

const SELECT = `
  id, document_type, status, requires_purchase_order, purchase_order_number,
  requested_billing_contact_id, requested_billing_email, requested_note,
  requested_at, decided_at, decided_note, sellsy_document_id,
  contact:contacts!contact_id(first_name, last_name, email)
`;

function normalize(rows: unknown[]): DocumentRequestRow[] {
  return (rows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const c = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    return {
      id: row.id as string,
      document_type: row.document_type as DocumentRequestRow['document_type'],
      status: row.status as DocumentRequestRow['status'],
      requires_purchase_order: Boolean(row.requires_purchase_order),
      purchase_order_number: (row.purchase_order_number as string | null) ?? null,
      requested_billing_contact_id: (row.requested_billing_contact_id as string | null) ?? null,
      requested_billing_email: (row.requested_billing_email as string | null) ?? null,
      requested_note: (row.requested_note as string | null) ?? null,
      requested_at: row.requested_at as string,
      decided_at: (row.decided_at as string | null) ?? null,
      decided_note: (row.decided_note as string | null) ?? null,
      sellsy_document_id: (row.sellsy_document_id as string | null) ?? null,
      contact: c
        ? {
            first_name: (c as Record<string, unknown>).first_name as string | null,
            last_name: (c as Record<string, unknown>).last_name as string | null,
            email: (c as Record<string, unknown>).email as string,
          }
        : null,
    };
  });
}

/** Toutes les demandes d'un prospect (récentes d'abord). */
export async function listDocumentRequestsForProspect(
  prospectId: string,
): Promise<DocumentRequestRow[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await asAnyDb(supabase)
    .from('document_requests')
    .select(SELECT)
    .eq('prospect_id', prospectId)
    .order('requested_at', { ascending: false });
  if (error) {
    console.warn(
      '[document-requests/queries] list-failed prospect=%s msg=%s',
      prospectId,
      error.message,
    );
    return [];
  }
  return normalize((data ?? []) as unknown[]);
}

/** Demandes en attente uniquement (pour le bloc "demandes à traiter"). */
export async function listPendingDocumentRequests(
  prospectId: string,
): Promise<DocumentRequestRow[]> {
  return (await listDocumentRequestsForProspect(prospectId)).filter((r) => r.status === 'pending');
}

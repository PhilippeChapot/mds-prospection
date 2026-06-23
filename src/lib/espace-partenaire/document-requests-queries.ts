/**
 * P5.x.SellsyDocumentsFlow — lecture des demandes de documents du partenaire
 * connecté. Pas de 'use server' (appelé depuis un Server Component).
 *
 * Table document_requests pas encore dans database.types.ts (générée après
 * `pnpm db:push` 0103) → service client casté en any.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface MyDocumentRequest {
  id: string;
  document_type: 'proforma' | 'invoice';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  purchase_order_number: string | null;
  requested_at: string;
  decided_note: string | null;
}

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

/**
 * Demandes du contact connecté (toutes statuts confondus, récentes d'abord).
 * Retourne [] si la session n'est pas liée à un contact.
 */
export async function listMyDocumentRequests(locale: 'fr' | 'en'): Promise<MyDocumentRequest[]> {
  const { contactId } = await requireContactSession(locale);
  if (!contactId) return [];

  const supabase = getSupabaseServiceClient();
  const { data, error } = await asAnyDb(supabase)
    .from('document_requests')
    .select('id, document_type, status, purchase_order_number, requested_at, decided_note')
    .eq('contact_id', contactId)
    .order('requested_at', { ascending: false });

  if (error) {
    console.warn('[espace-partenaire/document-requests-queries] list-failed msg=%s', error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      document_type: row.document_type as MyDocumentRequest['document_type'],
      status: row.status as MyDocumentRequest['status'],
      purchase_order_number: (row.purchase_order_number as string | null) ?? null,
      requested_at: row.requested_at as string,
      decided_note: (row.decided_note as string | null) ?? null,
    };
  });
}

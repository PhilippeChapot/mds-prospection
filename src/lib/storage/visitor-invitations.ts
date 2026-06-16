/**
 * P15.4 — helpers Storage pour les lettres d'invitation (bucket privé).
 * Server-only (client service-role). Download = signed URL générée à la volée.
 */
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const BUCKET = 'visitor-invitations';

/** Upload le PDF et renvoie le storage path. */
export async function uploadInvitationPdf(
  visitorId: string,
  locale: 'fr' | 'en',
  pdf: Buffer,
): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const storagePath = `${visitorId}/invitation-${locale}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return storagePath;
}

/** Signed URL de download (défaut 1h ; emails utilisent 30j). */
export async function getInvitationPdfSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new Error(`createSignedUrl failed: ${error?.message}`);
  return data.signedUrl;
}

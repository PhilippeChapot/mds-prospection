/**
 * P15.2 — helpers "ce contact est-il déjà X ?".
 *
 * Server-only (utilise le client service-role). Importés par les server
 * actions de conversion ET par les server components des fiches (pour
 * masquer/désactiver les options déjà existantes).
 *
 * NB : un contact peut avoir PLUSIEURS prospects (multi-saison) → on renvoie
 * juste "au moins un".
 */
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export async function existsAsProspect(contactId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('prospects')
    .select('id')
    .eq('primary_contact_id', contactId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function existsAsVisitor(contactId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('visitors')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();
  return Boolean(data);
}

export async function existsAsSpeaker(contactId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('speakers')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();
  return Boolean(data);
}

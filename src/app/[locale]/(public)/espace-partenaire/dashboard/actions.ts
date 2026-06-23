'use server';

/**
 * Server actions Espace Partenaire V1.1 (P5.x.10) + V1.2 (P5.x.12).
 *
 * Auth via cookie session (verifie par loadDashboardData) plutot que
 * via admin role. L'partenaire peut uniquement editer son propre contact
 * + uploader le logo de sa company (filtre via prospect.primary_contact_id
 * et prospect.company_id du cookie).
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { verifySessionToken, ESPACE_EXPOSANT_SESSION_COOKIE } from '@/lib/espace-partenaire/jwt';
import {
  resolvePartnerWriteContext,
  canPlaceOrder,
  type PartnerWriteContext,
} from '@/lib/espace-partenaire/resolve-prospect';

// ---------------------------------------------------------------------------
// Helper d'auth session espace partenaire (factor commun aux actions).
//
// P11.x.PartnerContactWriteActions : résolution unifiée { contactId,
// prospectId, role } gérant les sessions kind='contact' (grant) et legacy
// kind='prospect'. Remplace l'ancien resolveSessionProspect qui lisait
// claims.prospectId comme un prospect_id (cassé pour les contacts
// secondaires arrivés via partner_access_grants).
// ---------------------------------------------------------------------------

async function resolvePartnerSession(): Promise<PartnerWriteContext | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) return null;
  try {
    const claims = await verifySessionToken(sessionCookie.value);
    const supabase = getSupabaseServiceClient() as unknown as SupabaseClient;
    return resolvePartnerWriteContext(supabase, {
      kind: claims.kind,
      prospectId: claims.prospectId,
    });
  } catch {
    return null;
  }
}

const updateContactSchema = z.object({
  phone: z.string().trim().max(40).nullable(),
  role: z.string().trim().max(120).nullable(),
});

export interface UpdateContactResult {
  ok: boolean;
  error?: string;
}

/**
 * P11.x.PartnerContactWriteActions : modifie phone + role du contact
 * CONNECTÉ lui-même (session.contactId), et non plus le primary_contact du
 * prospect. Décision Phil : chaque contact édite ses propres coordonnées.
 * Email + first_name + last_name restent immuables (identité de login).
 */
export async function updatePartenaireContactAction(input: {
  phone: string | null;
  role: string | null;
}): Promise<UpdateContactResult> {
  const session = await resolvePartnerSession();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!session.contactId) {
    return { ok: false, error: 'no_contact' };
  }

  const parsed = updateContactSchema.safeParse({
    phone: input.phone ?? null,
    role: input.role ?? null,
  });
  if (!parsed.success) {
    return { ok: false, error: 'invalid_payload' };
  }

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('contacts')
    .update({
      phone: parsed.data.phone || null,
      role: parsed.data.role || null,
    })
    .eq('id', session.contactId);

  if (error) {
    console.error(
      '[espace-partenaire/updateContact] update-failed contact=%s msg=%s',
      session.contactId,
      error.message,
    );
    return { ok: false, error: error.message };
  }

  // Audit : self-update contact (user_id null = ce n'est pas un admin).
  await supabase.from('audit_log').insert({
    user_id: null,
    action: 'update',
    entity_type: 'contact',
    entity_id: session.contactId,
    after: {
      kind: 'contact_self_update',
      actor_contact_id: session.contactId,
      updated_fields: ['phone', 'role'],
    } as never,
  });

  revalidatePath('/fr/espace-partenaire/dashboard');
  revalidatePath('/en/espace-partenaire/dashboard');
  return { ok: true };
}

// ===========================================================================
// P5.x.16-bis — updateCompanySlugAction
// ===========================================================================

/**
 * Forme acceptee : 3 a 32 chars, minuscules / chiffres / tirets simples,
 * pas de tiret en debut/fin ni de double tiret. Le regex ci-dessous
 * impose `<token>(-<token>)*` ou token = `[a-z0-9]+`, ce qui couvre
 * l'ensemble des regles d'un coup.
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const updateSlugSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'too_short')
    .max(32, 'too_long')
    .regex(SLUG_PATTERN, 'invalid_format'),
});

export type UpdateSlugResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      error:
        | 'unauthorized'
        | 'invalid_session'
        | 'forbidden'
        | 'too_short'
        | 'too_long'
        | 'invalid_format'
        | 'slug_taken'
        | 'db_error';
      message?: string;
    };

/**
 * Permet a l'partenaire de personnaliser le slug de sa company pour
 * obtenir une URL d'invitation lisible (mediadays.solutions/i/<slug>).
 *
 * Securite :
 *   - Auth via cookie session espace-partenaire
 *   - Lookup prospect.company_id depuis la DB (pas depuis l'input) pour
 *     empecher la modif du slug d'une autre company
 *   - Validation Zod + check unicite avant l'UPDATE pour distinguer une
 *     vraie collision d'une erreur DB anonyme
 */
export async function updateCompanySlugAction(input: { slug: string }): Promise<UpdateSlugResult> {
  const session = await resolvePartnerSession();
  if (!session) return { ok: false, error: 'unauthorized' };
  // P11.x : viewer = lecture seule, ne peut pas rebrander la company.
  if (!canPlaceOrder(session.role)) return { ok: false, error: 'forbidden' };
  if (!session.prospectId) return { ok: false, error: 'forbidden' };

  const parsed = updateSlugSchema.safeParse({ slug: input.slug });
  if (!parsed.success) {
    // On remonte le premier issue.message si reconnu, sinon invalid_format.
    const firstIssue = parsed.error.issues[0];
    const code = firstIssue?.message;
    const knownCodes = new Set(['too_short', 'too_long', 'invalid_format']);
    return {
      ok: false,
      error: (knownCodes.has(code ?? '') ? code : 'invalid_format') as
        | 'too_short'
        | 'too_long'
        | 'invalid_format',
    };
  }

  const supabase = getSupabaseServiceClient();

  const { data: prospect } = await supabase
    .from('prospects')
    .select('company_id')
    .eq('id', session.prospectId)
    .maybeSingle();
  if (!prospect?.company_id) return { ok: false, error: 'forbidden' };
  const companyId = prospect.company_id;

  // Check unicite : un autre partenaire a deja pose ce slug ?
  const newSlug = parsed.data.slug;
  const { data: clash } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', newSlug)
    .neq('id', companyId)
    .maybeSingle();
  if (clash) {
    return { ok: false, error: 'slug_taken' };
  }

  const { error: updateErr } = await supabase
    .from('companies')
    .update({ slug: newSlug })
    .eq('id', companyId);

  if (updateErr) {
    console.error(
      '[espace-partenaire/updateSlug] db-error company=%s msg=%s',
      companyId,
      updateErr.message,
    );
    // Le code unique index pourrait encore lever une 23505 si race condition
    // entre le check et l'UPDATE -> on traite comme slug_taken.
    if (updateErr.code === '23505') {
      return { ok: false, error: 'slug_taken' };
    }
    return { ok: false, error: 'db_error', message: updateErr.message };
  }

  revalidatePath('/fr/espace-partenaire/dashboard');
  revalidatePath('/en/espace-partenaire/dashboard');
  return { ok: true, slug: newSlug };
}

// ===========================================================================
// P5.x.12 — uploadCompanyLogoAction
// ===========================================================================

const ACCEPTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const RASTER_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * P5.x.12.quater + quinquies — Auto-trim des marges sur les logos
 * raster (PNG/JPG/WebP). Permet au badge social de rendre le logo en
 * plein cadre sans subir les marges vides du fichier source.
 *
 * P5.x.12.quinquies fix : on enleve le param `background: white+alpha=0`
 * (ambigu — cible les pixels a la fois blancs ET transparents, qui
 * n'existent quasi jamais). A la place : auto-detection via le pixel
 * top-left + threshold permissif (50) pour gerer ombres / anti-aliasing.
 * Si trim n'a rien retire (dimensions identiques), on garde le buffer
 * original pour eviter le cout du re-encoding.
 *
 * SVG : skip car vectoriel (pas de pixels a trimmer, export design
 * generalement deja propre).
 *
 * Best-effort : si sharp throw, fallback original.
 */
async function trimLogoIfRaster(file: File): Promise<Buffer> {
  const original = Buffer.from(await file.arrayBuffer());
  if (!RASTER_LOGO_TYPES.has(file.type)) {
    return original;
  }
  try {
    // Import dynamique : sharp lourd (binaire natif), charge seulement
    // pour les raster.
    const sharp = (await import('sharp')).default;
    const beforeMeta = await sharp(original).metadata();
    const beforeW = beforeMeta.width ?? 0;
    const beforeH = beforeMeta.height ?? 0;

    const trimmed = await sharp(original)
      .trim({
        // P5.x.12.quinquies : pas de param `background` -> sharp utilise
        // automatiquement le pixel top-left comme reference. Combine avec
        // un threshold large pour absorber ombres degradees / anti-aliasing.
        threshold: 50,
      })
      .toBuffer();

    const afterMeta = await sharp(trimmed).metadata();
    const afterW = afterMeta.width ?? 0;
    const afterH = afterMeta.height ?? 0;
    const noChange = afterW === beforeW && afterH === beforeH;

    if (noChange) {
      // Re-encoding sans crop = pure perte (souvent +20-30% de poids).
      // On garde le buffer original.
      console.log(
        '[espace-partenaire/uploadLogo] trim no-op file=%s dims=%dx%d — keeping original',
        file.name,
        beforeW,
        beforeH,
      );
      return original;
    }

    console.log(
      '[espace-partenaire/uploadLogo] trim file=%s beforeDims=%dx%d afterDims=%dx%d croppedPx=%dx%d beforeSize=%dB afterSize=%dB',
      file.name,
      beforeW,
      beforeH,
      afterW,
      afterH,
      beforeW - afterW,
      beforeH - afterH,
      original.length,
      trimmed.length,
    );
    return trimmed;
  } catch (err) {
    console.warn(
      '[espace-partenaire/uploadLogo] trim-failed file=%s msg=%s — keeping original',
      file.name,
      err instanceof Error ? err.message : String(err),
    );
    return original;
  }
}
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 Mo

export type UploadLogoResult =
  | { ok: true; logoUrl: string }
  | {
      ok: false;
      error:
        | 'unauthorized'
        | 'invalid_session'
        | 'forbidden'
        | 'no_file'
        | 'file_too_large'
        | 'invalid_type'
        | 'storage_error'
        | 'db_error';
      message?: string;
    };

/**
 * Upload du logo de la company rattachee au prospect courant.
 *
 * Securite :
 *   - Auth via cookie session espace-partenaire (resolveSessionProspect)
 *   - Lookup prospect.company_id depuis la DB (pas depuis le formData)
 *     pour empecher un attacker de poster un company_id arbitraire
 *   - Validation taille + type cote server (re-check, ne fait pas
 *     confiance au check client)
 *   - Upload via service-role (bypass RLS), nom de fichier scope par
 *     company_id pour eviter les collisions cross-companies
 */
export async function uploadCompanyLogoAction(formData: FormData): Promise<UploadLogoResult> {
  const session = await resolvePartnerSession();
  if (!session) return { ok: false, error: 'unauthorized' };
  // P11.x : viewer = lecture seule, ne peut pas changer le logo.
  if (!canPlaceOrder(session.role)) return { ok: false, error: 'forbidden' };
  if (!session.prospectId) return { ok: false, error: 'forbidden' };

  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'no_file' };
  }
  if (file.size > MAX_LOGO_SIZE) {
    return { ok: false, error: 'file_too_large' };
  }
  if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
    return { ok: false, error: 'invalid_type' };
  }

  const supabase = getSupabaseServiceClient();

  // Resolve company_id depuis le prospect (pas depuis formData → safe).
  const { data: prospect } = await supabase
    .from('prospects')
    .select('company_id')
    .eq('id', session.prospectId)
    .maybeSingle();
  if (!prospect?.company_id) return { ok: false, error: 'forbidden' };
  const companyId = prospect.company_id;

  // Filename scope par company_id + timestamp pour eviter collisions et
  // permettre une versioning trivial (les anciens logos restent en storage
  // mais ne sont plus references — possible cleanup cron V1.3).
  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().slice(0, 5);
  const fileName = `${companyId}/${Date.now()}.${ext}`;

  // P5.x.12.quater : auto-trim sur les formats raster avant upload.
  // Supprime les marges transparentes / quasi-blanches pour que le
  // logo affiche en plein cadre dans le badge social (zone 1000x280)
  // sans etre reduit par des bordures vides du fichier source.
  // SVG = vectoriel, on n'y touche pas (export tipiquement deja propre).
  const trimmedBuffer = await trimLogoIfRaster(file);

  const { error: uploadErr } = await supabase.storage
    .from('company-logos')
    .upload(fileName, trimmedBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    console.error(
      '[espace-partenaire/uploadLogo] storage-error company=%s msg=%s',
      companyId,
      uploadErr.message,
    );
    return { ok: false, error: 'storage_error', message: uploadErr.message };
  }

  const { data: publicUrl } = supabase.storage.from('company-logos').getPublicUrl(fileName);
  const logoUrl = publicUrl.publicUrl;

  const { error: dbErr } = await supabase
    .from('companies')
    .update({
      logo_url: logoUrl,
      logo_source: 'manual_upload',
      logo_uploaded_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  if (dbErr) {
    console.error(
      '[espace-partenaire/uploadLogo] db-error company=%s msg=%s',
      companyId,
      dbErr.message,
    );
    return { ok: false, error: 'db_error', message: dbErr.message };
  }

  revalidatePath('/fr/espace-partenaire/dashboard');
  revalidatePath('/en/espace-partenaire/dashboard');
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true, logoUrl };
}

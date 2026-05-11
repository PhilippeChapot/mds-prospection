'use server';

/**
 * Server actions Espace Exposant V1.1 (P5.x.10) + V1.2 (P5.x.12).
 *
 * Auth via cookie session (verifie par loadDashboardData) plutot que
 * via admin role. L'exposant peut uniquement editer son propre contact
 * + uploader le logo de sa company (filtre via prospect.primary_contact_id
 * et prospect.company_id du cookie).
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { verifySessionToken, ESPACE_EXPOSANT_SESSION_COOKIE } from '@/lib/espace-exposant/jwt';

// ---------------------------------------------------------------------------
// Helper d'auth session espace exposant (factor commun aux actions).
// ---------------------------------------------------------------------------

async function resolveSessionProspect(): Promise<{ prospectId: string } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) return null;
  try {
    const claims = await verifySessionToken(sessionCookie.value);
    return { prospectId: claims.prospectId };
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
 * Modifie phone + role du contact rattache au prospect courant.
 * Email + first_name + last_name restent immuables (identite stable —
 * pour les changer, contacter Phil).
 */
export async function updateExposantContactAction(input: {
  phone: string | null;
  role: string | null;
}): Promise<UpdateContactResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ESPACE_EXPOSANT_SESSION_COOKIE);
  if (!sessionCookie?.value) {
    return { ok: false, error: 'unauthorized' };
  }

  let prospectId: string;
  try {
    const claims = await verifySessionToken(sessionCookie.value);
    prospectId = claims.prospectId;
  } catch {
    return { ok: false, error: 'invalid_session' };
  }

  const parsed = updateContactSchema.safeParse({
    phone: input.phone ?? null,
    role: input.role ?? null,
  });
  if (!parsed.success) {
    return { ok: false, error: 'invalid_payload' };
  }

  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select('primary_contact_id')
    .eq('id', prospectId)
    .maybeSingle();

  if (!prospect?.primary_contact_id) {
    return { ok: false, error: 'no_contact' };
  }

  const { error } = await supabase
    .from('contacts')
    .update({
      phone: parsed.data.phone || null,
      role: parsed.data.role || null,
    })
    .eq('id', prospect.primary_contact_id);

  if (error) {
    console.error(
      '[espace-exposant/updateContact] update-failed prospect=%s msg=%s',
      prospectId,
      error.message,
    );
    return { ok: false, error: error.message };
  }

  revalidatePath('/fr/espace-exposant/dashboard');
  revalidatePath('/en/espace-exposant/dashboard');
  return { ok: true };
}

// ===========================================================================
// P5.x.12 — uploadCompanyLogoAction
// ===========================================================================

const ACCEPTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const RASTER_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * P5.x.12.quater — Auto-trim des bordures transparentes / quasi-blanches
 * sur les logos raster (PNG/JPG/WebP). Permet au badge social de rendre
 * le logo en plein cadre sans subir les marges vides du fichier source.
 *
 * Best-effort : si sharp.trim() throw (ex: image opaque sans bordures
 * detectables, format corrompu), on retourne le buffer original.
 *
 * SVG : skip car vectoriel (pas de pixels a trimmer, et l'export d'un
 * outil de design est generalement deja sans marges).
 */
async function trimLogoIfRaster(file: File): Promise<Buffer> {
  const original = Buffer.from(await file.arrayBuffer());
  if (!RASTER_LOGO_TYPES.has(file.type)) {
    return original;
  }
  try {
    // Import dynamique : sharp est lourd (binaire natif), on ne le
    // charge que sur les formats raster.
    const sharp = (await import('sharp')).default;
    const trimmed = await sharp(original)
      .trim({
        // Trim sur le blanc pur ET le transparent (alpha=0). Sharp
        // calcule le bounding box des pixels qui s'eloignent de cette
        // couleur de reference au-dela de `threshold`.
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        threshold: 10,
      })
      .toBuffer();
    console.log(
      '[espace-exposant/uploadLogo] trim file=%s original=%dB trimmed=%dB saved=%d%%',
      file.name,
      original.length,
      trimmed.length,
      Math.round(((original.length - trimmed.length) / Math.max(original.length, 1)) * 100),
    );
    return trimmed;
  } catch (err) {
    console.warn(
      '[espace-exposant/uploadLogo] trim-failed file=%s msg=%s — keeping original',
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
 *   - Auth via cookie session espace-exposant (resolveSessionProspect)
 *   - Lookup prospect.company_id depuis la DB (pas depuis le formData)
 *     pour empecher un attacker de poster un company_id arbitraire
 *   - Validation taille + type cote server (re-check, ne fait pas
 *     confiance au check client)
 *   - Upload via service-role (bypass RLS), nom de fichier scope par
 *     company_id pour eviter les collisions cross-companies
 */
export async function uploadCompanyLogoAction(formData: FormData): Promise<UploadLogoResult> {
  const session = await resolveSessionProspect();
  if (!session) return { ok: false, error: 'unauthorized' };

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
      '[espace-exposant/uploadLogo] storage-error company=%s msg=%s',
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
      '[espace-exposant/uploadLogo] db-error company=%s msg=%s',
      companyId,
      dbErr.message,
    );
    return { ok: false, error: 'db_error', message: dbErr.message };
  }

  revalidatePath('/fr/espace-exposant/dashboard');
  revalidatePath('/en/espace-exposant/dashboard');
  revalidatePath(`/admin/companies/${companyId}`);
  return { ok: true, logoUrl };
}

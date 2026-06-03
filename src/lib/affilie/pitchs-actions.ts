'use server';

/**
 * P7.x.AffiliePitchsAndChat — server action signed URLs DOCX argumentaire.
 *
 * Le bucket public-assets est public mais on passe quand meme par
 * createSignedUrl (TTL 1h) pour garder une option future de bucket prive.
 * RBAC : seul un affilie connecte peut recuperer les URLs.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { requireAffilieSession } from './session';

interface PitchDownload {
  key: 'fr_tu' | 'fr_vous' | 'en';
  label: string;
  description: string;
  filename: string;
  signedUrl: string;
}

const BUCKET = 'public-assets';

interface FileSpec {
  key: PitchDownload['key'];
  storage: string;
  label_fr: string;
  label_en: string;
  description_fr: string;
  description_en: string;
  filename: string;
}

const ALL_FILES: FileSpec[] = [
  {
    key: 'fr_tu',
    storage: 'affilie-pitchs/argumentaire-affilie-mds2026-tu.docx',
    label_fr: 'Argumentaire affilié — tutoiement',
    label_en: 'Affiliate pitch — informal FR (tutoiement)',
    description_fr: 'Version FR avec tutoiement, pour prospects familiers / startup.',
    description_en: 'French version with informal address (for startup / familiar prospects).',
    filename: 'Argumentaire_Affilie_MDS2026.docx',
  },
  {
    key: 'fr_vous',
    storage: 'affilie-pitchs/argumentaire-affilie-mds2026-vous.docx',
    label_fr: 'Argumentaire affilié — vouvoiement',
    label_en: 'Affiliate pitch — formal FR (vouvoiement)',
    description_fr: 'Version FR avec vouvoiement, pour prospects corporate.',
    description_en: 'French version with formal address (for corporate prospects).',
    filename: 'Argumentaire_Affilie_MDS2026_vouvoiement.docx',
  },
  {
    key: 'en',
    storage: 'affilie-pitchs/affiliate-pitch-mds2026-en.docx',
    label_fr: 'Affiliate pitch (anglais)',
    label_en: 'Affiliate pitch (English)',
    description_fr: 'Version anglaise, pour les partenaires internationaux.',
    description_en: 'English version, for international partners.',
    filename: 'Affiliate_Pitch_MDS2026_EN.docx',
  },
];

export async function getAffiliePitchsDownloadsAction(
  locale: 'fr' | 'en' = 'fr',
): Promise<PitchDownload[]> {
  await requireAffilieSession(locale);

  const supabase = getSupabaseServiceClient();
  const out: PitchDownload[] = [];

  for (const f of ALL_FILES) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage, 3600);
    if (error) {
      console.error('[affilie/pitchs] signedUrl error', f.key, error.message);
      continue;
    }
    out.push({
      key: f.key,
      label: locale === 'en' ? f.label_en : f.label_fr,
      description: locale === 'en' ? f.description_en : f.description_fr,
      filename: f.filename,
      signedUrl: data.signedUrl,
    });
  }

  return out;
}

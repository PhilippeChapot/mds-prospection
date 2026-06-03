/**
 * P7.x.AffiliePitchsAndChat — upload one-shot des 3 DOCX argumentaire
 * affilie dans Supabase Storage bucket `brand-public/affilie-pitchs/`.
 *
 * Idempotent : upsert=true. Relancer ne duplique pas.
 *
 * Usage : pnpm tsx scripts/upload-affilie-pitchs.ts
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = 'public-assets';
const FILES = [
  {
    local: 'scripts/data/argumentaire-affilie-mds2026-tu.docx',
    storage: 'affilie-pitchs/argumentaire-affilie-mds2026-tu.docx',
    label: 'Argumentaire FR (tutoiement)',
  },
  {
    local: 'scripts/data/argumentaire-affilie-mds2026-vous.docx',
    storage: 'affilie-pitchs/argumentaire-affilie-mds2026-vous.docx',
    label: 'Argumentaire FR (vouvoiement)',
  },
  {
    local: 'scripts/data/affiliate-pitch-mds2026-en.docx',
    storage: 'affilie-pitchs/affiliate-pitch-mds2026-en.docx',
    label: 'Affiliate pitch EN',
  },
];

async function main() {
  for (const f of FILES) {
    const buffer = readFileSync(path.join(projectRoot, f.local));
    const { error } = await sb.storage.from(BUCKET).upload(f.storage, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });
    if (error) {
      console.error(`✗ ${f.label}: ${error.message}`);
      process.exit(1);
    }
    console.log(`✓ ${f.label} -> ${BUCKET}/${f.storage} (${buffer.byteLength} bytes)`);
  }
  console.log('\n3 DOCX uploaded successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

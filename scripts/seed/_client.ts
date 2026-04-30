/**
 * Supabase admin client for seed scripts.
 * Uses the service_role key — bypasses RLS.
 * NEVER import this from src/ (server or client) — only from scripts/.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// scripts run from project root; .env.local sits at the root.
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..', '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local',
  );
}

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const SEASON_CODE = 'MDS_2026';

export async function getActiveSeasonId(): Promise<string> {
  const { data, error } = await admin.from('seasons').select('id').eq('code', SEASON_CODE).single();
  if (error || !data) {
    throw new Error(`Season ${SEASON_CODE} not found — run 01_season.ts first.`);
  }
  return data.id;
}

export const PROJECT_ROOT = projectRoot;

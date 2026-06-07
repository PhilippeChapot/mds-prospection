/**
 * P5.x.PhoneEnrichmentDisplay — script enrichment phones depuis ConnectOnAir.
 *
 * Pour la prospection terrain : remplit companies.phone + contacts.phone_mobile
 * (et fixe contacts.phone si vide) en source ConnectOnAir cache local.
 *
 * Phase 0 audit (2026-06-07) : le fichier Master MDS2026-Reference-Maitre
 * contient la TAXONOMIE des poles/secteurs, PAS de telephones — donc V1
 * = ConnectOnAir only. Si Phil veut Apollo en fallback V2, on etend.
 *
 * Sources V1 (priorise) :
 *   1. ConnectOnAir directory (col phone) → companies.phone si NULL.
 *   2. ConnectOnAir contacts (cols phone + mobile) → contacts.phone +
 *      contacts.phone_mobile si NULL.
 *
 * Matching :
 *   - Company → CoA directory : via name normalise
 *     (UPPER+UNACCENT, doctrine [[feedback_normalize_name_for_matching]]).
 *   - Contact → CoA contacts : via email normalise (LOWER+TRIM).
 *
 * Regles strictes :
 *   - JAMAIS ecraser un phone existant (WHERE phone IS NULL only).
 *   - Normaliser au format E.164 via parsePhone helper.
 *   - Si CoA fournit un phone non parsable → skip (laisser NULL).
 *   - Tag la source : companies.phone_source = 'connectonair'.
 *
 * Modes :
 *   - --dry-run : affiche stats sans UPDATE.
 *   - (no flag) : applique les UPDATEs.
 *   - --batch N : taille des batches (default 200).
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameJs } from '../src/lib/external-events/normalize-query';
import { normalizePhoneE164 } from '../src/lib/utils/phone-format';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis dans .env.local');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchIdx = args.indexOf('--batch');
const batchSize = batchIdx >= 0 ? Number(args[batchIdx + 1]) : 200;

type CompanyToEnrich = { id: string; name: string };
type ContactToEnrich = { id: string; email: string };

interface Stats {
  companies: { scanned: number; matched: number; updated: number; skipped: number };
  contacts: {
    scanned: number;
    matchedPhone: number;
    matchedMobile: number;
    updated: number;
    skipped: number;
  };
}

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — aucun UPDATE DB' : '⚠️  LIVE RUN — UPDATE DB');
  console.log(`📦 batch size = ${batchSize}\n`);
  const stats: Stats = {
    companies: { scanned: 0, matched: 0, updated: 0, skipped: 0 },
    contacts: { scanned: 0, matchedPhone: 0, matchedMobile: 0, updated: 0, skipped: 0 },
  };

  // ─── 1. Companies ───
  console.log('→ Phase 1/2 : enrichissement companies.phone via CoA directory…');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = supabase as any;
  let offset = 0;
  for (;;) {
    const { data: page, error } = await supa
      .from('companies')
      .select('id, name')
      .is('phone', null)
      .range(offset, offset + batchSize - 1);
    if (error) {
      console.error(`✗ companies select offset=${offset} : ${error.message}`);
      break;
    }
    const rows = (page ?? []) as CompanyToEnrich[];
    if (rows.length === 0) break;
    stats.companies.scanned += rows.length;

    for (const c of rows) {
      const nameNorm = normalizeNameJs(c.name);
      if (!nameNorm) {
        stats.companies.skipped++;
        continue;
      }
      // Lookup CoA strict.
      const { data: coaRows } = await supa
        .from('connectonair_directory')
        .select('phone')
        .eq('normalized_name', nameNorm)
        .not('phone', 'is', null)
        .limit(1);
      const coaPhone = coaRows?.[0]?.phone ?? null;
      if (!coaPhone) {
        stats.companies.skipped++;
        continue;
      }
      const e164 = normalizePhoneE164(coaPhone);
      if (!e164) {
        stats.companies.skipped++;
        continue;
      }
      stats.companies.matched++;
      if (dryRun) continue;
      const { error: updErr } = await supa
        .from('companies')
        .update({ phone: e164, phone_source: 'connectonair' })
        .eq('id', c.id)
        .is('phone', null); // defense : ne pas ecraser race condition
      if (updErr) {
        console.warn(`✗ update company ${c.id} : ${updErr.message}`);
      } else {
        stats.companies.updated++;
      }
    }
    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  console.log(
    `   scanned=${stats.companies.scanned} matched=${stats.companies.matched} updated=${stats.companies.updated} skipped=${stats.companies.skipped}\n`,
  );

  // ─── 2. Contacts ───
  console.log('→ Phase 2/2 : enrichissement contacts.phone_mobile (+ phone) via CoA contacts…');
  offset = 0;
  for (;;) {
    const { data: page, error } = await supa
      .from('contacts')
      .select('id, email, phone, phone_mobile')
      .is('phone_mobile', null)
      .not('email', 'is', null)
      .range(offset, offset + batchSize - 1);
    if (error) {
      console.error(`✗ contacts select offset=${offset} : ${error.message}`);
      break;
    }
    const rows = (page ?? []) as Array<{
      id: string;
      email: string;
      phone: string | null;
      phone_mobile: string | null;
    }>;
    if (rows.length === 0) break;
    stats.contacts.scanned += rows.length;

    for (const c of rows) {
      const emailNorm = c.email.trim().toLowerCase();
      if (!emailNorm || !emailNorm.includes('@')) {
        stats.contacts.skipped++;
        continue;
      }
      const { data: coaRows } = await supa
        .from('connectonair_directory_contacts')
        .select('phone, mobile')
        .eq('email_normalized', emailNorm)
        .limit(1);
      const coa = coaRows?.[0] as { phone: string | null; mobile: string | null } | undefined;
      if (!coa) {
        stats.contacts.skipped++;
        continue;
      }
      const e164Mobile = normalizePhoneE164(coa.mobile);
      const e164Phone = normalizePhoneE164(coa.phone);

      const updates: Record<string, unknown> = {};
      if (e164Mobile && !c.phone_mobile) {
        updates.phone_mobile = e164Mobile;
        updates.phone_mobile_source = 'connectonair';
        stats.contacts.matchedMobile++;
      }
      if (e164Phone && !c.phone) {
        updates.phone = e164Phone;
        stats.contacts.matchedPhone++;
      }
      if (Object.keys(updates).length === 0) {
        stats.contacts.skipped++;
        continue;
      }
      if (dryRun) continue;
      const { error: updErr } = await supa.from('contacts').update(updates).eq('id', c.id);
      if (updErr) {
        console.warn(`✗ update contact ${c.id} : ${updErr.message}`);
      } else {
        stats.contacts.updated++;
      }
    }
    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  console.log(
    `   scanned=${stats.contacts.scanned} matchedMobile=${stats.contacts.matchedMobile} matchedPhone=${stats.contacts.matchedPhone} updated=${stats.contacts.updated} skipped=${stats.contacts.skipped}\n`,
  );

  // ─── Audit log ───
  if (!dryRun) {
    await supa.from('audit_log').insert({
      // user_id null = system action (script)
      user_id: null,
      entity_type: 'companies',
      entity_id: null,
      action: 'update',
      after: {
        kind: 'phones_enriched',
        companies_updated: stats.companies.updated,
        contacts_updated: stats.contacts.updated,
        source: 'connectonair',
      },
    });
  }

  console.log('📈 Final stats :');
  console.log(JSON.stringify(stats, null, 2));
  console.log(
    dryRun ? '\n🔍 DRY RUN OK — relance sans --dry-run pour appliquer.' : '\n✅ ENRICHMENT OK.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

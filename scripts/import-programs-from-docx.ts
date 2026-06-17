/**
 * P16.x.ImportPrograms — import des 2 programmes DOCX (MDS + PRS) en
 * conférences + speakers, avec workflow de validation.
 *
 * Pré-requis : copier les 2 DOCX dans data/imports/ (gitignored) + migration
 * 0099 appliquée (`pnpm db:push`).
 *
 * Usage :
 *   pnpm tsx scripts/import-programs-from-docx.ts --dry-run
 *   pnpm tsx scripts/import-programs-from-docx.ts --apply
 *
 * Idempotent : conférence par (title_fr, program_track) ; contact par email
 * placeholder ; speaker par contact_id ; jonction par (conf, speaker).
 * À l'import : conférences & speakers en is_validated=false (à valider par Phil).
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import mammoth from 'mammoth';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/database.types';
import { parseProgram } from '../src/lib/admin/programs/parse-program';
import {
  ensureCompany,
  ensureContactForSpeaker,
  ensureSpeaker,
  ensureConference,
  attachImportedSpeaker,
} from '../src/lib/admin/programs/import-helpers';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SOURCES = [
  {
    track: 'mds_solutions',
    file: 'MDS2026-Programme-Conferences-Presentation.docx',
  },
  {
    track: 'prs_radio_audio',
    file: 'PRS2026-Programme-Conferences-Presentation.docx',
  },
] as const;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply || args.includes('--dry-run');

async function main() {
  const nowIso = new Date().toISOString();

  // 1. Parse les 2 DOCX.
  const parsed = [];
  for (const src of SOURCES) {
    const filePath = path.join(projectRoot, 'data', 'imports', src.file);
    const { value } = await mammoth.extractRawText({ path: filePath });
    const conferences = parseProgram(value);
    const speakerLines = conferences.reduce((n, c) => n + c.speakers.length, 0);
    const placeholders = conferences.reduce(
      (n, c) => n + c.speakers.filter((s) => s.kind === 'org').length,
      0,
    );
    parsed.push({ ...src, conferences, speakerLines, placeholders });
  }

  // 2. Rapport.
  console.log('\n=== DRY-RUN REPORT — import programmes ===');
  for (const p of parsed) {
    console.log(
      `\n[${p.track}] ${p.file}\n  conférences: ${p.conferences.length}\n  intervenants: ${p.speakerLines} (dont ${p.placeholders} org/placeholder, ${p.speakerLines - p.placeholders} nommés)`,
    );
    for (const c of p.conferences) {
      console.log(
        `   • ${c.title.slice(0, 60)} — pôles=[${c.poles.join(',')}] speakers=${c.speakers.length}`,
      );
    }
  }
  const totalConf = parsed.reduce((n, p) => n + p.conferences.length, 0);
  const totalSpk = parsed.reduce((n, p) => n + p.speakerLines, 0);
  const totalPh = parsed.reduce((n, p) => n + p.placeholders, 0);
  console.log(
    `\nTOTAL prévu : ${totalConf} conférences · ${totalSpk} intervenants (${totalPh} placeholders, ${totalSpk - totalPh} nommés)`,
  );

  if (dryRun) {
    console.log('\n(dry-run — aucune écriture. Relancer avec --apply pour importer.)\n');
    return;
  }

  // 3. Apply.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key)
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.');
  const supabase = createClient<Database>(url, key);

  let confCreated = 0;
  let spkCreated = 0;
  let attached = 0;

  for (const p of parsed) {
    const importedSource = `docx:${p.file}`;
    for (const conf of p.conferences) {
      const { conferenceId, created } = await ensureConference(supabase, conf, {
        programTrack: p.track,
        importedSource,
        nowIso,
      });
      if (created) {
        confCreated += 1;
        await supabase.from('audit_log').insert({
          user_id: null,
          action: 'create',
          entity_type: 'conferences',
          entity_id: conferenceId,
          after: { kind: 'conference_imported', track: p.track, title: conf.title },
        });
      }

      let order = 0;
      for (const sp of conf.speakers) {
        const { contactId } = await ensureContactForSpeaker(supabase, sp);
        const companyId = await ensureCompany(supabase, sp.org);
        const { speakerId, created: spkNew } = await ensureSpeaker(supabase, {
          contactId,
          companyId,
          programTrack: p.track,
          importedSource,
          nowIso,
        });
        if (spkNew) {
          spkCreated += 1;
          await supabase.from('audit_log').insert({
            user_id: null,
            action: 'create',
            entity_type: 'speakers',
            entity_id: speakerId,
            after: { kind: 'speaker_imported', track: p.track, name: sp.displayName },
          });
        }
        const { attached: did } = await attachImportedSpeaker(
          supabase,
          conferenceId,
          speakerId,
          order,
          sp.role,
        );
        if (did) attached += 1;
        order += 1;
      }
    }
  }

  console.log(
    `\n✅ APPLY terminé : ${confCreated} conférences créées · ${spkCreated} speakers créés · ${attached} rattachements.\n   (lignes déjà présentes ignorées — idempotent.)\n`,
  );
}

main().catch((err) => {
  console.error('[import-programs] ERREUR:', err);
  process.exit(1);
});

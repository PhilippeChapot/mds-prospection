import 'dotenv/config';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __filename = fileURLToPath(import.meta.url);
config({ path: path.join(path.dirname(__filename), '.env.local'), override: true });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Pull all companies and compute clusters in JS (PostgREST has no UNACCENT in select).
const { data, count } = await sb
  .from('companies')
  .select(
    'id, name, country, website, primary_domain, raw_address, city, postal_code, phone, linkedin_url, sellsy_id, external_event_tags',
    { count: 'exact' },
  );

function normalize(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

const groups = new Map();
for (const c of data) {
  const k = normalize(c.name);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
const dups = [...groups.entries()]
  .filter(([_, v]) => v.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

console.log(`Total companies: ${count}`);
console.log(`Unique normalized names: ${groups.size}`);
console.log(`Duplicate clusters: ${dups.length}`);
console.log(`Rows to merge: ${dups.reduce((s, [_, v]) => s + (v.length - 1), 0)}`);

console.log(`\nTop 20 clusters:`);
for (const [k, rows] of dups.slice(0, 20)) {
  const variants = rows.map((r) => `"${r.name}"`).join(' | ');
  console.log(`  ${k.padEnd(40)} (${rows.length}x) → ${variants}`);
}

// Country distribution
const countries = {};
for (const c of data) {
  const k = c.country ?? '(null)';
  countries[k] = (countries[k] ?? 0) + 1;
}
console.log(`\nCountry distribution (top 15):`);
for (const [k, v] of Object.entries(countries)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)) {
  console.log(`  ${k.padEnd(25)} ${v}`);
}

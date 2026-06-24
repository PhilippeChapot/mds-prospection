/**
 * P12.x.EmailIntegration — auto-link d'un email vers contact/company/prospect.
 *
 * Stratégie :
 *   1. contact par email exact (lower) → confidence 1.0 (contact_email_exact)
 *   2. sinon company par domaine (primary_domain OU alternate_domains) →
 *      confidence 0.7 (company_domain)
 *   3. prospects rattachés (company_id) → un lien par prospect.
 *
 * Les tables email_* ne sont pas dans les types générés (migration 0106) →
 * service client casté en any. Pas de 'use server' (helper).
 */

import { type SupabaseClient } from '@supabase/supabase-js';

interface LinkRow {
  email_id: string;
  prospect_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  confidence: number;
  link_method: 'contact_email_exact' | 'company_domain' | 'manual';
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const d = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return d || null;
}

/**
 * @param db        client Supabase (service role, casté any).
 * @param emailId   id de l'email à lier.
 * @param addresses adresses pertinentes (from inbound / to outbound).
 * @returns nombre de liens insérés.
 */
export async function autoLinkEmail(
  db: SupabaseClient,
  emailId: string,
  addresses: string[],
): Promise<number> {
  const uniq = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (uniq.length === 0) return 0;

  const links: LinkRow[] = [];
  const seenProspect = new Set<string>();
  const seenContactCompany = new Set<string>();

  for (const addr of uniq) {
    // 1. Contact exact.
    const { data: contact } = await db
      .from('contacts')
      .select('id, company_id')
      .ilike('email', addr)
      .maybeSingle();

    let companyId: string | null = null;
    let contactId: string | null = null;
    let confidence = 0;
    let method: LinkRow['link_method'] = 'company_domain';

    if (contact?.id) {
      contactId = contact.id as string;
      companyId = (contact.company_id as string | null) ?? null;
      confidence = 1.0;
      method = 'contact_email_exact';
    } else {
      // 2. Company par domaine.
      const domain = domainOf(addr);
      if (domain) {
        const { data: company } = await db
          .from('companies')
          .select('id')
          .or(`primary_domain.eq.${domain},alternate_domains.cs.{${domain}}`)
          .limit(1)
          .maybeSingle();
        if (company?.id) {
          companyId = company.id as string;
          confidence = 0.7;
          method = 'company_domain';
        }
      }
    }

    if (!contactId && !companyId) continue;

    // Lien contact/company (sans prospect) — dédup logique.
    const ccKey = `${contactId ?? ''}|${companyId ?? ''}`;
    if (!seenContactCompany.has(ccKey)) {
      seenContactCompany.add(ccKey);
      links.push({
        email_id: emailId,
        prospect_id: null,
        contact_id: contactId,
        company_id: companyId,
        confidence,
        link_method: method,
      });
    }

    // 3. Prospects de la company.
    if (companyId) {
      const { data: prospects } = await db
        .from('prospects')
        .select('id')
        .eq('company_id', companyId);
      for (const p of prospects ?? []) {
        const pid = p.id as string;
        if (seenProspect.has(pid)) continue;
        seenProspect.add(pid);
        links.push({
          email_id: emailId,
          prospect_id: pid,
          contact_id: contactId,
          company_id: companyId,
          confidence,
          link_method: method,
        });
      }
    }
  }

  if (links.length === 0) return 0;
  const { error } = await db.from('email_links').insert(links as never);
  if (error) {
    console.warn('[email/auto-link] insert-failed email=%s msg=%s', emailId, error.message);
    return 0;
  }
  return links.length;
}

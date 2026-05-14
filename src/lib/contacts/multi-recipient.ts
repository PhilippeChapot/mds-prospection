/**
 * P5.x.22 — envoi multi-destinataires : N emails séparés (1 par contact
 * d'une société avec lifecycle_emails_enabled=true), chacun personnalisé.
 *
 * Doctrine Phil :
 *   - PAS de CC. 1 contact = 1 email, avec son prénom interpolé.
 *   - Skip les contacts dont lifecycle_emails_enabled=false (= opt-out
 *     séquences administratives par contact).
 *   - Le contact `primary_contact_id` du prospect reçoit en premier (utile
 *     pour le tracking ordonné côté Resend).
 *   - Erreur sur un contact = ne casse pas les autres (try/catch par contact).
 *
 * Le `render` callback reçoit le contact et doit renvoyer { subject, html, text }
 * — c'est à ce niveau que la personnalisation (firstName, lastName, etc.) se fait.
 *
 * Côté Brevo : ce helper n'écrit RIEN dans Brevo. Brevo continue à recevoir
 * la sync d'attributs / appartenance liste séparément via `brevo-single.ts` ou
 * `brevo-sync.ts`. Ce helper ne s'occupe QUE de l'envoi transactionnel Resend.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';

const LOG_PREFIX = '[multi-recipient]';

export interface RecipientContact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  language: 'FR' | 'EN';
  is_primary: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SendLifecycleEmailOptions {
  /** Société dont on cible les contacts. */
  companyId: string;
  /** Si fourni, ce contact reçoit l'email en premier. */
  primaryContactId?: string | null;
  /** Tags Resend appliqués à chaque envoi (locale ajouté automatiquement). */
  tags?: Array<{ name: string; value: string }>;
  /**
   * Callback de rendu : reçoit le contact, retourne le contenu.
   * Permet d'interpoler {{firstName}}, etc. par contact.
   */
  render: (contact: RecipientContact) => Promise<RenderedEmail> | RenderedEmail;
}

export interface SendLifecycleEmailResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ contactId: string; email: string; message: string }>;
}

/**
 * Récupère les contacts éligibles de la société (lifecycle_emails_enabled=true
 * + email non vide), en mettant `primary_contact_id` en tête si fourni.
 */
export async function listEligibleContactsForCompany(
  companyId: string,
  primaryContactId?: string | null,
): Promise<RecipientContact[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, language, is_primary')
    .eq('company_id', companyId)
    .eq('lifecycle_emails_enabled', true)
    .neq('email', '')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('%s list error company=%s msg=%s', LOG_PREFIX, companyId, error.message);
    return [];
  }
  const rows = (data ?? []) as RecipientContact[];
  if (!primaryContactId) return rows;
  // Réordonne pour mettre primaryContactId en tête
  const idx = rows.findIndex((r) => r.id === primaryContactId);
  if (idx > 0) {
    const [hit] = rows.splice(idx, 1);
    rows.unshift(hit);
  }
  return rows;
}

export async function sendLifecycleEmailToCompanyContacts(
  options: SendLifecycleEmailOptions,
): Promise<SendLifecycleEmailResult> {
  const contacts = await listEligibleContactsForCompany(
    options.companyId,
    options.primaryContactId ?? null,
  );

  const result: SendLifecycleEmailResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (contacts.length === 0) {
    console.warn('%s no-eligible-contacts company=%s', LOG_PREFIX, options.companyId);
    return result;
  }

  for (const contact of contacts) {
    result.attempted += 1;
    try {
      const rendered = await options.render(contact);
      const locale = contact.language === 'EN' ? 'en' : 'fr';
      const toName =
        [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || undefined;
      await sendTransactionalEmailViaResend({
        to: contact.email,
        toName,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [...(options.tags ?? []), { name: 'locale', value: locale }],
      });
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        contactId: contact.id,
        email: contact.email,
        message: err instanceof Error ? err.message : String(err),
      });
      console.error(
        '%s send-failed company=%s contact=%s msg=%s',
        LOG_PREFIX,
        options.companyId,
        contact.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(
    '%s done company=%s attempted=%d sent=%d failed=%d',
    LOG_PREFIX,
    options.companyId,
    result.attempted,
    result.sent,
    result.failed,
  );
  return result;
}

/**
 * P8.3 — Brevo transactional batch sender pour les campagnes.
 *
 * Choix architectural : on n'utilise PAS les "campagnes Brevo natives"
 * (interface marketing Brevo) car on a besoin de filtrer cote MDS
 * (preferences P8.1, audience custom). On envoie via l'API
 * transactionnelle (`POST /smtp/email`), avec personnalisation simple
 * `{prenom}` / `{societe}` / `{etape}` substituee cote MDS avant l'appel.
 *
 * Rate limit Brevo (free/starter plan typical) : ~50-100 emails/sec.
 * On bath par lots de 50 + delai 200ms (250 emails/sec max theorique,
 * sous la limite). En cas d'erreur 429 on retente apres delai.
 *
 * Footer desinscription : OBLIGATOIRE (RGPD + anti-blacklist). On ajoute
 * un block en bas du HTML avec lien vers /espace-exposant (le contact
 * clique, demande un magic-link, gere ses prefs). Pas de tracking pixel
 * Brevo (doctrine V1 : pas de stats open/click — V2).
 */

import { renderMdsEmailHtml } from '@/lib/email/templates/mds-wrapper';

export interface CampaignRecipient {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  language: 'FR' | 'EN';
}

export interface SendCampaignResult {
  sent: number;
  errors: Array<{
    contact_id: string;
    email: string;
    error_message: string;
  }>;
  brevo_ids: Array<{ contact_id: string; email: string; message_id: string }>;
}

interface BrevoSmtpResponse {
  messageId?: string;
  messageIds?: string[];
}

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitue les placeholders {prenom} {societe} {etape} dans une string.
 * Sans-effort sur les autres patterns ; case-insensitive sur le nom du
 * placeholder.
 */
export function personalize(
  template: string,
  recipient: CampaignRecipient,
  options?: { etape?: string },
): string {
  const firstName = recipient.first_name?.trim() || '';
  const company = recipient.company_name?.trim() || '';
  const etape = options?.etape ?? '';
  return template
    .replace(/\{prenom\}/gi, escapeHtml(firstName))
    .replace(/\{societe\}/gi, escapeHtml(company))
    .replace(/\{etape\}/gi, escapeHtml(etape));
}

/** Footer RGPD obligatoire (lien gestion preferences + desinscription). */
export function buildUnsubscribeFooter(opts: { locale: 'fr' | 'en'; appUrl: string }): string {
  if (opts.locale === 'en') {
    return `
<hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px"/>
<p style="margin:0;font-size:11px;color:#888;text-align:center;line-height:1.5">
  You receive this email from MediaDays Solutions because you have opted-in
  to this category.<br/>
  <a href="${opts.appUrl}/en/espace-exposant" style="color:#888;text-decoration:underline">Manage my preferences / Unsubscribe</a>
</p>`.trim();
  }
  return `
<hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px"/>
<p style="margin:0;font-size:11px;color:#888;text-align:center;line-height:1.5">
  Vous recevez cet email de MediaDays Solutions car vous avez opté pour
  cette catégorie de communication.<br/>
  <a href="${opts.appUrl}/fr/espace-exposant" style="color:#888;text-decoration:underline">Gérer mes préférences / Me désinscrire</a>
</p>`.trim();
}

/**
 * Envoie un email transactionnel via Brevo a un destinataire.
 * Best-effort : throw sur erreur fatale, retry 1x sur 429.
 */
async function sendOneViaBrevo(args: {
  apiKey: string;
  to: string;
  toName: string;
  subject: string;
  htmlContent?: string;
  templateId?: number;
  templateParams?: Record<string, unknown>;
  senderEmail: string;
  senderName: string;
}): Promise<string> {
  const body: Record<string, unknown> = {
    sender: { name: args.senderName, email: args.senderEmail },
    to: [{ email: args.to, name: args.toName }],
    subject: args.subject,
  };
  if (args.templateId) {
    body.templateId = args.templateId;
    if (args.templateParams) body.params = args.templateParams;
  } else if (args.htmlContent) {
    body.htmlContent = args.htmlContent;
  } else {
    throw new Error('No htmlContent nor templateId provided');
  }

  let attempt = 0;
  while (attempt < 2) {
    const res = await fetch(BREVO_API, {
      method: 'POST',
      headers: {
        'api-key': args.apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      attempt++;
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
      } catch {
        detail = '';
      }
      throw new Error(`Brevo HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as BrevoSmtpResponse;
    return json.messageId ?? json.messageIds?.[0] ?? '';
  }
  throw new Error('Brevo 429 after retry');
}

/**
 * Envoi batch d'une campagne. Boucle par lots de batchSize avec delai
 * entre lots. Pour CHAQUE destinataire on appelle Brevo individuellement
 * (l'API transactional batch n'existe pas avec perso simple — on accepte
 * N appels HTTP, c'est OK pour < 1000 contacts).
 */
export async function sendCampaignBatch(opts: {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  recipients: CampaignRecipient[];
  subject: string;
  /** Si inline : HTML brut + footer applique automatiquement. */
  htmlContent?: string;
  /** Si template : id Brevo + params injectes (firstName, company, etape). */
  templateId?: number;
  /** Etape pour {etape} substitution + footer. */
  etape?: string;
  /** App base URL pour le lien footer de gestion des prefs. */
  appUrl: string;
  /** batchSize (defaut 50) + delayMs entre lots (defaut 200ms). */
  batchSize?: number;
  delayMs?: number;
  /** Callback de progression (utile pour les logs / UI). */
  onProgress?: (info: { sent: number; errors: number; total: number }) => void;
}): Promise<SendCampaignResult> {
  const batchSize = opts.batchSize ?? 50;
  const delayMs = opts.delayMs ?? 200;
  const total = opts.recipients.length;
  const sentList: SendCampaignResult['brevo_ids'] = [];
  const errors: SendCampaignResult['errors'] = [];

  for (let i = 0; i < total; i += batchSize) {
    const batch = opts.recipients.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (r) => {
        const subjectPersonalized = personalize(opts.subject, r, { etape: opts.etape });
        const toName = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || r.email;
        try {
          let messageId: string;
          if (opts.templateId) {
            // Mode template Brevo : on envoie params au lieu de htmlContent.
            messageId = await sendOneViaBrevo({
              apiKey: opts.apiKey,
              to: r.email,
              toName,
              subject: subjectPersonalized,
              templateId: opts.templateId,
              templateParams: {
                firstName: r.first_name ?? '',
                lastName: r.last_name ?? '',
                company: r.company_name ?? '',
                etape: opts.etape ?? '',
                preferencesUrl: `${opts.appUrl}/${r.language === 'EN' ? 'en' : 'fr'}/espace-exposant`,
              },
              senderEmail: opts.senderEmail,
              senderName: opts.senderName,
            });
          } else if (opts.htmlContent) {
            // P8.3-bis : mode inline = body perso + wrapper MDS branded
            // (header logo + couleurs + footer Editions HF + RGPD).
            // L'ancien buildUnsubscribeFooter() est integre dans le wrapper.
            const personalized = personalize(opts.htmlContent, r, { etape: opts.etape });
            const fullHtml = renderMdsEmailHtml({
              subject: subjectPersonalized,
              bodyHtml: personalized,
              locale: r.language === 'EN' ? 'en' : 'fr',
              appUrl: opts.appUrl,
            });
            messageId = await sendOneViaBrevo({
              apiKey: opts.apiKey,
              to: r.email,
              toName,
              subject: subjectPersonalized,
              htmlContent: fullHtml,
              senderEmail: opts.senderEmail,
              senderName: opts.senderName,
            });
          } else {
            throw new Error('No content (htmlContent ou templateId requis)');
          }
          sentList.push({ contact_id: r.contact_id, email: r.email, message_id: messageId });
        } catch (err) {
          errors.push({
            contact_id: r.contact_id,
            email: r.email,
            error_message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
    opts.onProgress?.({ sent: sentList.length, errors: errors.length, total });
    if (i + batchSize < total) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    sent: sentList.length,
    errors,
    brevo_ids: sentList,
  };
}

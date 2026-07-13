/**
 * Templates admin Resend (P4 M6) — alertes operationnelles a l'equipe.
 *
 * 3 templates ici :
 *   - admin_signup_converti  : nouveau prospect cree depuis un signup
 *   - admin_signature_finale : devis signe (preparé pour M7 webhook Sellsy)
 *   - admin_sync_error       : erreur de sync apres les 3 retries
 *
 * Le 4e template `admin_acompte_paye` est dans admin-payment.ts (M4) et
 * partage la meme charte sobre.
 *
 * Tons : email interne actionnable, pas de fancy charte. Lien CTA toujours
 * vers la fiche admin /admin/prospects/{id}.
 */

const ADMIN_BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 24px;
`;

export interface AdminNotificationTemplate {
  subject: string;
  html: string;
  text: string;
}

// ============================================================================
// admin_signup_converti
// ============================================================================

export interface SignupConvertiParams {
  prospectUrl: string;
  companyName: string;
  contactEmail: string;
  contactName: string;
  pole: string;
  category: string;
  packCode: string | null;
  paymentPath: string | null;
  estimatedAmountEur: string; // pre-formate "1 980,00 €"
  language: 'FR' | 'EN';
  addonCount: number;
  /** Cas B = manifestation d'interet sans pack (devis manuel ulterieur). */
  isCasB?: boolean;
  /** Cas B uniquement : type de presence souhaite (visiteur, sponsor...). */
  presenceType?: string | null;
}

export function renderAdminSignupConvertiEmail(p: SignupConvertiParams): AdminNotificationTemplate {
  return p.isCasB ? renderCasB(p) : renderCasA(p);
}

function renderCasA(p: SignupConvertiParams): AdminNotificationTemplate {
  const subject = `[MDS] Nouveau prospect converti — ${p.companyName}`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #294294;">Nouveau prospect converti 🎯</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">Le signup web de <strong>${p.companyName}</strong> est passe en prospect.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Contact</td><td style="text-align: right; font-weight: 600;">${p.contactName}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Email</td><td style="text-align: right;">${p.contactEmail}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Societe</td><td style="text-align: right;">${p.companyName}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Pole</td><td style="text-align: right;">${p.pole}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Categorie</td><td style="text-align: right;">${p.category}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Pack</td><td style="text-align: right; font-weight: 600;">${p.packCode ?? '—'}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Addons</td><td style="text-align: right;">${p.addonCount}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Total HT</td><td style="text-align: right; font-weight: 600; color: #294294;">${p.estimatedAmountEur}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Parcours</td><td style="text-align: right;">${p.paymentPath ?? '—'}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Langue</td><td style="text-align: right;">${p.language}</td></tr>
        </table>
        <p style="margin: 24px 0 0;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Nouveau prospect converti`,
    ``,
    `Contact : ${p.contactName}`,
    `Email : ${p.contactEmail}`,
    `Societe : ${p.companyName}`,
    `Pole : ${p.pole}`,
    `Categorie : ${p.category}`,
    `Pack : ${p.packCode ?? '—'}`,
    `Addons : ${p.addonCount}`,
    `Total HT : ${p.estimatedAmountEur}`,
    `Parcours : ${p.paymentPath ?? '—'}`,
    `Langue : ${p.language}`,
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
  ].join('\n');

  return { subject, html, text };
}

function renderCasB(p: SignupConvertiParams): AdminNotificationTemplate {
  const subject = `[MDS] Manifestation d'intérêt — ${p.companyName}`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #f5a52455; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #f5a524;">Manifestation d'intérêt reçue 📨</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">${p.companyName} s'intéresse aux MediaDays Solutions sans avoir choisi de pack — devis non émis automatiquement, rappel admin sous 48h ouvrées.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Contact</td><td style="text-align: right; font-weight: 600;">${p.contactName}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Email</td><td style="text-align: right;">${p.contactEmail}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Societe</td><td style="text-align: right;">${p.companyName}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Pole</td><td style="text-align: right;">${p.pole}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Categorie</td><td style="text-align: right;">${p.category}</td></tr>
          ${p.presenceType ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Type de presence</td><td style="text-align: right; font-weight: 600;">${p.presenceType}</td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #5c6b85;">Langue</td><td style="text-align: right;">${p.language}</td></tr>
        </table>
        <p style="margin: 24px 0 0;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Manifestation d'interet recue (Cas B)`,
    `Devis non emis automatiquement — rappel admin sous 48h ouvrees.`,
    ``,
    `Contact : ${p.contactName}`,
    `Email : ${p.contactEmail}`,
    `Societe : ${p.companyName}`,
    `Pole : ${p.pole}`,
    `Categorie : ${p.category}`,
    p.presenceType ? `Type de presence : ${p.presenceType}` : '',
    `Langue : ${p.language}`,
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

// ============================================================================
// admin_signup_recu — notif immediate a chaque nouvelle entree signup
// (etape 1, meme incomplete). Distinct de admin_signup_converti (conversion
// manuelle admin) : ici on notifie des la soumission du formulaire.
// ============================================================================

export interface SignupRecuParams {
  signupUrl: string;
  email: string;
  companyName: string | null;
  contactName: string;
  category: string;
  stepCompleted: 1 | 2;
  language: 'FR' | 'EN';
  createdAtFormatted: string;
}

export function renderAdminSignupRecuEmail(p: SignupRecuParams): AdminNotificationTemplate {
  const subject = `📥 Nouvelle inscription — ${p.companyName ?? p.email}`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #294294;">Nouvelle inscription reçue</h2>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Email</td><td style="text-align: right;">${p.email}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Société</td><td style="text-align: right;">${p.companyName ?? '(non renseigné)'}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Nom</td><td style="text-align: right;">${p.contactName || '—'}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Catégorie</td><td style="text-align: right;">${p.category}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Étape complétée</td><td style="text-align: right;">${p.stepCompleted}/2</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Langue</td><td style="text-align: right;">${p.language}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Créé le</td><td style="text-align: right;">${p.createdAtFormatted}</td></tr>
        </table>
        <p style="margin: 24px 0 0;">
          <a href="${p.signupUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir dans l'admin</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Nouvelle inscription recue`,
    ``,
    `Email : ${p.email}`,
    `Societe : ${p.companyName ?? '(non renseigne)'}`,
    `Nom : ${p.contactName || '—'}`,
    `Categorie : ${p.category}`,
    `Etape completee : ${p.stepCompleted}/2`,
    `Langue : ${p.language}`,
    `Cree le : ${p.createdAtFormatted}`,
    ``,
    `Fiche signup : ${p.signupUrl}`,
  ].join('\n');

  return { subject, html, text };
}

// ============================================================================
// admin_signature_finale (prepare pour M7)
// ============================================================================

export interface SignatureFinaleParams {
  prospectUrl: string;
  companyName: string;
  documentNumber: string;
  amountEur: string;
  sellsyDocumentUrl: string;
}

export function renderAdminSignatureFinaleEmail(
  p: SignatureFinaleParams,
): AdminNotificationTemplate {
  const subject = `[MDS] Devis signé — ${p.companyName}`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #1fbf7a44; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #1fbf7a;">Devis signé ✓</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;"><strong>${p.companyName}</strong> a signe le devis. Bravo.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Numero devis</td><td style="text-align: right; font-family: monospace;">${p.documentNumber}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Montant</td><td style="text-align: right; font-weight: 600; color: #294294;">${p.amountEur}</td></tr>
        </table>
        <p style="margin: 24px 0 0; display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
          <a href="${p.sellsyDocumentUrl}" style="display: inline-block; padding: 10px 20px; background: #fff; color: #294294; text-decoration: none; border-radius: 8px; border: 1px solid #294294; font-weight: 600;">Voir le devis Sellsy</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Devis signe`,
    ``,
    `Societe : ${p.companyName}`,
    `Numero devis : ${p.documentNumber}`,
    `Montant : ${p.amountEur}`,
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
    `Devis Sellsy : ${p.sellsyDocumentUrl}`,
  ].join('\n');

  return { subject, html, text };
}

// ============================================================================
// admin_paymentadd (P4.x.2 sujet H)
// ============================================================================

export interface PaymentAddParams {
  prospectUrl: string;
  companyName: string;
  documentNumber: string;
  /** Montant du paiement specifique (formatted "1 200,00 €"). */
  amountEur: string;
  /** Cumul des paiements pour ce prospect (formatted). */
  cumulativeEur: string;
  /** Total TTC du devis (formatted) ou "—" si inconnu. */
  devisTotalTtcEur: string;
  /** Statut prospect calcule apres ce paiement (acompte_paye | paye_integral). */
  newStatus: 'acompte_paye' | 'paye_integral';
  sellsyDocumentUrl: string;
}

export function renderAdminPaymentAddEmail(p: PaymentAddParams): AdminNotificationTemplate {
  const subject = `[MDS] Paiement reçu — ${p.companyName} (${p.amountEur})`;

  const statusLabel = p.newStatus === 'paye_integral' ? 'Payé intégralement' : 'Acompte payé';
  const accentColor = p.newStatus === 'paye_integral' ? '#1fbf7a' : '#294294';

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: ${accentColor};">Paiement enregistré côté Sellsy ✓</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">Un règlement a été ajouté au devis de <strong>${p.companyName}</strong>.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Montant</td><td style="text-align: right; font-weight: 600; color: ${accentColor};">${p.amountEur}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Cumul payé</td><td style="text-align: right; font-weight: 600;">${p.cumulativeEur}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Total devis (TTC)</td><td style="text-align: right;">${p.devisTotalTtcEur}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Numéro devis</td><td style="text-align: right; font-family: monospace;">${p.documentNumber}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Statut prospect</td><td style="text-align: right; font-weight: 600;">${statusLabel}</td></tr>
        </table>
        <p style="margin: 24px 0 0; display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
          <a href="${p.sellsyDocumentUrl}" style="display: inline-block; padding: 10px 20px; background: #fff; color: #294294; text-decoration: none; border-radius: 8px; border: 1px solid #294294; font-weight: 600;">Voir le devis Sellsy</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Paiement enregistre cote Sellsy`,
    ``,
    `Societe : ${p.companyName}`,
    `Numero devis : ${p.documentNumber}`,
    `Montant : ${p.amountEur}`,
    `Cumul paye : ${p.cumulativeEur}`,
    `Total devis (TTC) : ${p.devisTotalTtcEur}`,
    `Statut prospect : ${statusLabel}`,
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
    `Devis Sellsy : ${p.sellsyDocumentUrl}`,
  ].join('\n');

  return { subject, html, text };
}

// ============================================================================
// admin_sync_error
// ============================================================================

export interface SyncErrorParams {
  prospectUrl: string;
  companyName: string;
  provider: 'sellsy' | 'stripe' | 'brevo' | 'vies';
  errorMessage: string;
  context?: string; // ex: "syncProspectToSellsy after 3 retries"
}

export function renderAdminSyncErrorEmail(p: SyncErrorParams): AdminNotificationTemplate {
  const subject = `[MDS] Erreur sync ${p.provider} — ${p.companyName}`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e5484d33; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #e5484d;">Erreur sync ${p.provider} ✗</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">La sync <strong>${p.provider}</strong> a echoue pour <strong>${p.companyName}</strong> apres les 3 retries.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Provider</td><td style="text-align: right; font-weight: 600;">${p.provider}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Societe</td><td style="text-align: right;">${p.companyName}</td></tr>
          ${p.context ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Contexte</td><td style="text-align: right; font-family: monospace; font-size: 12px;">${p.context}</td></tr>` : ''}
        </table>
        <div style="margin-top: 16px; padding: 12px; background: #f4f6fb; border-radius: 8px; font-family: monospace; font-size: 12px; color: #e5484d; white-space: pre-wrap; word-break: break-word;">${escapeHtml(p.errorMessage)}</div>
        <p style="margin: 24px 0 0;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Erreur sync ${p.provider}`,
    ``,
    `Societe : ${p.companyName}`,
    p.context ? `Contexte : ${p.context}` : '',
    ``,
    `Erreur : ${p.errorMessage}`,
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

// ============================================================================
// admin_calendar_webhook_renewal_failed (P14.5 → brief GoogleCalendarWebhookAutoRenew)
// ============================================================================

export interface CalendarWebhookRenewalFailedParams {
  settingsUrl: string;
  googleAccountEmail: string | null;
  errorMessage: string;
  webhookExpiresAt: string | null; // ISO, pre-formate a l'appelant si besoin
}

export function renderCalendarWebhookRenewalFailedEmail(
  p: CalendarWebhookRenewalFailedParams,
): AdminNotificationTemplate {
  const subject = '⚠️ Renouvellement Google Calendar webhook échoué';
  const account = p.googleAccountEmail ?? '(compte inconnu)';
  const expires = p.webhookExpiresAt ?? '—';

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e5484d33; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #e5484d;">Renouvellement webhook Google Calendar échoué ✗</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">Le cron de renouvellement automatique n'a pas pu renouveler le push channel Google Calendar.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Compte</td><td style="text-align: right; font-weight: 600;">${account}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Expiration prévue</td><td style="text-align: right;">${expires}</td></tr>
        </table>
        <div style="margin-top: 16px; padding: 12px; background: #f4f6fb; border-radius: 8px; font-family: monospace; font-size: 12px; color: #e5484d; white-space: pre-wrap; word-break: break-word;">${escapeHtml(p.errorMessage)}</div>
        <p style="margin: 20px 0 0; color: #5c6b85;">Actions recommandées : vérifier la connexion Google, reconnecter si nécessaire (Déconnecter puis Se connecter).</p>
        <p style="margin: 24px 0 0;">
          <a href="${p.settingsUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Vérifier la connexion</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Renouvellement Google Calendar webhook echoue`,
    ``,
    `Compte : ${account}`,
    `Expiration prevue : ${expires}`,
    `Erreur : ${p.errorMessage}`,
    ``,
    `Actions recommandees :`,
    `1. Verifier votre connexion Google : ${p.settingsUrl}`,
    `2. Reconnecter si necessaire (Deconnecter puis Se connecter avec Google)`,
  ].join('\n');

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

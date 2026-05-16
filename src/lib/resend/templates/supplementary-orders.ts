/**
 * P6.x.1b-β — templates emails commande complémentaire.
 *
 * 1. renderClientSupplementaryConfirmation : confirmation exposant après
 *    paiement réussi (récap items + total TTC + lien facture Sellsy si dispo)
 * 2. renderAdminSupplementaryReceived : notif admin (vue d'ensemble + lien
 *    fiche prospect + lien facture)
 *
 * Style sobre, cohérent avec admin-payment.ts (pas de charte fancy).
 */

export interface SupplementaryItemRow {
  sellsy_product_id: number;
  reference: string;
  name: string;
  unit_price_ht: number;
  qty: number;
  line_total_ht: number;
}

export interface ClientSupplementaryParams {
  contactFirstName: string | null;
  companyName: string;
  orderId: string;
  items: SupplementaryItemRow[];
  totalHt: number;
  totalTtc: number;
  vatRate: number; // ex 20
  paidAt: string; // ISO
  factureNumber: string | null;
  facturePublicUrl: string | null;
  orderDetailUrl: string;
  appUrl: string;
}

export interface AdminSupplementaryParams {
  prospectId: string;
  prospectUrl: string;
  companyName: string;
  contactEmail: string;
  orderId: string;
  items: SupplementaryItemRow[];
  totalHt: number;
  totalTtc: number;
  paidAt: string;
  factureNumber: string | null;
  facturePublicUrl: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 24px;
`;

function fmtEur(n: number): string {
  // Format FR avec espaces normalisés (cohérent avec lib/tarifs/format)
  return n
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\s   ]/g, ' ');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#039;';
      default:
        return c;
    }
  });
}

function renderItemsTableHtml(items: SupplementaryItemRow[]): string {
  return items
    .map((it) => {
      const name = escapeHtml(it.name);
      return `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e0e4ee;">
          <div style="font-weight: 600;">${name}</div>
          <div style="font-size: 11px; color: #5c6b85; font-family: monospace;">${escapeHtml(it.reference)}</div>
        </td>
        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #e0e4ee; white-space: nowrap;">
          ${it.qty} × ${fmtEur(it.unit_price_ht)} €
        </td>
        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #e0e4ee; font-weight: 600; white-space: nowrap;">
          ${fmtEur(it.line_total_ht)} €
        </td>
      </tr>`;
    })
    .join('');
}

function renderItemsText(items: SupplementaryItemRow[]): string {
  return items
    .map(
      (it) =>
        `  - ${it.name} (${it.reference}) : ${it.qty} × ${fmtEur(it.unit_price_ht)} € = ${fmtEur(it.line_total_ht)} € HT`,
    )
    .join('\n');
}

export function renderClientSupplementaryConfirmation(
  p: ClientSupplementaryParams,
): RenderedTemplate {
  const greeting = p.contactFirstName ? `Bonjour ${escapeHtml(p.contactFirstName)},` : 'Bonjour,';
  const subject = `Confirmation de commande MDS 2026 — ${fmtEur(p.totalTtc)} € TTC`;

  const factureBlock = p.factureNumber
    ? `<p style="margin: 16px 0 0;">
        <strong>Facture :</strong> ${escapeHtml(p.factureNumber)}
        ${p.facturePublicUrl ? `<br/><a href="${p.facturePublicUrl}" style="color: #294294;">Télécharger la facture</a>` : ''}
      </p>`
    : `<p style="margin: 16px 0 0; color: #5c6b85; font-size: 13px;">La facture sera disponible sous peu.</p>`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #1fbf7a;">Merci pour votre commande ✓</h2>
        <p style="margin: 0 0 16px;">${greeting}</p>
        <p style="margin: 0 0 16px;">
          Nous avons bien reçu votre commande complémentaire pour <strong>${escapeHtml(p.companyName)}</strong>
          le ${fmtDate(p.paidAt)}.
        </p>

        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px; margin: 20px 0;">
          ${renderItemsTableHtml(p.items)}
        </table>

        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #5c6b85;">Total HT</td>
            <td style="padding: 6px 0; text-align: right;">${fmtEur(p.totalHt)} €</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #5c6b85;">TVA ${p.vatRate}%</td>
            <td style="padding: 6px 0; text-align: right;">${fmtEur(p.totalTtc - p.totalHt)} €</td>
          </tr>
          <tr>
            <td style="padding: 10px 0 6px; font-weight: 700;">Total TTC payé</td>
            <td style="padding: 10px 0 6px; text-align: right; font-weight: 700; color: #1fbf7a;">${fmtEur(p.totalTtc)} €</td>
          </tr>
        </table>

        ${factureBlock}

        <p style="margin: 24px 0 0;">
          <a href="${p.orderDetailUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le détail</a>
        </p>

        <p style="margin: 24px 0 0; font-size: 12px; color: #5c6b85;">
          Référence commande : ${escapeHtml(p.orderId)}<br/>
          MediaDays Solutions 2026
        </p>
      </div>
    </div>
  `.trim();

  const text = `
${greeting}

Merci pour votre commande complémentaire MDS 2026 (${p.companyName}), reçue le ${fmtDate(p.paidAt)}.

Récapitulatif :
${renderItemsText(p.items)}

Total HT  : ${fmtEur(p.totalHt)} €
TVA ${p.vatRate}%  : ${fmtEur(p.totalTtc - p.totalHt)} €
Total TTC : ${fmtEur(p.totalTtc)} € ✓ payé

${p.factureNumber ? `Facture : ${p.factureNumber}${p.facturePublicUrl ? `\n${p.facturePublicUrl}` : ''}` : 'La facture sera disponible sous peu.'}

Détail commande : ${p.orderDetailUrl}

Référence : ${p.orderId}
MediaDays Solutions 2026
`.trim();

  return { subject, html, text };
}

export function renderAdminSupplementaryReceived(p: AdminSupplementaryParams): RenderedTemplate {
  const subject = `[MDS] Commande complémentaire — ${p.companyName} (${fmtEur(p.totalTtc)} € TTC)`;

  const factureBlock = p.factureNumber
    ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Facture Sellsy</td><td style="text-align: right;">${escapeHtml(p.factureNumber)}${p.facturePublicUrl ? ` · <a href="${p.facturePublicUrl}" style="color: #294294;">voir</a>` : ''}</td></tr>`
    : `<tr><td style="padding: 6px 0; color: #5c6b85;">Facture Sellsy</td><td style="text-align: right; color: #d29922;">en cours / à créer manuellement</td></tr>`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #1fbf7a;">Commande complémentaire payée ✓</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">
          ${escapeHtml(p.companyName)} a payé ${fmtEur(p.totalTtc)} € TTC en commande complémentaire.
        </p>

        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Société</td><td style="text-align: right;">${escapeHtml(p.companyName)}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Contact</td><td style="text-align: right;">${escapeHtml(p.contactEmail)}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Items</td><td style="text-align: right;">${p.items.length} produit${p.items.length > 1 ? 's' : ''}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Total HT</td><td style="text-align: right;">${fmtEur(p.totalHt)} €</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Total TTC</td><td style="text-align: right; font-weight: 600;">${fmtEur(p.totalTtc)} €</td></tr>
          ${factureBlock}
          ${p.stripeSessionId ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Stripe session</td><td style="text-align: right; font-family: monospace; font-size: 11px;">${p.stripeSessionId}</td></tr>` : ''}
        </table>

        <details style="margin: 20px 0; padding: 12px; background: #f8fafc; border-radius: 8px;">
          <summary style="cursor: pointer; font-weight: 600; color: #5c6b85;">Détail items</summary>
          <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 13px; margin-top: 12px;">
            ${renderItemsTableHtml(p.items)}
          </table>
        </details>

        <p style="margin: 24px 0 0;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
        </p>

        <p style="margin: 16px 0 0; font-size: 11px; color: #5c6b85; font-family: monospace;">
          order: ${escapeHtml(p.orderId)}<br/>
          prospect: ${escapeHtml(p.prospectId)}
        </p>
      </div>
    </div>
  `.trim();

  const text = `
[MDS] Commande complémentaire payée

Société   : ${p.companyName}
Contact   : ${p.contactEmail}
Items     : ${p.items.length}
Total HT  : ${fmtEur(p.totalHt)} €
Total TTC : ${fmtEur(p.totalTtc)} €
Facture   : ${p.factureNumber ? `${p.factureNumber}${p.facturePublicUrl ? ' · ' + p.facturePublicUrl : ''}` : 'à créer manuellement'}
${p.stripeSessionId ? `Stripe    : ${p.stripeSessionId}` : ''}

Détail items :
${renderItemsText(p.items)}

Voir prospect : ${p.prospectUrl}

order: ${p.orderId}
prospect: ${p.prospectId}
`.trim();

  return { subject, html, text };
}

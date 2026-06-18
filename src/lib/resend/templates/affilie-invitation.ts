/**
 * Template email d'invitation affilié — P5.x.AffiliateInvitationEmail
 *
 * Envoyé lors de la création d'un affilié (si contact_email fourni) et
 * lors d'un renvoi manuel via "Renvoyer l'invitation" sur la fiche admin.
 *
 * FR + EN. Le champ preferred_locale n'existant pas en V1, l'action admin
 * passe toujours 'fr'. EN disponible dès maintenant pour usage futur.
 */

import { capitalizeName } from '@/lib/format/name';

export interface AffiliateInvitationParams {
  displayName: string;
  token: string;
  commissionPercent: number;
  espaceLoginUrl: string;
  trackingUrl: string;
  locale: 'fr' | 'en';
}

export interface AffiliateInvitationTemplate {
  subject: string;
  html: string;
  text: string;
}

export function buildAffiliateInvitationEmail(
  params: AffiliateInvitationParams,
): AffiliateInvitationTemplate {
  if (params.locale === 'en') return renderEn(params);
  return renderFr(params);
}

// ---------------------------------------------------------------------------
// FR
// ---------------------------------------------------------------------------

function renderFr(p: AffiliateInvitationParams): AffiliateInvitationTemplate {
  const name = capitalizeName(p.displayName);
  const pct = p.commissionPercent.toFixed(2).replace(/\.00$/, '');

  const subject = `Bienvenue ${name} — votre programme affilié MediaDays Solutions est actif`;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:24px 28px;color:white">
      <h1 style="margin:0;font-size:20px;font-weight:700">Bienvenue dans le programme affilié 🎉</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">MediaDays Solutions 2026 · Programme Affiliés</p>
    </td></tr>
    <tr><td style="padding:24px 28px;font-size:14px;line-height:1.55">
      <p style="margin:0 0 16px">Bonjour ${escapeHtml(name)},</p>
      <p style="margin:0 0 20px;line-height:1.6">
        Vous êtes désormais affilié au programme <strong>MediaDays Solutions 2026</strong>
        (10 décembre à Marseille · 15 décembre à Paris).
        Votre rémunération : <strong>${escapeHtml(pct)}%</strong> sur chaque vente apportée.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border-collapse:collapse">
        <tr><td style="background:#f0f4ff;border:1px solid #dde3f0;border-radius:8px;padding:16px 20px;text-align:center">
          <div style="font-size:11px;font-weight:700;color:#5c6b80;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Votre code affilié</div>
          <div style="font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:800;color:#031A56;letter-spacing:0.12em">${escapeHtml(p.token)}</div>
        </td></tr>
      </table>

      <p style="margin:0 0 8px;font-weight:700;color:#031A56;font-size:14px">Votre lien de tracking</p>
      <p style="margin:0 0 10px;font-size:13px;color:#5c6b80">
        Partagez ce lien : chaque inscription qui passe par lui vous est créditée automatiquement.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-collapse:collapse">
        <tr><td style="background:#f4f6fb;border:1px solid #e0e4ee;border-radius:6px;padding:12px 16px;word-break:break-all">
          <a href="${escapeAttr(p.trackingUrl)}" style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#1E3A8A;text-decoration:none">${escapeHtml(p.trackingUrl)}</a>
        </td></tr>
      </table>

      <p style="text-align:center;margin:0 0 28px">
        <a href="${escapeAttr(p.espaceLoginUrl)}" style="display:inline-block;padding:14px 28px;background:#E6007E;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">
          Accéder à mon espace affilié →
        </a>
      </p>

      <p style="margin:0 0 10px;font-weight:700;color:#031A56;font-size:14px">Comment ça marche</p>
      <ol style="margin:0 0 8px;padding-left:20px;font-size:13px;line-height:1.75;color:#4a5568">
        <li>Vous partagez votre lien de tracking auprès de votre réseau.</li>
        <li>Quand quelqu'un s'inscrit via votre lien, il vous est automatiquement attribué.</li>
        <li>Nous vous payons ${escapeHtml(pct)}% sur chaque vente convertie en stand ou sponsoring.</li>
      </ol>
    </td></tr>
    <tr><td style="background:#f4f6fb;padding:16px 28px;border-top:1px solid #e0e4ee;font-size:11px;color:#8593a8;text-align:center;line-height:1.7">
      MediaDays Solutions est organisé par les Éditions HF, 41 rue de la République, 19100 Brive-la-Gaillarde.<br>
      Questions ? <a href="mailto:philippe@mediadays.solutions" style="color:#8593a8">philippe@mediadays.solutions</a>
    </td></tr>
  </table>
</body></html>`;

  const text = `Bienvenue ${name},

Vous êtes désormais affilié au programme MediaDays Solutions 2026 (10 décembre à Marseille · 15 décembre à Paris).
Votre rémunération : ${pct}% sur chaque vente apportée.

VOTRE CODE AFFILIÉ : ${p.token}

VOTRE LIEN DE TRACKING :
${p.trackingUrl}

Partagez ce lien : chaque inscription qui passe par lui vous est créditée automatiquement.

Accéder à votre espace affilié : ${p.espaceLoginUrl}

COMMENT ÇA MARCHE
1. Vous partagez votre lien de tracking auprès de votre réseau.
2. Quand quelqu'un s'inscrit via votre lien, il vous est automatiquement attribué.
3. Nous vous payons ${pct}% sur chaque vente convertie en stand ou sponsoring.

---
MediaDays Solutions est organisé par les Éditions HF, 41 rue de la République, 19100 Brive-la-Gaillarde.
Questions : philippe@mediadays.solutions`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// EN
// ---------------------------------------------------------------------------

function renderEn(p: AffiliateInvitationParams): AffiliateInvitationTemplate {
  const name = capitalizeName(p.displayName);
  const pct = p.commissionPercent.toFixed(2).replace(/\.00$/, '');

  const subject = `Welcome ${name} — your MediaDays Solutions affiliate program is live`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:24px 28px;color:white">
      <h1 style="margin:0;font-size:20px;font-weight:700">Welcome to the affiliate program 🎉</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">MediaDays Solutions 2026 · Affiliate Program</p>
    </td></tr>
    <tr><td style="padding:24px 28px;font-size:14px;line-height:1.55">
      <p style="margin:0 0 16px">Hello ${escapeHtml(name)},</p>
      <p style="margin:0 0 20px;line-height:1.6">
        You are now an affiliate of the <strong>MediaDays Solutions 2026</strong> program
        (December 10 in Marseille · December 15 in Paris).
        Your commission: <strong>${escapeHtml(pct)}%</strong> on every sale you bring in.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border-collapse:collapse">
        <tr><td style="background:#f0f4ff;border:1px solid #dde3f0;border-radius:8px;padding:16px 20px;text-align:center">
          <div style="font-size:11px;font-weight:700;color:#5c6b80;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Your affiliate code</div>
          <div style="font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:800;color:#031A56;letter-spacing:0.12em">${escapeHtml(p.token)}</div>
        </td></tr>
      </table>

      <p style="margin:0 0 8px;font-weight:700;color:#031A56;font-size:14px">Your tracking link</p>
      <p style="margin:0 0 10px;font-size:13px;color:#5c6b80">
        Share this link: every registration that goes through it is automatically credited to you.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;border-collapse:collapse">
        <tr><td style="background:#f4f6fb;border:1px solid #e0e4ee;border-radius:6px;padding:12px 16px;word-break:break-all">
          <a href="${escapeAttr(p.trackingUrl)}" style="font-family:'Courier New',Courier,monospace;font-size:12px;color:#1E3A8A;text-decoration:none">${escapeHtml(p.trackingUrl)}</a>
        </td></tr>
      </table>

      <p style="text-align:center;margin:0 0 28px">
        <a href="${escapeAttr(p.espaceLoginUrl)}" style="display:inline-block;padding:14px 28px;background:#E6007E;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px">
          Access my affiliate space →
        </a>
      </p>

      <p style="margin:0 0 10px;font-weight:700;color:#031A56;font-size:14px">How it works</p>
      <ol style="margin:0 0 8px;padding-left:20px;font-size:13px;line-height:1.75;color:#4a5568">
        <li>Share your tracking link with your network.</li>
        <li>When someone registers through your link, they are automatically credited to you.</li>
        <li>We pay you ${escapeHtml(pct)}% on every sale converted into a booth or sponsorship.</li>
      </ol>
    </td></tr>
    <tr><td style="background:#f4f6fb;padding:16px 28px;border-top:1px solid #e0e4ee;font-size:11px;color:#8593a8;text-align:center;line-height:1.7">
      MediaDays Solutions is organized by Éditions HF, 41 rue de la République, 19100 Brive-la-Gaillarde, France.<br>
      Questions? <a href="mailto:philippe@mediadays.solutions" style="color:#8593a8">philippe@mediadays.solutions</a>
    </td></tr>
  </table>
</body></html>`;

  const text = `Hello ${name},

You are now an affiliate of the MediaDays Solutions 2026 program (December 10 in Marseille · December 15 in Paris).
Your commission: ${pct}% on every sale you bring in.

YOUR AFFILIATE CODE: ${p.token}

YOUR TRACKING LINK:
${p.trackingUrl}

Share this link: every registration that goes through it is automatically credited to you.

Access your affiliate space: ${p.espaceLoginUrl}

HOW IT WORKS
1. Share your tracking link with your network.
2. When someone registers through your link, they are automatically credited to you.
3. We pay you ${pct}% on every sale converted into a booth or sponsorship.

---
MediaDays Solutions is organized by Éditions HF, 41 rue de la République, 19100 Brive-la-Gaillarde, France.
Questions: philippe@mediadays.solutions`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

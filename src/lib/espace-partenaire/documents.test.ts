import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDocumentLinks, getCommunicationKit, getEmailSignatureHtml } from './documents';

const ENV_BACKUP = { ...process.env };

describe('getDocumentLinks (P5.x.10)', () => {
  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
  });

  it('retourne null pour guide/floor_plan si env absente', () => {
    delete process.env.EXHIBITOR_GUIDE_PDF_URL;
    delete process.env.EXHIBITOR_FLOOR_PLAN_URL;
    const result = getDocumentLinks({
      sellsyDevisPublicUrl: 'https://x/devis',
      sellsyInvoicePublicUrl: null,
    });
    expect(result.guidePdfUrl).toBeNull();
    expect(result.floorPlanPdfUrl).toBeNull();
    expect(result.devisUrl).toBe('https://x/devis');
    expect(result.invoiceUrl).toBeNull();
  });

  it('utilise les env vars si presentes', () => {
    process.env.EXHIBITOR_GUIDE_PDF_URL = 'https://x/guide.pdf';
    process.env.EXHIBITOR_FLOOR_PLAN_URL = 'https://x/plan.pdf';
    const result = getDocumentLinks({
      sellsyDevisPublicUrl: 'https://x/devis',
      sellsyInvoicePublicUrl: 'https://x/inv',
    });
    expect(result.guidePdfUrl).toBe('https://x/guide.pdf');
    expect(result.floorPlanPdfUrl).toBe('https://x/plan.pdf');
    expect(result.invoiceUrl).toBe('https://x/inv');
  });
});

describe('getCommunicationKit (P5.x.10)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.mediadays.solutions';
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
  });

  it('retourne les URLs logos depuis /brand', () => {
    const kit = getCommunicationKit('fr');
    expect(kit.logoMdsSvgUrl).toBe('/brand/MDS-LogoBleu2026.svg');
    expect(kit.logoPrsSvgUrl).toBe('/brand/PRS-LogoBleu2026.svg');
  });

  it('badge null si env absente', () => {
    delete process.env.EXHIBITOR_BADGE_URL;
    expect(getCommunicationKit('fr').badgeJexposeUrl).toBeNull();
  });

  it('signature email FR par defaut (category null) = MDS variant', () => {
    const kit = getCommunicationKit('fr');
    expect(kit.emailSignatureHtml).toContain('Retrouvez-nous aux MediaDays Solutions 2026');
    expect(kit.emailSignatureHtml).toContain('href="https://mediadays.solutions"');
    expect(kit.emailSignatureHtml).toContain('<table');
  });

  it('signature email EN par defaut = MDS variant anglais', () => {
    const kit = getCommunicationKit('en');
    expect(kit.emailSignatureHtml).toContain('Find us at MediaDays Solutions 2026');
  });
});

describe('getEmailSignatureHtml — variants PRS/MDS (P5.x.10.bis)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.mediadays.solutions';
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
  });

  it('PRS partner FR : tagline + logo PRS + double lien footer FR', () => {
    const html = getEmailSignatureHtml('fr', true);
    expect(html).toContain('Retrouvez-nous au Paris Radio Show / MediaDays Solutions 2026');
    expect(html).toContain('Paris, 15 décembre et/ou Marseille, 10 décembre');
    expect(html).toContain('PRS-LogoBleu2026.svg');
    expect(html).not.toContain('MDS-LogoBleu2026.svg');
    expect(html).toContain('alt="Paris Radio Show 2026"');
    // P5.x.10.ter : double lien footer
    expect(html).toContain('Infos partenaires');
    expect(html).toContain('href="https://mediadays.solutions"');
    expect(html).toContain('Infos visiteurs');
    expect(html).toContain('href="https://mediadays.net"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('PRS partner EN : tagline + logo PRS + double lien footer EN', () => {
    const html = getEmailSignatureHtml('en', true);
    expect(html).toContain('Find us at Paris Radio Show / MediaDays Solutions 2026');
    expect(html).toContain('Paris, December 15 and/or Marseille, December 10');
    expect(html).toContain('PRS-LogoBleu2026.svg');
    expect(html).toContain('Partner info');
    expect(html).toContain('Visitor info');
    expect(html).toContain('href="https://mediadays.solutions"');
    expect(html).toContain('href="https://mediadays.net"');
  });

  it('MDS partner FR (non-PRS) : tagline MDS + logo MDS + double lien footer FR', () => {
    const html = getEmailSignatureHtml('fr', false);
    expect(html).toContain('Retrouvez-nous aux MediaDays Solutions 2026');
    expect(html).toContain('Paris et/ou Marseille');
    expect(html).toContain('MDS-LogoBleu2026.svg');
    expect(html).not.toContain('Paris Radio Show');
    expect(html).toContain('alt="MediaDays Solutions 2026"');
    expect(html).toContain('Infos partenaires');
    expect(html).toContain('Infos visiteurs');
    expect(html).toContain('href="https://mediadays.solutions"');
    expect(html).toContain('href="https://mediadays.net"');
  });

  it('MDS partner EN : tagline anglais + logo MDS + double lien footer EN', () => {
    const html = getEmailSignatureHtml('en', false);
    expect(html).toContain('Find us at MediaDays Solutions 2026');
    expect(html).toContain('Paris and/or Marseille');
    expect(html).toContain('MDS-LogoBleu2026.svg');
    expect(html).not.toContain('Paris Radio Show');
    expect(html).toContain('Partner info');
    expect(html).toContain('Visitor info');
    expect(html).toContain('href="https://mediadays.solutions"');
    expect(html).toContain('href="https://mediadays.net"');
  });

  it('getCommunicationKit(fr, "prs_exhibitor") -> signature PRS', () => {
    const kit = getCommunicationKit('fr', 'prs_exhibitor');
    expect(kit.emailSignatureHtml).toContain('Paris Radio Show');
  });

  it('getCommunicationKit(fr, "standard") -> signature MDS', () => {
    const kit = getCommunicationKit('fr', 'standard');
    expect(kit.emailSignatureHtml).toContain('Retrouvez-nous aux MediaDays Solutions');
    expect(kit.emailSignatureHtml).not.toContain('Paris Radio Show');
  });

  it('getCommunicationKit(fr, null) -> fallback MDS', () => {
    const kit = getCommunicationKit('fr', null);
    expect(kit.emailSignatureHtml).toContain('Retrouvez-nous aux MediaDays Solutions');
    expect(kit.emailSignatureHtml).not.toContain('Paris Radio Show');
  });

  it('getCommunicationKit(fr, "non_eligible") -> fallback MDS', () => {
    const kit = getCommunicationKit('fr', 'non_eligible');
    expect(kit.emailSignatureHtml).toContain('Retrouvez-nous aux MediaDays Solutions');
  });
});

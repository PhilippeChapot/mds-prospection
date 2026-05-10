import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDocumentLinks, getCommunicationKit } from './documents';

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

  it('signature email HTML FR contient le tagline francais', () => {
    const kit = getCommunicationKit('fr');
    expect(kit.emailSignatureHtml).toContain('Retrouvez-moi à MDS Solutions 2026');
    expect(kit.emailSignatureHtml).toContain('test.mediadays.solutions');
    expect(kit.emailSignatureHtml).toContain('<table');
  });

  it('signature email HTML EN contient le tagline anglais', () => {
    const kit = getCommunicationKit('en');
    expect(kit.emailSignatureHtml).toContain('Find me at MDS Solutions 2026');
  });
});

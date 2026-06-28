import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BRAND_COLORS,
  EVENT_DATES,
  getEventDates,
  getEventLogos,
  adaptiveFontSize,
  slugify,
  getExhibitorWording,
  fetchLogoAsDataUrl,
} from './index';

describe('social-assets — helpers (P5.x.14)', () => {
  describe('BRAND_COLORS', () => {
    it('contient les couleurs MDS attendues', () => {
      expect(BRAND_COLORS.MDS_BLUE).toBe('#294294');
      expect(BRAND_COLORS.MDS_BLUE_DARK).toBe('#1a3170');
      expect(BRAND_COLORS.GRADIENT_BLUE).toContain('linear-gradient');
      expect(BRAND_COLORS.WHITE).toBe('#FFFFFF');
    });
  });

  describe('EVENT_DATES + getEventDates', () => {
    it('retourne les bonnes dates FR par defaut', () => {
      const d = getEventDates();
      expect(d.paris).toBe('Paris · 15 décembre');
      expect(d.marseille).toBe('Marseille · 10 décembre');
    });

    it('retourne les dates EN si locale en', () => {
      const d = getEventDates('en');
      expect(d.paris).toBe(EVENT_DATES.PARIS_EN);
      expect(d.marseille).toBe(EVENT_DATES.MARSEILLE_EN);
    });
  });

  describe('getEventLogos', () => {
    it('genere les URLs MDS + PRS avec baseUrl fourni', () => {
      const logos = getEventLogos('https://example.com');
      expect(logos.mds).toBe('https://example.com/brand/MDSLogo_final_blanc_rond.png');
      expect(logos.prs).toBe('https://example.com/brand/PRS-LogoBlanc-badge.png');
    });
  });

  describe('adaptiveFontSize', () => {
    it('retourne base pour nom court (<=10)', () => {
      expect(adaptiveFontSize('Hello')).toBe(88);
      expect(adaptiveFontSize('0123456789')).toBe(88); // 10 chars
    });

    it('reduit progressivement selon longueur', () => {
      expect(adaptiveFontSize('a'.repeat(15))).toBe(64); // <=20 -> 73% de 88
      expect(adaptiveFontSize('a'.repeat(30))).toBe(44); // <=35 -> 50%
      expect(adaptiveFontSize('a'.repeat(50))).toBe(32); // >35 -> 36%
    });

    it('respecte le parametre base custom (pour LinkedIn cover)', () => {
      expect(adaptiveFontSize('Short', 64)).toBe(64);
      expect(adaptiveFontSize('a'.repeat(15), 64)).toBe(47); // 73% de 64
    });
  });

  describe('slugify', () => {
    it('nettoie diacritiques + lowercase + tirets', () => {
      expect(slugify('MediaDays Solutions')).toBe('mediadays-solutions');
      expect(slugify('Société Étoile')).toBe('societe-etoile');
      expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
    });

    it('limite a 50 chars', () => {
      const long = 'a'.repeat(100);
      expect(slugify(long).length).toBeLessThanOrEqual(50);
    });
  });

  describe('getExhibitorWording', () => {
    it('PRS -> AU singulier FR', () => {
      expect(getExhibitorWording('prs_exhibitor')).toBe("J'EXPOSE AU");
    });

    it('autres -> AUX pluriel FR', () => {
      expect(getExhibitorWording('standard')).toBe("J'EXPOSE AUX");
      expect(getExhibitorWording('non_eligible')).toBe("J'EXPOSE AUX");
      expect(getExhibitorWording(null)).toBe("J'EXPOSE AUX");
    });
  });

  describe('fetchLogoAsDataUrl', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('retourne null si logoUrl est null', async () => {
      const result = await fetchLogoAsDataUrl(null);
      expect(result).toBeNull();
    });

    it('retourne data URL base64 quand fetch OK', async () => {
      const fakeBuf = new TextEncoder().encode('PNGDATA').buffer;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeBuf),
        headers: { get: () => 'image/png' },
      } as unknown as Response);

      const result = await fetchLogoAsDataUrl('https://example.com/logo.png');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('retourne null quand fetch echoue (status non-OK)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
      } as unknown as Response);

      const result = await fetchLogoAsDataUrl('https://example.com/missing.png');
      expect(result).toBeNull();
    });

    it('retourne null quand fetch throw', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
      const result = await fetchLogoAsDataUrl('https://example.com/logo.png');
      expect(result).toBeNull();
    });
  });
});

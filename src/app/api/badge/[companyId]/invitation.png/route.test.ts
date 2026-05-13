/**
 * @vitest-environment node
 *
 * P5.x.16 — smoke tests GET /api/badge/[id]/invitation.png.
 *
 * On mock next/og (eviter le runtime Satori en unit test) et le client
 * Supabase. Cas couverts :
 *   - 404 quand la company est introuvable
 *   - 200 + image/png pour MDS standard (sans logo -> fallback nom)
 *   - 200 pour PRS exhibitor (rendu inclut le 2e logo)
 *   - filename suit le pattern `invitation-mds-2026-<slug>.png`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const imageResponseSpy = vi.fn();

vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(node: unknown, opts: unknown) {
      imageResponseSpy(node, opts);
      return new Response('mocked-png', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
  },
}));

type FakeCompany = {
  id: string;
  name: string;
  category: 'standard' | 'prs_exhibitor' | 'non_eligible' | null;
  logo_url: string | null;
};

let fakeCompany: FakeCompany | null = null;

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: fakeCompany, error: null }),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  imageResponseSpy.mockClear();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: { get: () => null },
  } as unknown as Response);
});

describe('GET /api/badge/[companyId]/invitation.png (P5.x.16)', () => {
  it('404 quand la company est introuvable', async () => {
    fakeCompany = null;
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/badge/xxx/invitation.png'), {
      params: Promise.resolve({ companyId: 'xxx' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + image/png pour MDS standard sans logo (fallback nom)', async () => {
    fakeCompany = {
      id: 'cmp-1',
      name: 'Acme Media',
      category: 'standard',
      logo_url: null,
    };
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/badge/cmp-1/invitation.png'), {
      params: Promise.resolve({ companyId: 'cmp-1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(imageResponseSpy).toHaveBeenCalledOnce();
    const [, opts] = imageResponseSpy.mock.calls[0];
    expect(opts).toMatchObject({ width: 1200, height: 800 });
    expect((opts as { headers: Record<string, string> }).headers['Content-Disposition']).toContain(
      'invitation-mds-2026-acme-media.png',
    );
  });

  it('200 pour un PRS exhibitor (rendu inclut le 2e logo)', async () => {
    fakeCompany = {
      id: 'cmp-2',
      name: 'Radio Lab',
      category: 'prs_exhibitor',
      logo_url: null,
    };
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/badge/cmp-2/invitation.png'), {
      params: Promise.resolve({ companyId: 'cmp-2' }),
    });
    expect(res.status).toBe(200);
    expect(imageResponseSpy).toHaveBeenCalledOnce();
    const [, opts] = imageResponseSpy.mock.calls[0];
    expect(opts).toMatchObject({ width: 1200, height: 800 });
    expect((opts as { headers: Record<string, string> }).headers['Content-Disposition']).toContain(
      'radio-lab',
    );
  });

  it('slug bien forme meme avec caracteres speciaux dans le nom', async () => {
    fakeCompany = {
      id: 'cmp-3',
      name: 'Société Étoile — Média & Co!',
      category: 'standard',
      logo_url: null,
    };
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/badge/cmp-3/invitation.png'), {
      params: Promise.resolve({ companyId: 'cmp-3' }),
    });
    expect(res.status).toBe(200);
    const [, opts] = imageResponseSpy.mock.calls[0];
    const disposition = (opts as { headers: Record<string, string> }).headers[
      'Content-Disposition'
    ];
    // Diacritiques retires, espaces et caracteres speciaux -> tirets,
    // pas de tirets multiples consecutifs ni en debut/fin.
    expect(disposition).toMatch(/invitation-mds-2026-societe-etoile-media-co\.png/);
  });
});

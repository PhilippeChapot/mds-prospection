/**
 * @vitest-environment node
 *
 * P5.x.15 — smoke tests GET /api/badge/[id]/story-instagram.png.
 *
 * On mock next/og (eviter de demarrer le runtime Satori/wasm en unit
 * test) et getSupabaseServiceClient (eviter env supabase). Le but est
 * de verifier que la route :
 *   - renvoie 404 si la company est introuvable
 *   - construit bien un ImageResponse pour un MDS standard
 *   - construit bien un ImageResponse pour un PRS partner
 *   - ne plante pas quand company.logo_url est null (fallback nom)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const imageResponseSpy = vi.fn();

// `new ImageResponse(...)` est utilise dans la route : le mock doit donc
// etre un constructor qui retourne une `Response`. ES2022 autorise un
// constructor a retourner un objet different de `this`, donc on s'appuie
// dessus pour renvoyer directement une Response (utilisable comme valeur
// de retour de la route handler).
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

// Pas de fetch reseau pour logo_url null -> on neutralise tout de meme.
beforeEach(() => {
  imageResponseSpy.mockClear();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: { get: () => null },
  } as unknown as Response);
});

describe('GET /api/badge/[companyId]/story-instagram.png (P5.x.15)', () => {
  it('404 quand la company est introuvable', async () => {
    fakeCompany = null;
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/badge/xxx/story-instagram.png'), {
      params: Promise.resolve({ companyId: 'xxx' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 + image/png pour une MDS standard sans logo (fallback nom)', async () => {
    fakeCompany = {
      id: 'cmp-1',
      name: 'Acme Media',
      category: 'standard',
      logo_url: null,
    };
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/badge/cmp-1/story-instagram.png'), {
      params: Promise.resolve({ companyId: 'cmp-1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(imageResponseSpy).toHaveBeenCalledOnce();
    const [, opts] = imageResponseSpy.mock.calls[0];
    expect(opts).toMatchObject({ width: 1080, height: 1920 });
    expect((opts as { headers: Record<string, string> }).headers['Content-Disposition']).toContain(
      'story-instagram-mds-2026-acme-media.png',
    );
  });

  it('200 pour un PRS partner (rendu inclut le 2eme logo)', async () => {
    fakeCompany = {
      id: 'cmp-2',
      name: 'Radio Lab',
      category: 'prs_exhibitor',
      logo_url: null,
    };
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/badge/cmp-2/story-instagram.png'), {
      params: Promise.resolve({ companyId: 'cmp-2' }),
    });
    expect(res.status).toBe(200);
    expect(imageResponseSpy).toHaveBeenCalledOnce();
    const [, opts] = imageResponseSpy.mock.calls[0];
    expect(opts).toMatchObject({ width: 1080, height: 1920 });
    // Filename slugify "Radio Lab" -> "radio-lab".
    expect((opts as { headers: Record<string, string> }).headers['Content-Disposition']).toContain(
      'radio-lab',
    );
  });
});

/**
 * @vitest-environment node
 *
 * P5.x.17-ter — tests POST /[locale]/espace-partenaire/logout.
 *
 * Garanties testees :
 *   - POST -> 303 redirect /[locale]/espace-partenaire + delete cookie
 *   - locale=en -> redirect /en/espace-partenaire
 *   - GET n'est PAS exporte (la route ne doit pas etre prefetchable
 *     par <Link>, sinon Next.js tue la session apres login)
 *
 * On mock next/headers pour observer le delete().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteSpy = vi.fn();

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      delete: (name: string) => deleteSpy(name),
    }),
}));

beforeEach(() => {
  deleteSpy.mockClear();
});

describe('POST /[locale]/espace-partenaire/logout (P5.x.17-ter)', () => {
  it('POST -> 303 redirect /fr/espace-partenaire + cookie delete', async () => {
    const { POST } = await import('./route');
    const req = new Request('https://example.com/fr/espace-partenaire/logout', {
      method: 'POST',
    });
    const res = await POST(req, { params: Promise.resolve({ locale: 'fr' }) });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/fr/espace-partenaire');
    expect(deleteSpy).toHaveBeenCalledWith('espace_partenaire_session');
  });

  it('locale=en -> redirect /en/espace-partenaire', async () => {
    const { POST } = await import('./route');
    const req = new Request('https://example.com/en/espace-partenaire/logout', {
      method: 'POST',
    });
    const res = await POST(req, { params: Promise.resolve({ locale: 'en' }) });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/en/espace-partenaire');
  });

  it("n'exporte PAS de handler GET (anti-prefetch)", async () => {
    // P5.x.17-ter : empeche une regression vers la variante GET, qui
    // est prefetchee par les <Link> et tuait la session.
    const route = await import('./route');
    expect('GET' in route).toBe(false);
  });
});

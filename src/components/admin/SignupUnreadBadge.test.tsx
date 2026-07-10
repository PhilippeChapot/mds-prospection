/**
 * @vitest-environment jsdom
 *
 * MDS-Prospection-SignupNotifs+Badge — tests SignupUnreadBadge.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SignupUnreadBadge } from './SignupUnreadBadge';

function mockFetchCount(count: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ count }),
    })),
  );
}

describe('SignupUnreadBadge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('count=0 -> ne rend rien', async () => {
    mockFetchCount(0);
    const { container } = render(<SignupUnreadBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('count=3 -> affiche "3"', async () => {
    mockFetchCount(3);
    render(<SignupUnreadBadge />);
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('count>9 -> affiche "9+"', async () => {
    mockFetchCount(14);
    render(<SignupUnreadBadge />);
    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  it('fetch KO -> reste invisible sans throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const { container } = render(<SignupUnreadBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

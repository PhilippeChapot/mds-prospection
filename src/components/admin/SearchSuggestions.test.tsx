/**
 * @vitest-environment jsdom
 *
 * P5.x.SearchFuzzy — tests SearchSuggestions component.
 *
 * Couvre :
 *   - Renders null si suggestions vide.
 *   - Renders 1 chip par suggestion.
 *   - Click sur chip → router.push avec param key=value.
 *   - Use 'use client' confirme (sinon onClick crash SSR).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchSuggestions } from './SearchSuggestions';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('q=oldquery&page=3&pole=POLE_X'),
}));

describe('SearchSuggestions (P5.x.SearchFuzzy)', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('Renders null si suggestions vide', () => {
    const { container } = render(<SearchSuggestions suggestions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('Renders 1 button par suggestion', () => {
    render(
      <SearchSuggestions
        suggestions={[
          { id: '1', label: 'Mediarun' },
          { id: '2', label: 'Aircheck' },
          { id: '3', label: 'Media Speak' },
        ]}
      />,
    );
    expect(screen.getByText('Mediarun')).toBeTruthy();
    expect(screen.getByText('Aircheck')).toBeTruthy();
    expect(screen.getByText('Media Speak')).toBeTruthy();
  });

  it('Click → router.push avec param key remplace + reset pagination', () => {
    render(<SearchSuggestions suggestions={[{ id: '1', label: 'Mediarun' }]} />);
    fireEvent.click(screen.getByText('Mediarun'));
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0][0] as string;
    // q remplace par 'Mediarun', page supprime, autres params preserves.
    expect(url).toContain('q=Mediarun');
    expect(url).toContain('pole=POLE_X');
    expect(url).not.toContain('page=');
  });

  it('Custom paramKey + title (i18n)', () => {
    render(
      <SearchSuggestions
        suggestions={[{ id: '1', label: 'Foo' }]}
        paramKey="search"
        title="Did you mean:"
      />,
    );
    expect(screen.getByText('Did you mean:')).toBeTruthy();
    fireEvent.click(screen.getByText('Foo'));
    const url = pushMock.mock.calls[0][0] as string;
    expect(url).toContain('search=Foo');
  });

  it('Default title FR : "Vouliez-vous dire :"', () => {
    render(<SearchSuggestions suggestions={[{ id: '1', label: 'Foo' }]} />);
    expect(screen.getByText('Vouliez-vous dire :')).toBeTruthy();
  });
});

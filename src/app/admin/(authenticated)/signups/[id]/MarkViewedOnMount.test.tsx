/**
 * @vitest-environment jsdom
 *
 * MDS-Prospection-SignupNotifs+Badge — MarkViewedOnMount appelle
 * markSignupViewed au mount client reel (jamais depuis le render SSR seul,
 * cf. [[feedback_no_destructive_get]]).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const markSignupViewedMock = vi.fn(async (_signupId: string) => ({ success: true }));

vi.mock('./actions', () => ({
  markSignupViewed: (signupId: string) => markSignupViewedMock(signupId),
}));

import { MarkViewedOnMount } from './MarkViewedOnMount';

describe('MarkViewedOnMount', () => {
  afterEach(() => {
    markSignupViewedMock.mockClear();
  });

  it('mount -> appelle markSignupViewed(signupId) une fois', async () => {
    const { container } = render(<MarkViewedOnMount signupId="sig-1" />);
    await waitFor(() => expect(markSignupViewedMock).toHaveBeenCalledWith('sig-1'));
    expect(markSignupViewedMock).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});

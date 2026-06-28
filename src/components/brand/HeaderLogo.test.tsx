import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderLogo } from './HeaderLogo';

describe('HeaderLogo — SPEC §3.31 logo contextuel', () => {
  it('category="prs_exhibitor" -> logo PRS uniquement', () => {
    render(<HeaderLogo category="prs_exhibitor" />);
    expect(screen.queryByTestId('header-logo-mds')).not.toBeInTheDocument();
    expect(screen.queryByTestId('header-logo-divider')).not.toBeInTheDocument();
    expect(screen.getByTestId('header-logo-prs')).toBeInTheDocument();
    expect(screen.getByAltText('Paris Radio Show 2026')).toHaveAttribute(
      'src',
      '/brand/PRS-LogoBlanc2026.svg',
    );
  });

  it('category="standard" -> logo MDS uniquement', () => {
    render(<HeaderLogo category="standard" />);
    expect(screen.getByTestId('header-logo-mds')).toBeInTheDocument();
    expect(screen.queryByTestId('header-logo-divider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('header-logo-prs')).not.toBeInTheDocument();
    expect(screen.getByAltText('MediaDays Solutions 2026')).toHaveAttribute(
      'src',
      '/brand/MDSLogo_final_blanc_ligne.svg',
    );
  });

  it('category="non_eligible" -> les deux logos (fallback)', () => {
    render(<HeaderLogo category="non_eligible" />);
    expect(screen.getByTestId('header-logo-mds')).toBeInTheDocument();
    expect(screen.getByTestId('header-logo-divider')).toBeInTheDocument();
    expect(screen.getByTestId('header-logo-prs')).toBeInTheDocument();
  });

  it('category="admin" -> les deux logos (vue editoriale)', () => {
    render(<HeaderLogo category="admin" />);
    expect(screen.getByTestId('header-logo-mds')).toBeInTheDocument();
    expect(screen.getByTestId('header-logo-divider')).toBeInTheDocument();
    expect(screen.getByTestId('header-logo-prs')).toBeInTheDocument();
  });

  it('theme="light" -> bascule sur les versions Bleu', () => {
    render(<HeaderLogo category="admin" theme="light" />);
    expect(screen.getByAltText('MediaDays Solutions 2026')).toHaveAttribute(
      'src',
      '/brand/MDSLogo_final_bleu_ligne.svg',
    );
    expect(screen.getByAltText('Paris Radio Show 2026')).toHaveAttribute(
      'src',
      '/brand/PRS-LogoBleu2026.svg',
    );
  });
});

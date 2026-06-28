/**
 * @vitest-environment jsdom
 *
 * Lot 3 — redesign section pôles Havas :
 *   1. REGIES_RETAIL_MEDIA en dernière position (index 5)
 *   2. Wordings FR conformes au docx (5 pôles MDS)
 *   3. Wordings EN présents et non vides
 *   4. Card MDS : border-2 border-[#0D1D6D] bg-white
 *   5. Card REGIES : border-dashed + badge "Hall séparé"
 *   6. EN locale : badge "Separate hall"
 */

import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { PolesExplorer } from './PolesExplorer';
import { getTaxonomy } from '@/lib/landing/taxonomy';
import { renderI18n } from './__test-helpers__/i18n-render';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';

const { poles } = getTaxonomy();

describe('Lot 3 — ordre pôles', () => {
  it('REGIES_RETAIL_MEDIA est en derniere position (index 5)', () => {
    expect(poles[5].code).toBe('REGIES_RETAIL_MEDIA');
  });

  it('les 5 premiers poles sont tous mediadays_solutions', () => {
    for (const pole of poles.slice(0, 5)) {
      expect(pole.category).toBe('mediadays_solutions');
    }
  });
});

describe('Lot 3 — wordings FR (docx Havas)', () => {
  it('AUDIO_RADIO description docx exacte', () => {
    expect(frMessages.landing.poles.AUDIO_RADIO.description).toBe(
      'Les solutions audio au service des radios, plateformes et régies — Un pôle historique au cœur du Paris Radio Show',
    );
  });

  it('DIFFUSION_INFRA description docx exacte', () => {
    expect(frMessages.landing.poles.DIFFUSION_INFRA.description).toBe(
      'Les solutions pour distribuer, transporter et diffuser les contenus médias — Cloud, réseaux, broadcast, opérateurs FM / DAB+ / TNT / 5G',
    );
  });

  it('VIDEO_CTV description docx exacte', () => {
    expect(frMessages.landing.poles.VIDEO_CTV.description).toBe(
      'Les solutions pour produire, distribuer, analyser et monétiser les contenus vidéo — CTV, plateformes, adtech, analytics et production vidéo professionnelle',
    );
  });

  it('OUTDOOR_DOOH description docx exacte', () => {
    expect(frMessages.landing.poles.OUTDOOR_DOOH.description).toContain(
      "Les solutions technologiques de l'affichage digital et du DOOH",
    );
  });

  it('DATA_ADTECH description docx exacte', () => {
    expect(frMessages.landing.poles.DATA_ADTECH.description).toBe(
      'Les solutions data et publicitaires au cœur de la performance des médias — Adtech, data, mesure, IA marketing et technologies de retail media',
    );
  });
});

describe('Lot 3 — wordings EN présents', () => {
  it('tous les poles ont une description EN non vide', () => {
    for (const code of [
      'AUDIO_RADIO',
      'DIFFUSION_INFRA',
      'VIDEO_CTV',
      'OUTDOOR_DOOH',
      'DATA_ADTECH',
      'REGIES_RETAIL_MEDIA',
    ] as const) {
      expect(enMessages.landing.poles[code].description).toBeTruthy();
    }
  });

  it('AUDIO_RADIO EN mentionne Paris Radio Show', () => {
    expect(enMessages.landing.poles.AUDIO_RADIO.description).toContain('Paris Radio Show');
  });
});

describe('Lot 3 — design cards PRS bleu', () => {
  it('card MDS (AUDIO_RADIO) a border-[#0D1D6D] dans className', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const audio = poles.find((p) => p.code === 'AUDIO_RADIO')!;
    const card = screen.getAllByText(audio.name)[0].closest('button');
    expect(card?.className).toContain('border-[#0D1D6D]');
    expect(card?.className).toContain('bg-white');
  });

  it('card REGIES a border-dashed dans className', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const regies = poles.find((p) => p.code === 'REGIES_RETAIL_MEDIA')!;
    const card = screen.getAllByText(regies.name)[0].closest('button');
    expect(card?.className).toContain('border-dashed');
  });

  it('badge "Hall separ" visible sur la card REGIES (FR)', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    expect(screen.getByText(/Hall séparé/)).toBeInTheDocument();
  });

  it('badge "Separate hall" visible sur la card REGIES (EN)', () => {
    renderI18n(<PolesExplorer poles={poles} />, { locale: 'en' });
    expect(screen.getByText(/Separate hall/)).toBeInTheDocument();
  });
});

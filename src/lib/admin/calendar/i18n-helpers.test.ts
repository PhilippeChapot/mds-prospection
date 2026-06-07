/**
 * @vitest-environment node
 *
 * P14.1.HOTFIX-i18n-Calendar — tests des helpers de traduction.
 */

import { describe, it, expect } from 'vitest';
import {
  getStatusLabel,
  getOutcomeLabel,
  getEventTypeLabel,
  getEventTypeShortLabel,
  getPriorityLabel,
  COMMON_OUTCOME_VALUES,
} from './i18n-helpers';

describe('getStatusLabel (P14.1 i18n)', () => {
  it('FR : pending → "En attente"', () => {
    expect(getStatusLabel('pending', 'fr')).toBe('En attente');
  });
  it('FR : done → "Fait"', () => {
    expect(getStatusLabel('done', 'fr')).toBe('Fait');
  });
  it('EN : cancelled → "Cancelled"', () => {
    expect(getStatusLabel('cancelled', 'en')).toBe('Cancelled');
  });
  it('Default locale = fr', () => {
    expect(getStatusLabel('missed')).toBe('Manqué');
  });
});

describe('getOutcomeLabel (P14.1 i18n)', () => {
  it('FR : no_response → "Pas de réponse"', () => {
    expect(getOutcomeLabel('no_response', 'fr')).toBe('Pas de réponse');
  });
  it('FR : demo_booked → "Démo prise"', () => {
    expect(getOutcomeLabel('demo_booked', 'fr')).toBe('Démo prise');
  });
  it('FR : reached_recall_later → "Joint — à relancer"', () => {
    expect(getOutcomeLabel('reached_recall_later', 'fr')).toBe('Joint — à relancer');
  });
  it('EN : qualified → "Qualified"', () => {
    expect(getOutcomeLabel('qualified', 'en')).toBe('Qualified');
  });
  it('null → null', () => {
    expect(getOutcomeLabel(null)).toBeNull();
  });
  it('Outcome libre (non commun) → humanise underscores', () => {
    expect(getOutcomeLabel('custom_outcome_xyz')).toBe('custom outcome xyz');
  });
  it('Couvre les 8 cas COMMON_OUTCOME_VALUES', () => {
    for (const v of COMMON_OUTCOME_VALUES) {
      expect(getOutcomeLabel(v, 'fr')).toBeTruthy();
      expect(getOutcomeLabel(v, 'en')).toBeTruthy();
    }
  });
});

describe('getEventTypeLabel + getEventTypeShortLabel (P14.1 i18n)', () => {
  it('FR : call_relance long = "Appel de relance" / short = "Appel"', () => {
    expect(getEventTypeLabel('call_relance', 'fr')).toBe('Appel de relance');
    expect(getEventTypeShortLabel('call_relance', 'fr')).toBe('Appel');
  });
  it('EN : meeting long = "Meeting" / short = "Meeting"', () => {
    expect(getEventTypeLabel('meeting', 'en')).toBe('Meeting');
    expect(getEventTypeShortLabel('meeting', 'en')).toBe('Meeting');
  });
  it('FR : task = "Tâche"', () => {
    expect(getEventTypeLabel('task', 'fr')).toBe('Tâche');
  });
});

describe('getPriorityLabel (P14.1 i18n)', () => {
  it('FR : low/normal/high → Basse/Normale/Haute', () => {
    expect(getPriorityLabel('low', 'fr')).toBe('Basse');
    expect(getPriorityLabel('normal', 'fr')).toBe('Normale');
    expect(getPriorityLabel('high', 'fr')).toBe('Haute');
  });
  it('EN : low/normal/high → Low/Normal/High', () => {
    expect(getPriorityLabel('low', 'en')).toBe('Low');
    expect(getPriorityLabel('normal', 'en')).toBe('Normal');
    expect(getPriorityLabel('high', 'en')).toBe('High');
  });
});

describe('Regression : pas de leak anglais sur les rendus FR par defaut', () => {
  it('Aucune chaine "no response" ou "pending" en FR', () => {
    expect(getOutcomeLabel('no_response')).not.toMatch(/no response/i);
    expect(getStatusLabel('pending')).not.toMatch(/pending/i);
    expect(getStatusLabel('done')).not.toBe('done');
  });
});

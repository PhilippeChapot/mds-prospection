import { describe, it, expect } from 'vitest';
import { capitalizeName } from './name';

describe('capitalizeName (P5.x.3)', () => {
  it('lowercase simple -> capitalize', () => {
    expect(capitalizeName('phil')).toBe('Phil');
  });

  it('uppercase mixte -> normalise puis capitalize', () => {
    expect(capitalizeName('PHIL')).toBe('Phil');
    expect(capitalizeName('JEAN-Pierre')).toBe('Jean-Pierre');
  });

  it('multi-mot espace -> chaque mot capitalize', () => {
    expect(capitalizeName('marie claire')).toBe('Marie Claire');
  });

  it('compose tiret -> chaque sous-token capitalize', () => {
    expect(capitalizeName('jean-pierre')).toBe('Jean-Pierre');
    expect(capitalizeName('marie-claude')).toBe('Marie-Claude');
  });

  it('apostrophe -> capitalize apres aussi', () => {
    expect(capitalizeName("d'arc")).toBe("D'Arc");
    expect(capitalizeName("o'brien")).toBe("O'Brien");
  });

  it('vide / null / undefined -> empty string', () => {
    expect(capitalizeName('')).toBe('');
    expect(capitalizeName(null)).toBe('');
    expect(capitalizeName(undefined)).toBe('');
  });

  it('trim leading/trailing whitespace', () => {
    expect(capitalizeName('  phil  ')).toBe('Phil');
  });

  it('caracteres unicode (accents)', () => {
    expect(capitalizeName('édouard')).toBe('Édouard');
    expect(capitalizeName('chloé')).toBe('Chloé');
  });

  it('whitespace seul -> empty', () => {
    expect(capitalizeName('   ')).toBe('');
  });
});

/**
 * @vitest-environment node
 *
 * P14.1.SalesCalendarCore (Commit 4) — tests template Resend calendar-reminder.
 */

import { describe, it, expect } from 'vitest';
import { renderCalendarReminder } from './calendar-reminder';

const BASE_PARAMS = {
  recipientFirstName: 'Phil',
  eventTitle: 'Relance Acme',
  eventType: 'call_relance' as const,
  startAt: '2026-06-08T14:00:00.000Z', // = 16:00 Paris CEST
  endAt: '2026-06-08T14:30:00.000Z',
  location: null,
  description: null,
  prospectCompanyName: null,
  prospectUrl: null,
  calendarUrl: 'https://www.mediadays.solutions/admin/calendar',
};

describe('renderCalendarReminder (P14.1 Commit 4)', () => {
  it('Subject 24h FR contient prefix [MDS] + "Demain"', () => {
    const tpl = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_24h',
      locale: 'fr',
    });
    expect(tpl.subject).toMatch(/^\[MDS\]/);
    expect(tpl.subject).toMatch(/Demain à 16:00/);
    expect(tpl.subject).toContain('Relance Acme');
  });

  it('Subject 1h FR contient "Dans 1h"', () => {
    const tpl = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_1h',
      locale: 'fr',
    });
    expect(tpl.subject).toMatch(/Dans 1h/);
  });

  it('Subject 15min FR contient "Dans 15 minutes"', () => {
    const tpl = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_15min',
      locale: 'fr',
    });
    expect(tpl.subject).toMatch(/Dans 15 minutes/);
  });

  it('Subject EN 24h contient "Tomorrow at"', () => {
    const tpl = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_24h',
      locale: 'en',
    });
    expect(tpl.subject).toMatch(/Tomorrow at 16:00/);
  });

  it('HTML inclut bouton CTA vers calendarUrl', () => {
    const tpl = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_1h',
      locale: 'fr',
    });
    expect(tpl.html).toContain('https://www.mediadays.solutions/admin/calendar');
    expect(tpl.html).toMatch(/Voir dans le calendrier MDS/);
  });

  it('HTML/text incluent le prospect lie si fourni', () => {
    const tpl = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_24h',
      locale: 'fr',
      prospectCompanyName: 'Acme Radio',
      prospectUrl: 'https://x/admin/prospects/123',
    });
    expect(tpl.html).toContain('Acme Radio');
    expect(tpl.html).toContain('/admin/prospects/123');
    expect(tpl.text).toContain('Acme Radio');
  });

  it('HTML escape les caracteres dangereux (< > " &)', () => {
    const tpl = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_24h',
      locale: 'fr',
      eventTitle: '<script>alert("x")</script>',
    });
    expect(tpl.html).not.toMatch(/<script>/);
    expect(tpl.html).toMatch(/&lt;script&gt;/);
  });

  it('Locale FR : "bonjour Phil" / EN : "Hi Phil"', () => {
    const fr = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_1h',
      locale: 'fr',
    });
    expect(fr.text).toContain('Bonjour Phil,');
    const en = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_1h',
      locale: 'en',
    });
    expect(en.text).toContain('Hi Phil,');
  });

  it('Type label intro selon eventType', () => {
    const call = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_1h',
      locale: 'fr',
      eventType: 'call_relance',
    });
    expect(call.text).toMatch(/appel de relance/i);
    const meeting = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_1h',
      locale: 'fr',
      eventType: 'meeting',
    });
    expect(meeting.text).toMatch(/rendez-vous/i);
    const task = renderCalendarReminder({
      ...BASE_PARAMS,
      kind: 'reminder_1h',
      locale: 'fr',
      eventType: 'task',
    });
    expect(task.text).toMatch(/tâche/i);
  });
});

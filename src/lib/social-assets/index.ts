/**
 * Barrel exports — helpers partages entre badge social, banniere
 * LinkedIn, et tout futur asset social genere via next/og.
 *
 * P5.x.14 — extraction de la route /api/badge/[companyId]/badge.png.
 */

export { BRAND_COLORS } from './colors';
export { EVENT_DATES, getEventDates } from './dates';
export { getEventLogos } from './event-logos';
export { adaptiveFontSize, slugify } from './fallback-name';
export { fetchLogoAsDataUrl } from './fetch-logo';
export { getExhibitorWording } from './wording';

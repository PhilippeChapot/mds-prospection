/**
 * Cookies du flow public signup — noms centralises pour eviter divergence
 * entre /api/signup/init (set) et /api/signup/resend-doi (read).
 */

export const PENDING_SIGNUP_COOKIE = 'mds_pending_signup_id';
export const PENDING_SIGNUP_COOKIE_MAX_AGE_SECONDS = 60 * 60; // 1h

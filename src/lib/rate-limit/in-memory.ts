/**
 * Sliding-window rate limiter in-memory.
 *
 * Limites P3 :
 *   - /api/signup/init           : 5 / IP / heure
 *   - /api/signup/resend-doi     : 3 / signup_id / 10 min (not IP-based)
 *   - /api/public/companies/search : 30 / IP / minute
 *
 * LIMITATION CONNUE — Vercel serverless lance plusieurs instances en parallele,
 * chacune avec sa propre memoire. Cet implementation N'EST PAS un vrai rate
 * limit global : un attaquant suffisamment determine peut hitter assez de
 * concurrent requests pour multiplier les buckets. Pour un vrai rate limit
 * production, migrer vers Vercel KV / Upstash Redis (TODO P5).
 *
 * Ce module reste suffisant pour P3 contre les bots opportunistes + le
 * comportement utilisateur normal.
 */

interface Bucket {
  // Timestamps des requetes encore dans la fenetre.
  hits: number[];
}

const buckets = new Map<string, Bucket>();

// Nettoyage periodique des buckets vides (toutes les 10 min).
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(
    () => {
      const now = Date.now();
      for (const [key, bucket] of buckets) {
        // Si plus aucun hit dans la derniere heure, on peut drop.
        if (
          bucket.hits.length === 0 ||
          now - bucket.hits[bucket.hits.length - 1] > 60 * 60 * 1000
        ) {
          buckets.delete(key);
        }
      }
    },
    10 * 60 * 1000,
  );
  // Sur Node, on peut "unref" pour ne pas bloquer la sortie process.
  cleanupTimer?.unref?.();
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Identifiant unique du bucket (ex: `signup-init:1.2.3.4`). */
  key: string;
  /** Nombre max de hits dans la fenetre. */
  limit: number;
  /** Duree de la fenetre en secondes. */
  windowSeconds: number;
}

export function checkRateLimit({ key, limit, windowSeconds }: RateLimitOptions): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Drop hits hors fenetre.
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(retryAfter, 1) };
  }

  bucket.hits.push(now);
  return {
    ok: true,
    remaining: limit - bucket.hits.length,
    retryAfterSeconds: 0,
  };
}

/**
 * Util de tests : reset complet (utilise par vitest).
 */
export function _resetRateLimitForTests() {
  buckets.clear();
}

/**
 * safeServerAction — P5.x.7.pre.
 *
 * Wrapper client-side pour invoquer une Server Action sans intercepter
 * accidentellement le signal `NEXT_REDIRECT` que Next.js leve quand
 * l'action appelle `redirect()` (par ex. apres un delete reussi).
 *
 * Sans ce wrapper, le pattern naif :
 *
 *   try { await deleteProspectAction(id); }
 *   catch (e) { toast.error(e.message); }   // ← toast "NEXT_REDIRECT" trompeur
 *
 * affiche une fausse erreur toast meme quand l'action a reussi et a
 * just declenche un redirect HTTP. Le fix officiel est de re-throw le
 * signal redirect via `isRedirectError(err)` :
 * https://nextjs.org/docs/app/api-reference/functions/redirect#redirect-server-actions
 *
 * Le helper centralise ce pattern et garantit qu'il est applique partout
 * — tout call site qui passe par `safeServerAction` est protege.
 */

import { toast } from 'sonner';

/**
 * Detecte le signal `NEXT_REDIRECT` que Next.js leve quand une Server
 * Action appelle `redirect()`. Implementation inline (pas d'import
 * depuis next/dist/* qui est un chemin interne instable) : on verifie
 * juste la shape du digest, qui est stable depuis Next 13+.
 *
 * Format : `NEXT_REDIRECT;<type>;<url>;<statusCode>;`
 */
function isRedirectError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

export interface SafeServerActionOptions {
  /** Message toast affiche en cas d'erreur reelle (pas redirect). */
  errorMessage?: string;
  /**
   * Si fourni, override le toast par defaut. Recoit l'erreur, peut
   * formatter un message custom (ex: e.message tronque).
   */
  onError?: (error: unknown) => void;
  /**
   * Si false, ne log pas l'erreur en console. Defaut true.
   */
  logToConsole?: boolean;
}

/**
 * Execute la Server Action `action`. Re-throw le signal `NEXT_REDIRECT`
 * pour que Next.js puisse rediriger comme prevu. En cas d'erreur reelle,
 * affiche un toast et retourne `undefined`.
 *
 * Retourne le resultat de l'action en cas de succes, `undefined` en cas
 * d'erreur metier (le caller peut tester `result === undefined`).
 *
 * Toujours utiliser ce wrapper plutot qu'un try/catch nu autour d'une
 * Server Action qui peut potentiellement appeler redirect().
 */
export async function safeServerAction<T>(
  action: () => Promise<T>,
  options: SafeServerActionOptions | string = {},
): Promise<T | undefined> {
  // Surcharge ergonomique : safeServerAction(fn, "Erreur lors de X").
  const opts: SafeServerActionOptions =
    typeof options === 'string' ? { errorMessage: options } : options;
  const errorMessage = opts.errorMessage ?? 'Une erreur est survenue.';
  const logToConsole = opts.logToConsole !== false;

  try {
    return await action();
  } catch (err) {
    // CRITIQUE : isRedirectError detecte le signal Next.js et on le
    // re-throw pour que le framework gere le redirect HTTP. Sans ca,
    // le redirect est intercepte et le toast affiche "NEXT_REDIRECT".
    if (isRedirectError(err)) {
      throw err;
    }
    if (logToConsole) {
      console.error('[safeServerAction] action-failed', err);
    }
    if (opts.onError) {
      opts.onError(err);
    } else {
      toast.error(err instanceof Error ? err.message || errorMessage : errorMessage);
    }
    return undefined;
  }
}

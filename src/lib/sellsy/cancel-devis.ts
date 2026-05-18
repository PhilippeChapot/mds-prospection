/**
 * P6.x.5-nonies — Helpers Sellsy V2 pour la sécurisation de la ré-émission
 * de devis (annuler l'ancien quand un nouveau est créé).
 *
 * Format Sellsy V2 audité depuis l'OpenAPI officiel
 * (api.sellsy.com/doc/v2/dist/sellsy.v2.latest.yaml) :
 *
 *   PUT /estimates/{id}/status
 *     body : { status: 'cancelled' }  (enum complet :
 *       draft | sent | read | accepted | refused | expired | advanced |
 *       partialinvoiced | invoiced | cancelled)
 *
 *   POST /comments
 *     body : { description: <texte>, related: [{ id: <devisId>, type: 'estimate' }] }
 *     (cf. CommentItem.related[].type enum incluant 'estimate')
 *
 * Tous best-effort : si l'API Sellsy refuse (devis déjà payé, déjà accepté,
 * permission OAuth manquante, etc.), on log + retourne { ok:false } SANS
 * throw. L'appelant continue avec le nouveau devis (l'admin sera notifié
 * via toast UI / audit log).
 */

import { sellsyFetch, SellsyError } from './client';

const LOG_PREFIX = '[sellsy/cancel-devis]';

export interface CancelDevisInput {
  /** ID Sellsy numérique du devis à annuler. */
  sellsy_devis_id: number;
  /** Raison libre — incluse dans le commentaire ajouté à l'ancien devis. */
  reason?: string;
}

export interface CancelDevisResult {
  ok: boolean;
  /** true si le statut Sellsy a été passé à 'cancelled' avec succès. */
  cancelled: boolean;
  /** Message d'erreur ou diagnostic, si !ok. */
  message?: string;
}

export async function cancelSellsyDevis(input: CancelDevisInput): Promise<CancelDevisResult> {
  try {
    await sellsyFetch<unknown>(`/estimates/${input.sellsy_devis_id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    });
    console.log(
      '%s cancelled devis=%d reason=%s',
      LOG_PREFIX,
      input.sellsy_devis_id,
      input.reason ?? '-',
    );
    return { ok: true, cancelled: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let bodyDetails = '';
    if (err instanceof SellsyError && err.body) {
      try {
        bodyDetails = ` — body: ${JSON.stringify(err.body).slice(0, 300)}`;
      } catch {
        /* noop */
      }
    }
    console.warn(
      '%s cancel-failed devis=%d msg=%s%s',
      LOG_PREFIX,
      input.sellsy_devis_id,
      msg,
      bodyDetails,
    );
    return { ok: false, cancelled: false, message: `${msg}${bodyDetails}` };
  }
}

export interface AddCommentInput {
  /** ID Sellsy du devis (ou autre entité supportée, ex: invoice) sur lequel
   *  attacher le commentaire. */
  sellsy_devis_id: number;
  /** Texte libre. Sellsy l'affiche dans l'onglet "Commentaires" du devis. */
  comment: string;
}

export interface AddCommentResult {
  ok: boolean;
  message?: string;
}

export async function addCommentToSellsyDevis(input: AddCommentInput): Promise<AddCommentResult> {
  try {
    await sellsyFetch<unknown>('/comments', {
      method: 'POST',
      body: JSON.stringify({
        description: input.comment,
        related: [{ id: input.sellsy_devis_id, type: 'estimate' }],
      }),
    });
    console.log('%s comment-added devis=%d', LOG_PREFIX, input.sellsy_devis_id);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('%s comment-failed devis=%d msg=%s', LOG_PREFIX, input.sellsy_devis_id, msg);
    return { ok: false, message: msg };
  }
}

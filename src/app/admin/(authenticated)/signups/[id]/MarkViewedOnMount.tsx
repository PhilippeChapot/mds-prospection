'use client';

/**
 * MDS-Prospection-SignupNotifs+Badge — declenche markSignupViewed() au mount
 * client reel (jamais au render du Server Component, cf. doctrine
 * [[feedback_no_destructive_get]] : le prefetch <Link> de la liste
 * /admin/signups ne doit pas marquer la fiche vue toute seule).
 */

import { useEffect } from 'react';
import { markSignupViewed } from './actions';

export function MarkViewedOnMount({ signupId }: { signupId: string }) {
  useEffect(() => {
    markSignupViewed(signupId).catch(() => {
      /* silencieux — badge restera juste a jour au prochain polling */
    });
  }, [signupId]);

  return null;
}

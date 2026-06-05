'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RotateCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const COOLDOWN_SECONDS = 60;

/**
 * Bouton "Renvoyer l'email DOI".
 *
 * Cote client : cooldown 60s entre clics, max 3 appels/heure (le serveur
 * applique aussi un rate limit).
 *
 * Le serveur identifie le signup par email (le maskedEmail affiche est
 * juste informatif, le serveur regarde le pending awaiting_verification
 * du moment via cookie/session). En P3 simple : on demande au user de
 * recommencer si erreur.
 */
export function ResendDoiButton() {
  const t = useTranslations('signup.checkEmail');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'maxed' | 'error'>('idle');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleResend() {
    setState('sending');
    try {
      const res = await fetch('/api/signup/resend-doi', { method: 'POST' });
      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { retryAfter?: number };
        setCooldown(data.retryAfter ?? COOLDOWN_SECONDS);
        setState('idle');
        return;
      }
      if (res.status === 410) {
        setState('maxed');
        return;
      }
      if (!res.ok) {
        setState('error');
        return;
      }
      setState('sent');
      setCooldown(COOLDOWN_SECONDS);
      setTimeout(() => setState('idle'), 4000);
    } catch {
      setState('error');
    }
  }

  if (state === 'maxed') {
    return <p className="text-md-text-muted text-xs">{t('resendMaxed')}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleResend}
        disabled={state === 'sending' || cooldown > 0}
      >
        {state === 'sending' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('resend')}
          </>
        ) : state === 'sent' ? (
          <>
            <CheckCircle2 className="text-md-success h-3.5 w-3.5" aria-hidden />
            {t('resendDone')}
          </>
        ) : (
          <>
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            {t('resend')}
          </>
        )}
      </Button>
      {cooldown > 0 && state !== 'sent' && (
        <p className="text-md-text-muted text-xs">{t('resendCooldown', { seconds: cooldown })}</p>
      )}
    </div>
  );
}

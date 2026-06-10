'use client';

/**
 * P11.x — section Sécurité de la page profil partenaire.
 * Permet de définir, changer, ou supprimer son mot de passe.
 * 'use client' : handlers de formulaires + transitions.
 */

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  setPartnerPasswordAction,
  removePartnerPasswordAction,
} from '@/lib/auth/partner-password-actions';

interface Props {
  locale: 'fr' | 'en';
  passwordSetAt: string | null;
}

type DialogMode = 'set' | 'change' | null;

export function SecuritySection({ locale, passwordSetAt }: Props) {
  const t = useTranslations('espacePartenaire.security');
  const hasPassword = !!passwordSetAt;
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [isPending, startTransition] = useTransition();
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Form state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  function resetForm() {
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setErrorKey(null);
  }

  function openDialog(mode: DialogMode) {
    resetForm();
    setSuccessKey(null);
    setDialogMode(mode);
  }

  function handleSetOrChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setErrorKey('passwords_mismatch');
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const result = await setPartnerPasswordAction(locale, {
        current_password: dialogMode === 'change' ? currentPwd : undefined,
        new_password: newPwd,
      });
      if (!result.ok) {
        setErrorKey(result.error);
        return;
      }
      setSuccessKey('successSet');
      setDialogMode(null);
      resetForm();
    });
  }

  function handleRemove() {
    if (!window.confirm(t('removePasswordConfirm'))) return;
    startTransition(async () => {
      const result = await removePartnerPasswordAction(locale);
      if (!result.ok) {
        setErrorKey(result.error);
        return;
      }
      setSuccessKey('successRemoved');
    });
  }

  const formattedDate = passwordSetAt
    ? new Date(passwordSetAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const resolvedError = errorKey
    ? ['current_password_required', 'current_password_incorrect', 'passwords_mismatch'].includes(
        errorKey,
      )
      ? t(
          `error.${errorKey as 'current_password_required' | 'current_password_incorrect' | 'passwords_mismatch'}`,
        )
      : t('error.generic')
    : null;

  return (
    <section className="border-md-border bg-card space-y-4 rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-md-blue size-4 shrink-0" aria-hidden />
        <h3 className="text-md-text font-semibold">{t('title')}</h3>
      </div>

      {/* Status */}
      <div className="space-y-1.5 text-sm">
        <div className="text-md-text-muted flex items-center gap-2">
          <span className="text-green-700">✓</span>
          <span>{t('magicLinkAlwaysActive')}</span>
        </div>
        <div className="text-md-text-muted flex items-center gap-2">
          <KeyRound className="size-3.5 shrink-0" aria-hidden />
          {hasPassword && formattedDate ? (
            <span>{t('hasPassword', { date: formattedDate })}</span>
          ) : (
            <span>{t('noPassword')}</span>
          )}
        </div>
        {!hasPassword && <p className="text-md-text-muted text-xs">{t('noPasswordDesc')}</p>}
      </div>

      {/* Success toast */}
      {successKey && (
        <p className="text-md-success rounded-md bg-green-50 px-3 py-2 text-sm font-medium">
          ✓ {t(successKey as 'successSet' | 'successRemoved')}
        </p>
      )}

      {/* Actions */}
      {dialogMode === null && (
        <div className="flex flex-wrap gap-2">
          {!hasPassword ? (
            <Button size="sm" variant="outline" onClick={() => openDialog('set')}>
              {t('definePassword')}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => openDialog('change')}>
                {t('changePassword')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={handleRemove}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : t('removePassword')}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Inline form */}
      {dialogMode !== null && (
        <form onSubmit={handleSetOrChange} className="space-y-3">
          {dialogMode === 'change' && (
            <div className="space-y-1">
              <Label htmlFor="sec-current-pwd" className="text-xs font-semibold">
                {t('currentPasswordLabel')}
              </Label>
              <Input
                id="sec-current-pwd"
                type="password"
                autoComplete="current-password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                disabled={isPending}
                required
                className="h-8 text-sm"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="sec-new-pwd" className="text-xs font-semibold">
              {t('newPasswordLabel')}
            </Label>
            <Input
              id="sec-new-pwd"
              type="password"
              autoComplete="new-password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              disabled={isPending}
              required
              minLength={8}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sec-confirm-pwd" className="text-xs font-semibold">
              {t('confirmPasswordLabel')}
            </Label>
            <Input
              id="sec-confirm-pwd"
              type="password"
              autoComplete="new-password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              disabled={isPending}
              required
              minLength={8}
              className="h-8 text-sm"
            />
          </div>

          {resolvedError && (
            <p role="alert" className="text-destructive text-xs">
              {resolvedError}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending || !newPwd || !confirmPwd}>
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('save')
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setDialogMode(null);
                resetForm();
              }}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

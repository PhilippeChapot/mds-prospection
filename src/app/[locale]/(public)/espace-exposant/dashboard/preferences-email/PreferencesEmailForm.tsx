'use client';

import { useState, useTransition } from 'react';
import { Loader2, Lock, Save, AlertTriangle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  updateMyPreferencesAction,
  unsubscribeAllAction,
  resubscribeAction,
} from '@/lib/admin/contact-preferences/actions';
import {
  PREF_CATEGORIES,
  type ContactPreferencesRow,
  type LockKey,
  type PrefKey,
} from '@/lib/admin/contact-preferences/types';
import { cn } from '@/lib/utils';

/**
 * P8.2 — form self-service "Mes préférences email" cote contact.
 *
 * 7 categories avec Switch :
 *   - Pref non-locked : Switch editable.
 *   - Pref locked (xxx_locked_by_admin=true) : Switch grise + tooltip
 *     + lien mailto. Le trigger DB P8.1 revert silencieusement toute
 *     tentative de submit avec changement (defense in depth).
 * RGPD : bouton "Se désinscrire de tout" + modale raison.
 */

const COPY = {
  fr: {
    title: 'Mes préférences email',
    subtitle: 'Choisissez les communications que vous souhaitez recevoir de MediaDays Solutions.',
    lockedTooltip:
      'Défini par MediaDays Solutions — contactez-nous à philippe@mediadays.solutions pour modifier.',
    save: 'Enregistrer',
    saving: 'Enregistrement...',
    unsubAll: 'Se désinscrire de tout (RGPD)',
    resub: 'Me réinscrire',
    unsubbedTitle: 'Vous êtes désinscrit',
    unsubbedBody:
      'Vous ne recevez plus aucune communication de MediaDays Solutions. Cliquez ci-dessous pour vous réinscrire (vous devrez ensuite re-cocher les catégories souhaitées).',
    unsubModalTitle: 'Confirmer la désinscription',
    unsubModalDesc:
      'Cette action désactive toutes les communications MediaDays Solutions. Vous pouvez vous réinscrire à tout moment.',
    unsubReasonLabel: 'Raison (optionnel)',
    unsubReasonPlaceholder: 'Ex : Je ne suis plus concerné par cet événement.',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    success: 'Préférences enregistrées',
    successUnsub: 'Désinscription effectuée',
    successResub: 'Vous êtes réinscrit — pensez à cocher vos catégories.',
  },
  en: {
    title: 'My email preferences',
    subtitle: 'Choose which communications you want to receive from MediaDays Solutions.',
    lockedTooltip: 'Set by MediaDays Solutions — contact philippe@mediadays.solutions to modify.',
    save: 'Save',
    saving: 'Saving...',
    unsubAll: 'Unsubscribe from all (GDPR)',
    resub: 'Resubscribe',
    unsubbedTitle: 'You are unsubscribed',
    unsubbedBody:
      'You no longer receive any communication from MediaDays Solutions. Click below to resubscribe (you will then need to re-check the desired categories).',
    unsubModalTitle: 'Confirm unsubscription',
    unsubModalDesc:
      'This action disables all MediaDays Solutions communications. You can resubscribe at any time.',
    unsubReasonLabel: 'Reason (optional)',
    unsubReasonPlaceholder: 'Ex: I am no longer concerned by this event.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    success: 'Preferences saved',
    successUnsub: 'Unsubscribed',
    successResub: 'You are resubscribed — remember to check the desired categories.',
  },
} as const;

const LABELS_EN: Record<PrefKey, { label: string; description: string }> = {
  pref_general: {
    label: 'General communications',
    description: 'Newsletter, save-the-date, news.',
  },
  pref_exposant: {
    label: 'Exhibitor info',
    description: 'Logistics, planning, media kit, badges.',
  },
  pref_facturation: {
    label: 'Billing and payments',
    description: 'Payment reminders, invoices and deposits.',
  },
  pref_kit_media: {
    label: 'Communication kit',
    description: 'Delivery of the exhibitor communication kit.',
  },
  pref_administration: {
    label: 'Event admin',
    description: 'Badges forms, access, plans, room constraints.',
  },
  pref_partenariat: {
    label: 'Partnerships',
    description: 'Cross-sell opportunities, affiliate program, sponsoring.',
  },
  pref_post_event: {
    label: 'Post-event',
    description: 'Recap, replay, save-the-date next edition.',
  },
};

type LocalState = Record<PrefKey, boolean>;

function buildState(prefs: ContactPreferencesRow | null): LocalState {
  const state: Partial<LocalState> = {};
  for (const c of PREF_CATEGORIES) state[c.key] = (prefs?.[c.key] as boolean | undefined) ?? false;
  return state as LocalState;
}

export function PreferencesEmailForm({
  locale,
  contactId,
  initial,
}: {
  locale: 'fr' | 'en';
  contactId: string;
  initial: ContactPreferencesRow | null;
}) {
  const t = COPY[locale];
  const [state, setState] = useState<LocalState>(() => buildState(initial));
  const [pending, startTransition] = useTransition();
  const [unsubModal, setUnsubModal] = useState(false);
  const [unsubReason, setUnsubReason] = useState('');
  const isUnsubscribed = Boolean(initial?.unsubscribed_all_at);

  function togglePref(key: PrefKey, locked: boolean) {
    if (locked) return;
    setState((s) => ({ ...s, [key]: !s[key] }));
  }

  function handleSave() {
    startTransition(async () => {
      const r = await updateMyPreferencesAction({ locale, prefs: state });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t.success);
    });
  }

  function handleUnsubscribe() {
    startTransition(async () => {
      const r = await unsubscribeAllAction({
        contact_id: contactId,
        reason: unsubReason.trim() || undefined,
        as_contact: true,
        locale,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t.successUnsub);
      setUnsubModal(false);
      setUnsubReason('');
      // Refresh page pour relire l'etat unsubscribed_all_at.
      window.location.reload();
    });
  }

  function handleResubscribe() {
    startTransition(async () => {
      const r = await resubscribeAction({ contact_id: contactId, as_contact: true, locale });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t.successResub);
      window.location.reload();
    });
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          📧 {t.title}
        </h2>
        <p className="text-md-text-muted mt-1 text-sm">{t.subtitle}</p>
      </header>

      {isUnsubscribed ? (
        <div className="border-md-warning/40 bg-md-warning/10 flex items-start gap-3 rounded-md border p-4 text-sm">
          <AlertTriangle className="text-md-warning size-5 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="text-md-text font-semibold">{t.unsubbedTitle}</p>
            <p className="text-md-text-muted mt-1 text-xs">{t.unsubbedBody}</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleResubscribe} disabled={pending}>
            {t.resub}
          </Button>
        </div>
      ) : (
        <section className="border-md-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <ul className="divide-md-border divide-y">
            {PREF_CATEGORIES.map((c) => {
              const isLocked = (initial?.[c.lock_key as LockKey] as boolean | undefined) === true;
              const prefOn = state[c.key];
              const labelObj =
                locale === 'en'
                  ? LABELS_EN[c.key]
                  : { label: c.label_fr, description: c.description_fr };
              return (
                <li key={c.key} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl leading-none" aria-hidden>
                      {c.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-md-text">{labelObj.label}</strong>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={prefOn}
                          aria-label={labelObj.label}
                          onClick={() => togglePref(c.key, isLocked)}
                          disabled={pending || isLocked || isUnsubscribed}
                          title={isLocked ? t.lockedTooltip : undefined}
                          className={cn(
                            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
                            isLocked
                              ? 'bg-md-border cursor-not-allowed opacity-60'
                              : prefOn
                                ? 'bg-md-magenta cursor-pointer'
                                : 'bg-md-border cursor-pointer',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block size-4 transform rounded-full bg-white shadow transition',
                              prefOn ? 'translate-x-6' : 'translate-x-1',
                            )}
                          />
                        </button>
                      </div>
                      <p className="text-md-text-muted text-xs">{labelObj.description}</p>
                      {isLocked ? (
                        <p className="text-md-warning mt-1 inline-flex items-center gap-1 text-[11px] font-medium">
                          <Lock className="size-3" aria-hidden />
                          <a href="mailto:philippe@mediadays.solutions" className="hover:underline">
                            {t.lockedTooltip}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-md-border bg-md-bg-soft flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
            <Button
              variant="outline"
              className="border-md-danger text-md-danger hover:bg-md-danger/10"
              onClick={() => setUnsubModal(true)}
              disabled={pending}
            >
              <Send className="size-4" aria-hidden />
              {t.unsubAll}
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {pending ? t.saving : t.save}
            </Button>
          </div>
        </section>
      )}

      {unsubModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card max-w-md space-y-4 rounded-lg p-6 shadow-xl">
            <h3 className="text-md-blue-dark text-lg font-bold">{t.unsubModalTitle}</h3>
            <p className="text-md-text-muted text-sm">{t.unsubModalDesc}</p>
            <div className="space-y-1.5">
              <Label htmlFor="unsub-reason-self">{t.unsubReasonLabel}</Label>
              <Textarea
                id="unsub-reason-self"
                rows={3}
                maxLength={500}
                placeholder={t.unsubReasonPlaceholder}
                value={unsubReason}
                onChange={(e) => setUnsubReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setUnsubModal(false);
                  setUnsubReason('');
                }}
                disabled={pending}
              >
                {t.cancel}
              </Button>
              <Button
                className="bg-md-danger hover:bg-md-danger/90 text-white"
                onClick={handleUnsubscribe}
                disabled={pending}
              >
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {t.confirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Lock, Unlock, Send, AlertTriangle, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  upsertContactPreferenceAdminAction,
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
 * P8.1 — drawer admin pour editer les preferences communication d'un
 * contact (7 catégories : pref + lock_admin).
 *
 * Ouvre via le bouton "Gérer (N)" de la colonne "Préférences" dans la
 * fiche société. Sheet shadcn right, ~600px desktop, full mobile.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  contactEmail: string;
  /** Preferences initiales (peut etre null si jamais cree). */
  initialPreferences: ContactPreferencesRow | null;
  /** Pour le refresh du router parent apres save. */
  onSaved: () => void;
}

type LocalState = Record<PrefKey | LockKey, boolean>;

function buildInitialState(prefs: ContactPreferencesRow | null): LocalState {
  const state: Partial<LocalState> = {};
  for (const c of PREF_CATEGORIES) {
    state[c.key] = (prefs?.[c.key] as boolean | undefined) ?? false;
    state[c.lock_key] = (prefs?.[c.lock_key] as boolean | undefined) ?? false;
  }
  return state as LocalState;
}

export function ContactPreferencesDrawer({
  open,
  onOpenChange,
  contactId,
  contactName,
  contactEmail,
  initialPreferences,
  onSaved,
}: Props) {
  const [state, setState] = useState<LocalState>(() => buildInitialState(initialPreferences));
  const [pending, startTransition] = useTransition();
  const [unsubModal, setUnsubModal] = useState(false);
  const [unsubReason, setUnsubReason] = useState('');
  const isUnsubscribed = Boolean(initialPreferences?.unsubscribed_all_at);

  // Reset l'etat quand on ouvre un autre contact. setTimeout(0) pour
  // sortir du cycle de rendu courant (regle ESLint react-hooks/purity).
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      setState(buildInitialState(initialPreferences));
    }, 0);
    return () => clearTimeout(id);
  }, [open, initialPreferences]);

  function togglePref(key: PrefKey) {
    setState((s) => ({ ...s, [key]: !s[key] }));
  }
  function toggleLock(key: LockKey) {
    setState((s) => ({ ...s, [key]: !s[key] }));
  }

  function handleSave() {
    startTransition(async () => {
      const prefs = PREF_CATEGORIES.reduce<Record<string, boolean>>((acc, c) => {
        acc[c.key] = state[c.key];
        return acc;
      }, {});
      const locks = PREF_CATEGORIES.reduce<Record<string, boolean>>((acc, c) => {
        acc[c.lock_key] = state[c.lock_key];
        return acc;
      }, {});
      const r = await upsertContactPreferenceAdminAction({ contact_id: contactId, prefs, locks });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Préférences mises à jour');
      onSaved();
      onOpenChange(false);
    });
  }

  function handleUnsubscribe() {
    if (unsubReason.trim().length < 3) {
      toast.error('Une raison (3+ caractères) est requise pour le RGPD.');
      return;
    }
    startTransition(async () => {
      const r = await unsubscribeAllAction({
        contact_id: contactId,
        reason: unsubReason.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Contact désinscrit de toutes les communications');
      setUnsubModal(false);
      setUnsubReason('');
      onSaved();
      onOpenChange(false);
    });
  }

  function handleResubscribe() {
    startTransition(async () => {
      const r = await resubscribeAction({ contact_id: contactId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Contact réinscrit (préférences à re-cocher manuellement).');
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-card w-full overflow-y-auto p-0 sm:max-w-xl">
        <div className="bg-md-blue-deep relative px-6 py-5 pr-14 text-white">
          <SheetTitle className="text-lg font-extrabold text-white">
            Préférences de {contactName || contactEmail}
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm text-white/80">
            7 catégories de communication. Activez le cadenas pour empêcher le contact de modifier
            la préférence depuis son espace.
          </SheetDescription>
          <SheetClose
            aria-label="Fermer"
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden />
          </SheetClose>
        </div>

        {isUnsubscribed ? (
          <div className="border-md-warning/40 bg-md-warning/10 m-6 flex items-start gap-3 rounded-md border p-4 text-sm">
            <AlertTriangle className="text-md-warning size-5 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="text-md-text font-semibold">
                Ce contact est désinscrit (opt-out global RGPD).
              </p>
              <p className="text-md-text-muted text-xs">
                Raison : {initialPreferences?.unsubscribed_reason || '(non renseignée)'}
                <br />
                Désinscrit le{' '}
                {initialPreferences?.unsubscribed_all_at
                  ? new Date(initialPreferences.unsubscribed_all_at).toLocaleString('fr-FR')
                  : '—'}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleResubscribe} disabled={pending}>
              Réinscrire
            </Button>
          </div>
        ) : null}

        <ul className="divide-md-border divide-y px-6 py-2">
          {PREF_CATEGORIES.map((c) => {
            const prefOn = state[c.key];
            const locked = state[c.lock_key];
            return (
              <li key={c.key} className="py-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl leading-none" aria-hidden>
                    {c.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-md-text">{c.label_fr}</strong>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={prefOn}
                        aria-label={`Activer ${c.label_fr}`}
                        onClick={() => togglePref(c.key)}
                        disabled={pending || isUnsubscribed}
                        className={cn(
                          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50',
                          prefOn ? 'bg-md-magenta' : 'bg-md-border',
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
                    <p className="text-md-text-muted text-xs">{c.description_fr}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleLock(c.lock_key)}
                        disabled={pending}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-50',
                          locked
                            ? 'bg-md-warning/15 text-md-warning hover:bg-md-warning/25'
                            : 'bg-muted text-md-text-muted hover:bg-muted/80',
                        )}
                      >
                        {locked ? (
                          <>
                            <Lock className="size-3" aria-hidden />
                            Verrouillé (le contact ne peut pas modifier)
                          </>
                        ) : (
                          <>
                            <Unlock className="size-3" aria-hidden />
                            Le contact peut modifier
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-md-border bg-md-bg-soft space-y-3 border-t px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Enregistrer
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Annuler
            </Button>
            {!isUnsubscribed ? (
              <Button
                variant="outline"
                className="border-md-danger text-md-danger hover:bg-md-danger/10 ml-auto"
                onClick={() => setUnsubModal(true)}
                disabled={pending}
              >
                <Send className="size-4" aria-hidden />
                Désinscrire de TOUT (RGPD)
              </Button>
            ) : null}
          </div>
        </div>

        {unsubModal ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card max-w-md space-y-4 rounded-lg p-6 shadow-xl">
              <h3 className="text-md-blue-dark text-lg font-bold">
                Désinscrire {contactName || contactEmail} ?
              </h3>
              <p className="text-md-text-muted text-sm">
                Cette action désinscrit le contact de TOUTES les communications MDS (les 7
                catégories sont mises à false). La raison est obligatoire pour la trace RGPD.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="unsub-reason">Raison de la désinscription *</Label>
                <Textarea
                  id="unsub-reason"
                  rows={3}
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="Demande explicite du contact, plainte CNIL, etc."
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
                  Annuler
                </Button>
                <Button
                  className="bg-md-danger hover:bg-md-danger/90 text-white"
                  onClick={handleUnsubscribe}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Confirmer la désinscription
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

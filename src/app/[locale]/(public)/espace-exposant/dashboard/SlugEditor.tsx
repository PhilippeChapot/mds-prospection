'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { updateCompanySlugAction } from './actions';

/**
 * P5.x.16-bis — editeur inline du slug d'invitation.
 *
 * Pattern :
 *   - Etat ferme : on affiche le slug courant + bouton "Personnaliser"
 *   - Etat ouvert : input + boutons Save/Cancel + hint regles
 *   - Validation client (regex + longueur) en miroir du Zod server
 *   - Errors typees pour i18n message specifique (taken vs format)
 */

const CLIENT_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface Props {
  /** Slug actuel de la company (peut etre null si migration pas appliquee). */
  initialSlug: string | null;
  /** Origine du site (NEXT_PUBLIC_APP_URL) pour le prefixe affiche. */
  appOrigin: string;
}

export function SlugEditor({ initialSlug, appOrigin }: Props) {
  const t = useTranslations('espaceExposant.dashboard.invitation.slugEditor');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialSlug ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setValue(initialSlug ?? '');
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setValue(initialSlug ?? '');
    setError(null);
    setEditing(false);
  }

  function validate(slug: string): string | null {
    const v = slug.trim().toLowerCase();
    if (v.length < 3) return t('errorTooShort');
    if (v.length > 32) return t('errorTooLong');
    if (!CLIENT_PATTERN.test(v)) return t('errorFormat');
    return null;
  }

  function save() {
    const v = value.trim().toLowerCase();
    const localErr = validate(v);
    if (localErr) {
      setError(localErr);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateCompanySlugAction({ slug: v });
      if (!result.ok) {
        if (result.error === 'slug_taken') {
          setError(t('errorTaken'));
        } else if (result.error === 'too_short') {
          setError(t('errorTooShort'));
        } else if (result.error === 'too_long') {
          setError(t('errorTooLong'));
        } else if (result.error === 'invalid_format') {
          setError(t('errorFormat'));
        } else {
          setError(t('errorGeneric'));
        }
        return;
      }
      setEditing(false);
      // Server revalidatePath -> le slug courant dans la page parent
      // se met a jour au prochain render. On garde value local cale dessus.
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className="text-md-blue inline-flex items-center gap-1 text-xs underline hover:no-underline"
      >
        <Pencil className="size-3" aria-hidden />
        {t('open')}
      </button>
    );
  }

  return (
    <div className="border-md-border bg-md-bg-soft space-y-2 rounded-md border p-3">
      <label className="text-md-text-muted text-xs font-medium">{t('label')}</label>
      <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
        <span className="text-md-text-muted">{appOrigin.replace(/^https?:\/\//, '')}/i/</span>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          disabled={pending}
          className="border-md-border text-md-text grow rounded-sm border bg-white px-2 py-1 font-mono text-xs focus:outline-none"
          maxLength={32}
        />
      </div>
      <p className="text-md-text-muted text-xs">{t('hint')}</p>
      {error ? <p className="text-md-warning text-xs">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={pending}
          className="bg-md-magenta hover:bg-md-magenta-soft"
        >
          <Check className="size-3.5" aria-hidden />
          {pending ? t('saving') : t('save')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={pending}>
          <X className="size-3.5" aria-hidden />
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}

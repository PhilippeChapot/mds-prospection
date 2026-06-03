'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updatePartenaireContactAction } from './actions';

export function ContactInfoForm({
  initialPhone,
  initialRole,
  fullName,
  email,
}: {
  initialPhone: string | null;
  initialRole: string | null;
  fullName: string;
  email: string;
}) {
  const t = useTranslations('espacePartenaire.dashboard.contactInfo');
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [role, setRole] = useState(initialRole ?? '');
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhone(initialPhone ?? '');
    setRole(initialRole ?? '');
    setError(null);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Row label={t('nameLabel')} value={fullName} />
        <Row label={t('emailLabel')} value={email} />
        {editing ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-md-text-muted text-xs">
                {t('phoneLabel')}
              </Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder={t('phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-md-text-muted text-xs">
                {t('roleLabel')}
              </Label>
              <Input
                id="role"
                placeholder={t('rolePlaceholder')}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={pending}
              />
            </div>
          </>
        ) : (
          <>
            <Row label={t('phoneLabel')} value={initialPhone || t('notSet')} />
            <Row label={t('roleLabel')} value={initialRole || t('notSet')} />
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {t('error')}
        </p>
      ) : null}
      {savedAt > 0 && !editing ? <p className="text-md-success text-xs">{t('saved')}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {editing ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await updatePartenaireContactAction({
                    phone: phone.trim() || null,
                    role: role.trim() || null,
                  });
                  if (!result.ok) {
                    setError(result.error ?? 'unknown');
                    return;
                  }
                  setSavedAt(Date.now());
                  setEditing(false);
                })
              }
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t('saving')}
                </>
              ) : (
                t('saveButton')
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                reset();
                setEditing(false);
              }}
            >
              <X className="size-3.5" aria-hidden />
              {t('cancelButton')}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden />
            {t('editButton')}
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-md-text-muted text-xs">{label}</div>
      <div className="text-md-text text-sm font-medium">{value}</div>
    </div>
  );
}

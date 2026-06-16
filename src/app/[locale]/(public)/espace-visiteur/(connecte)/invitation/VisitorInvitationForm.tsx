'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, FileText, CheckCircle2, Clock } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  submitVisitorInvitationRequestAction,
  type SubmitInvitationInput,
} from '@/lib/admin/visitors/invitation-actions';

type Defaults = {
  company_name: string;
  city: string;
  country: string;
};

export function VisitorInvitationForm({
  locale,
  defaults,
}: {
  locale: 'fr' | 'en';
  defaults: Defaults;
}) {
  const t = useTranslations('espaceVisiteur.invitation');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'auto_approved' | 'pending' | null>(null);

  const [form, setForm] = useState<SubmitInvitationInput>({
    nationality: '',
    profession: '',
    birth_date: '',
    birth_place: '',
    passport_number: '',
    passport_country: '',
    passport_issue_date: '',
    passport_expiry: '',
    company_name: defaults.company_name,
    company_full_address: '',
    postal_code: '',
    city: defaults.city,
    country: defaults.country,
  });

  function set<K extends keyof SubmitInvitationInput>(key: K, value: SubmitInvitationInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await submitVisitorInvitationRequestAction(locale, form);
        setResult(res.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (result) {
    const isAuto = result === 'auto_approved';
    return (
      <div
        className={`border-md-border flex items-start gap-3 rounded-xl border p-5 shadow-sm ${
          isAuto ? 'bg-md-success/[0.05]' : 'bg-md-warning/[0.06]'
        }`}
      >
        {isAuto ? (
          <CheckCircle2 className="text-md-success mt-0.5 size-5 shrink-0" aria-hidden />
        ) : (
          <Clock className="text-md-warning mt-0.5 size-5 shrink-0" aria-hidden />
        )}
        <div className="space-y-3">
          <p className="text-md-text text-sm leading-relaxed">
            {isAuto ? t('result.auto') : t('result.pending')}
          </p>
          <Link
            href="/espace-visiteur/accueil"
            className="text-md-blue inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            {t('result.backHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Section 1 — Identité & passeport */}
      <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          🛂 {t('section.identity')}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('fields.nationality')} required>
            <Input
              value={form.nationality}
              onChange={(e) => set('nationality', e.target.value)}
              required
            />
          </Field>
          <Field label={t('fields.profession')} required>
            <Input
              value={form.profession}
              onChange={(e) => set('profession', e.target.value)}
              required
            />
          </Field>
          <Field label={t('fields.birthDate')} required>
            <Input
              type="date"
              value={form.birth_date}
              onChange={(e) => set('birth_date', e.target.value)}
              required
            />
          </Field>
          <Field label={t('fields.birthPlace')}>
            <Input
              value={form.birth_place ?? ''}
              onChange={(e) => set('birth_place', e.target.value)}
            />
          </Field>
          <Field label={t('fields.passportNumber')} required>
            <Input
              value={form.passport_number}
              onChange={(e) => set('passport_number', e.target.value)}
              required
            />
          </Field>
          <Field label={t('fields.passportCountry')} required>
            <Input
              value={form.passport_country}
              onChange={(e) => set('passport_country', e.target.value.toUpperCase().slice(0, 2))}
              placeholder="FR"
              maxLength={2}
              required
            />
          </Field>
          <Field label={t('fields.passportIssue')} required>
            <Input
              type="date"
              value={form.passport_issue_date}
              onChange={(e) => set('passport_issue_date', e.target.value)}
              required
            />
          </Field>
          <Field label={t('fields.passportExpiry')} required>
            <Input
              type="date"
              value={form.passport_expiry}
              onChange={(e) => set('passport_expiry', e.target.value)}
              required
            />
          </Field>
        </div>
        <p className="text-md-text-muted text-xs">{t('passportCountryHint')}</p>
      </section>

      {/* Section 2 — Société destinataire */}
      <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          🏢 {t('section.company')}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('fields.companyName')} required>
            <Input
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
              required
            />
          </Field>
          <Field label={t('fields.companyAddress')} required>
            <Input
              value={form.company_full_address}
              onChange={(e) => set('company_full_address', e.target.value)}
              required
            />
          </Field>
          <Field label={t('fields.postalCode')}>
            <Input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
          </Field>
          <Field label={t('fields.city')}>
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label={t('fields.country')}>
            <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
          </Field>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="bg-md-magenta hover:bg-md-magenta-soft w-full"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('submitLoading')}
          </>
        ) : (
          <>
            <FileText className="size-4" aria-hidden />
            {t('submit')}
          </>
        )}
      </Button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-semibold">
        {label}
        {required ? <span className="text-md-magenta ml-0.5">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

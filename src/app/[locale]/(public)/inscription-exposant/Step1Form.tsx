'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CompanyAutocomplete } from '@/components/public/CompanyAutocomplete';
import { InfoTooltip } from '@/components/public/InfoTooltip';
import {
  signupStep1Schema,
  type SignupStep1Input,
  type SignupCategory,
  type SignupInitErrorCode,
  SUPPORTED_COUNTRIES,
} from '@/lib/signup/schema';
import { cn } from '@/lib/utils';

const HCAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? '10000000-ffff-ffff-ffff-000000000001';

export function Step1Form({
  locale,
  initialCategory,
}: {
  locale: 'fr' | 'en';
  initialCategory: SignupCategory;
}) {
  const t = useTranslations('signup.step1');
  const tTooltips = useTranslations('signup.tooltips');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const captchaRef = useRef<HCaptcha>(null);
  const [serverError, setServerError] = useState<SignupInitErrorCode | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    clearErrors,
  } = useForm<SignupStep1Input>({
    resolver: zodResolver(signupStep1Schema),
    defaultValues: {
      email: '',
      companyId: null,
      companyName: '',
      companyCountry: 'FR',
      firstName: '',
      lastName: '',
      phone: null,
      category: initialCategory,
      consentRgpd: false,
      consentMarketing: false,
      hcaptchaToken: null,
      honeypot: '',
      locale,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referrer: null,
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  // Capture UTM + referrer cote client (best effort).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    setValue('utmSource', url.searchParams.get('utm_source'));
    setValue('utmMedium', url.searchParams.get('utm_medium'));
    setValue('utmCampaign', url.searchParams.get('utm_campaign'));
    setValue('referrer', document.referrer || null);
  }, [setValue]);

  const companyName = watch('companyName');
  const consentRgpd = watch('consentRgpd');

  async function onSubmit(values: SignupStep1Input) {
    setServerError(null);
    try {
      const response = await fetch('/api/signup/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        signupId?: string;
        error?: SignupInitErrorCode;
      };

      if (!response.ok || !data.success) {
        const code = (data.error ?? 'internal_error') as SignupInitErrorCode;
        setServerError(code);
        captchaRef.current?.resetCaptcha();
        setValue('hcaptchaToken', null);
        toast.error(translateError(code));
        return;
      }

      router.push({
        pathname: '/inscription-exposant/check-email',
        query: { e: encodeURIComponent(maskEmail(values.email)) },
      });
    } catch {
      setServerError('internal_error');
      captchaRef.current?.resetCaptcha();
      setValue('hcaptchaToken', null);
      toast.error(tErrors('generic'));
    }
  }

  function translateError(code: SignupInitErrorCode): string {
    switch (code) {
      case 'captcha_failed':
        return tErrors('captcha');
      case 'email_undeliverable':
        return tErrors('emailUndeliverable');
      case 'email_free_provider':
        return tErrors('emailFreeProvider');
      case 'email_disposable':
        return tErrors('emailDisposable');
      case 'email_duplicate_recent':
        return tErrors('emailDuplicateRecent');
      case 'email_duplicate_prospect':
        return tErrors('emailDuplicateProspect');
      case 'rate_limited':
        return tErrors('rateLimited');
      default:
        return tErrors('generic');
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onChange={(e) => {
        const target = e.target as Partial<{ name: string }>;
        if (target.name) clearErrors(target.name as keyof SignupStep1Input);
      }}
      noValidate
    >
      <Card className="border-md-border space-y-5 p-5 shadow-sm sm:p-7">
        {/* Email */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="email" className="font-semibold">
              {t('labelEmail')} <span className="text-md-magenta">*</span>
            </Label>
            <InfoTooltip ariaLabel={tTooltips('emailLabel')}>
              <p className="font-semibold">{tTooltips('emailLabel')}</p>
              <p className="mt-1">{tTooltips('emailBody')}</p>
            </InfoTooltip>
          </div>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="vous@votre-societe.com"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError messageKey={errors.email?.message} />
        </div>

        {/* Société */}
        <div className="space-y-1.5">
          <Label htmlFor="companyName" className="font-semibold">
            {t('labelCompany')} <span className="text-md-magenta">*</span>
          </Label>
          <Controller
            control={control}
            name="companyName"
            render={({ field, fieldState }) => (
              <CompanyAutocomplete
                value={field.value}
                onChange={({ name, id }) => {
                  field.onChange(name);
                  setValue('companyId', id, { shouldValidate: false });
                  clearErrors('companyName');
                }}
                invalid={!!fieldState.error}
                required
              />
            )}
          />
          <FieldError messageKey={errors.companyName?.message} />
        </div>

        {/* Pays */}
        <div className="space-y-1.5">
          <Label htmlFor="companyCountry" className="font-semibold">
            {t('labelCountry')} <span className="text-md-magenta">*</span>
          </Label>
          <select
            id="companyCountry"
            className="border-md-border focus:border-md-blue focus:ring-md-blue/20 h-10 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
            {...register('companyCountry')}
          >
            {SUPPORTED_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {countryLabel(code, locale)}
              </option>
            ))}
          </select>
          <FieldError messageKey={errors.companyCountry?.message} />
        </div>

        {/* Prenom + Nom */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName" className="font-semibold">
              {t('labelFirstName')} <span className="text-md-magenta">*</span>
            </Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              {...register('firstName')}
            />
            <FieldError messageKey={errors.firstName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName" className="font-semibold">
              {t('labelLastName')} <span className="text-md-magenta">*</span>
            </Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              aria-invalid={!!errors.lastName}
              {...register('lastName')}
            />
            <FieldError messageKey={errors.lastName?.message} />
          </div>
        </div>

        {/* Telephone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="font-semibold">
            {t('labelPhone')}{' '}
            <span className="text-md-text-muted text-xs font-normal">({tCommon('optional')})</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+33 6 12 34 56 78"
            {...register('phone')}
          />
          <FieldError messageKey={errors.phone?.message} />
        </div>

        {/* Categorie */}
        <fieldset className="space-y-2">
          <div className="flex items-center gap-2">
            <legend className="text-md-text text-sm font-semibold">
              {t('labelCategory')} <span className="text-md-magenta">*</span>
            </legend>
            <InfoTooltip ariaLabel={tTooltips('categoryLabel')}>
              <p className="font-semibold">{tTooltips('categoryLabel')}</p>
              <p className="mt-1">{tTooltips('categoryBody')}</p>
            </InfoTooltip>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <CategoryRadio
              name="category"
              value="exposant"
              label={t('categoryExhibitor')}
              register={register}
            />
            <CategoryRadio
              name="category"
              value="partenaire"
              label={t('categoryPartner')}
              register={register}
            />
          </div>
          <FieldError messageKey={errors.category?.message} />
        </fieldset>

        {/* Honeypot — hidden field, doit rester vide. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website-honeypot">Website (do not fill)</label>
          <input
            id="website-honeypot"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register('honeypot')}
          />
        </div>

        {/* Consentements */}
        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="border-md-border text-md-magenta focus:ring-md-magenta mt-0.5 h-4 w-4 shrink-0 rounded"
              {...register('consentRgpd')}
            />
            <span className={cn('text-md-text', errors.consentRgpd && 'text-destructive')}>
              {t.rich('consentRgpd', {
                link: (chunks) => (
                  <a
                    href={`/${locale}/${locale === 'fr' ? 'politique-confidentialite' : 'privacy-policy'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-md-blue underline-offset-2 hover:underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
              <span className="text-md-magenta"> *</span>
            </span>
          </label>
          {errors.consentRgpd && (
            <p className="text-destructive ml-7 text-xs">{tErrors('consentRgpdRequired')}</p>
          )}

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="border-md-border text-md-magenta focus:ring-md-magenta mt-0.5 h-4 w-4 shrink-0 rounded"
              {...register('consentMarketing')}
            />
            <span className="text-md-text-muted">{t('consentMarketing')}</span>
          </label>
        </div>

        {/* hCaptcha */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <Controller
            control={control}
            name="hcaptchaToken"
            render={({ field }) => (
              <HCaptcha
                ref={captchaRef}
                sitekey={HCAPTCHA_SITE_KEY}
                onVerify={(token) => field.onChange(token)}
                onExpire={() => field.onChange(null)}
                onError={() => field.onChange(null)}
              />
            )}
          />
        </div>

        {/* Server error banner */}
        {serverError && (
          <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{translateError(serverError)}</span>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || !consentRgpd || !companyName.trim()}
          className="bg-md-magenta hover:bg-md-magenta-soft sticky bottom-4 mt-4 w-full sm:static sm:bottom-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('submitLoading')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </Card>
    </form>
  );
}

function FieldError({ messageKey }: { messageKey?: string }) {
  const tErrors = useTranslations('errors');
  if (!messageKey) return null;

  // Le message Zod peut etre une cle errors.* (ex: "invalidEmail") ou un
  // message brut Zod par defaut. On essaie la cle, fallback message brut.
  let translated: string;
  try {
    translated = tErrors(messageKey as Parameters<typeof tErrors>[0]);
  } catch {
    translated = messageKey;
  }
  return <p className="text-destructive text-xs">{translated}</p>;
}

function CategoryRadio({
  name,
  value,
  label,
  register,
}: {
  name: 'category';
  value: SignupCategory;
  label: string;
  register: ReturnType<typeof useForm<SignupStep1Input>>['register'];
}) {
  return (
    <label className="border-md-border has-[input:checked]:border-md-magenta has-[input:checked]:bg-md-magenta/5 flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3 transition-colors">
      <input type="radio" value={value} className="text-md-magenta" {...register(name)} />
      <span className="text-md-text text-sm font-medium">{label}</span>
    </label>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function countryLabel(code: string, locale: 'fr' | 'en'): string {
  const labels: Record<'fr' | 'en', Record<string, string>> = {
    fr: {
      FR: 'France',
      BE: 'Belgique',
      CH: 'Suisse',
      LU: 'Luxembourg',
      MC: 'Monaco',
      GB: 'Royaume-Uni',
      DE: 'Allemagne',
      ES: 'Espagne',
      IT: 'Italie',
      NL: 'Pays-Bas',
      PT: 'Portugal',
      US: 'États-Unis',
      CA: 'Canada',
      OTHER: 'Autre',
    },
    en: {
      FR: 'France',
      BE: 'Belgium',
      CH: 'Switzerland',
      LU: 'Luxembourg',
      MC: 'Monaco',
      GB: 'United Kingdom',
      DE: 'Germany',
      ES: 'Spain',
      IT: 'Italy',
      NL: 'Netherlands',
      PT: 'Portugal',
      US: 'United States',
      CA: 'Canada',
      OTHER: 'Other',
    },
  };
  return labels[locale][code] ?? code;
}

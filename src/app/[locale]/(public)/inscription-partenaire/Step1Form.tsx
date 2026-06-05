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
  EU_VAT_COUNTRIES,
  type EuVatCountry,
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
  const tVat = useTranslations('signup.step1.vat');
  const tTooltips = useTranslations('signup.tooltips');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const captchaRef = useRef<HCaptcha>(null);
  const [serverError, setServerError] = useState<SignupInitErrorCode | null>(null);
  const [vatVerifying, setVatVerifying] = useState(false);
  const [vatError, setVatError] = useState<string | null>(null);
  const [vatVerifiedName, setVatVerifiedName] = useState<string | null>(null);

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
      affiliateInput: null,
      vatCountry: null,
      vatNumber: null,
      vatVerified: false,
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

    // P5.x.7 : tracking affilie. Si ?ref=<token>, ping le endpoint qui
    // log le click et set le cookie 30j. Le serveur valide le token,
    // donc un ?ref= invalide ne casse rien (200 ok=false silencieux).
    const ref = url.searchParams.get('ref');
    if (ref && /^[A-Za-z0-9_.\-]+$/.test(ref) && ref.length <= 64) {
      void fetch('/api/affiliates/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: ref,
          referrer: document.referrer || null,
          utmSource: url.searchParams.get('utm_source'),
          utmMedium: url.searchParams.get('utm_medium'),
          utmCampaign: url.searchParams.get('utm_campaign'),
        }),
      }).catch(() => {
        // Silencieux : le tracking est best-effort, ne bloque pas le wizard.
      });
    }
  }, [setValue]);

  const companyName = watch('companyName');
  const companyCountry = watch('companyCountry');
  const vatCountry = watch('vatCountry');
  const vatNumber = watch('vatNumber');
  const vatVerified = watch('vatVerified');
  const consentRgpd = watch('consentRgpd');

  // Le bloc TVA UE n'a de sens que si la societe N'EST PAS basee en France :
  // - FR -> TVA 20% standard (pas d'autoliquidation possible)
  // - CH/GB/US/CA/MC/OTHER -> hors UE (pas d'autoliquidation Art. 196)
  // - DE/BE/ES/IT/NL/PT (et autres UE selectionnes via vatCountry) -> eligible
  // On affiche le bloc des que companyCountry n'est pas FR pour permettre
  // au client UE d'aller plus loin meme s'il a choisi un companyCountry "OTHER".
  const showVatBlock = companyCountry !== 'FR';

  // Reset l'etat VIES si le numero ou le pays change.
  useEffect(() => {
    if (vatVerified) {
      setValue('vatVerified', false);
      setVatVerifiedName(null);
      setVatError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatCountry, vatNumber]);

  async function handleVerifyVat() {
    setVatError(null);
    setVatVerifiedName(null);
    if (!vatCountry || !vatNumber || vatNumber.trim().length < 4) {
      setVatError('errorMissingFields');
      return;
    }
    setVatVerifying(true);
    try {
      const response = await fetch('/api/signup/verify-vat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: vatCountry, vatNumber: vatNumber.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | { ok: true; name: string | null; address: string | null }
        | { ok: false; error: string };

      if (response.status === 429 || (!data.ok && data.error === 'rate_limited')) {
        setVatError('errorRateLimited');
        return;
      }
      if (!response.ok || !data.ok) {
        const errCode = !data.ok ? data.error : 'errorViesUnavailable';
        const map: Record<string, string> = {
          invalid_country: 'errorInvalidCountry',
          not_valid: 'errorNotValid',
          vies_unavailable: 'errorViesUnavailable',
          invalid_payload: 'errorMissingFields',
        };
        setVatError(map[errCode] ?? 'errorViesUnavailable');
        return;
      }
      setValue('vatVerified', true, { shouldValidate: false });
      setVatVerifiedName(data.name);
    } catch {
      setVatError('errorViesUnavailable');
    } finally {
      setVatVerifying(false);
    }
  }

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
        pathname: '/inscription-partenaire/check-email',
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

        {/* Bloc TVA UE — visible des que companyCountry !== FR. Permet au
         * client UE non-FR d'activer l'autoliquidation Art. 196. */}
        {showVatBlock && (
          <div className="border-md-border bg-md-blue/[0.03] space-y-3 rounded-md border p-4">
            <div>
              <p className="text-md-text text-sm font-semibold">{tVat('sectionTitle')}</p>
              <p className="text-md-text-muted mt-1 text-xs">{tVat('sectionHelp')}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="vatCountry" className="text-sm font-medium">
                  {tVat('countryLabel')}
                </Label>
                <select
                  id="vatCountry"
                  className="border-md-border focus:border-md-blue focus:ring-md-blue/20 h-10 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
                  {...register('vatCountry', {
                    setValueAs: (v) => (v === '' || v == null ? null : v),
                  })}
                >
                  <option value="">{tVat('countryPlaceholder')}</option>
                  {EU_VAT_COUNTRIES.map((code) => (
                    <option key={code} value={code}>
                      {euCountryLabel(code, locale)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vatNumber" className="text-sm font-medium">
                  {tVat('numberLabel')}
                </Label>
                <Input
                  id="vatNumber"
                  type="text"
                  autoComplete="off"
                  placeholder={tVat('numberPlaceholder')}
                  {...register('vatNumber', {
                    setValueAs: (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
                  })}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleVerifyVat}
                disabled={vatVerifying || !vatCountry || !vatNumber || vatNumber.trim().length < 4}
              >
                {vatVerifying ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                    {tVat('verifying')}
                  </>
                ) : (
                  tVat('verifyButton')
                )}
              </Button>
              {vatVerified && (
                <span className="bg-md-success/15 text-md-success inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
                  ✓ {tVat('verifiedBadge')}
                  {vatVerifiedName ? (
                    <span className="ml-1 font-normal opacity-80">— {vatVerifiedName}</span>
                  ) : null}
                </span>
              )}
            </div>

            {vatError && (
              <p className="text-destructive text-xs" role="alert">
                {tVat(vatError as Parameters<typeof tVat>[0])}
              </p>
            )}

            <p className="text-md-text-muted text-xs">
              {vatVerified ? tVat('autoliquidationInfo') : tVat('standardInfo')}
            </p>
          </div>
        )}

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

        {/* Affiliation (texte libre — normalise en P5 vs table affiliates) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="affiliateInput" className="font-semibold">
              {t('labelAffiliateInput')}
            </Label>
            <InfoTooltip ariaLabel={tTooltips('affiliateLabel')}>
              <p className="font-semibold">{tTooltips('affiliateLabel')}</p>
              <p className="mt-1">{tTooltips('affiliateBody')}</p>
            </InfoTooltip>
          </div>
          <Input
            id="affiliateInput"
            type="text"
            autoComplete="off"
            maxLength={200}
            placeholder={t('labelAffiliateInputPlaceholder')}
            {...register('affiliateInput')}
          />
          <FieldError messageKey={errors.affiliateInput?.message} />
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
              value="partenaire"
              label={t('categoryPartenaire')}
              register={register}
            />
            <CategoryRadio
              name="category"
              value="sponsor"
              label={t('categorySponsor')}
              register={register}
            />
          </div>
          <p className="text-md-text-muted mt-2 text-xs">{t('categorySponsorIntro')}</p>
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

function euCountryLabel(code: EuVatCountry, locale: 'fr' | 'en'): string {
  const names: Record<'fr' | 'en', Record<EuVatCountry, string>> = {
    fr: {
      AT: 'Autriche',
      BE: 'Belgique',
      BG: 'Bulgarie',
      CY: 'Chypre',
      CZ: 'République tchèque',
      DE: 'Allemagne',
      DK: 'Danemark',
      EE: 'Estonie',
      ES: 'Espagne',
      FI: 'Finlande',
      GR: 'Grèce',
      HR: 'Croatie',
      HU: 'Hongrie',
      IE: 'Irlande',
      IT: 'Italie',
      LT: 'Lituanie',
      LU: 'Luxembourg',
      LV: 'Lettonie',
      MT: 'Malte',
      NL: 'Pays-Bas',
      PL: 'Pologne',
      PT: 'Portugal',
      RO: 'Roumanie',
      SE: 'Suède',
      SI: 'Slovénie',
      SK: 'Slovaquie',
    },
    en: {
      AT: 'Austria',
      BE: 'Belgium',
      BG: 'Bulgaria',
      CY: 'Cyprus',
      CZ: 'Czech Republic',
      DE: 'Germany',
      DK: 'Denmark',
      EE: 'Estonia',
      ES: 'Spain',
      FI: 'Finland',
      GR: 'Greece',
      HR: 'Croatia',
      HU: 'Hungary',
      IE: 'Ireland',
      IT: 'Italy',
      LT: 'Lithuania',
      LU: 'Luxembourg',
      LV: 'Latvia',
      MT: 'Malta',
      NL: 'Netherlands',
      PL: 'Poland',
      PT: 'Portugal',
      RO: 'Romania',
      SE: 'Sweden',
      SI: 'Slovenia',
      SK: 'Slovakia',
    },
  };
  return names[locale][code] ?? code;
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

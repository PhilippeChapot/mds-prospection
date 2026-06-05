'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CheckCircle2, Loader2, AlertCircle, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PAYMENT_PATHS, type PaymentPath, step2CaseASchema } from '@/lib/signup/step2-schema';
import type { Step2Data, AddonOption, PricingTier } from '@/lib/signup/step2-data';
import { cn } from '@/lib/utils';

interface Props {
  locale: 'fr' | 'en';
  firstName: string;
  companyName: string;
  data: Step2Data;
  initialDraft: Record<string, unknown>;
}

interface DraftA {
  packCode?: 'ACCESS' | 'CLASSIC' | 'PREMIUM';
  pricingTierId?: string;
  // Paris est TOUJOURS selectionne (impose par l'UI). Pas dans le state.
  marseilleSelected: boolean;
  boothPreferences: [string, string, string];
  addonIds: string[];
  paymentPath?: PaymentPath;
  cgvAccepted: boolean;
}

const VAT_RATE_FR = 0.2;

function emptyBoothPreferences(): [string, string, string] {
  return ['', '', ''];
}

export function Step2WizardCaseA({ locale, firstName, companyName, data, initialDraft }: Props) {
  const t = useTranslations('signup.step2.caseA');
  const router = useRouter();

  const [draft, setDraft] = useState<DraftA>(() => {
    const d = initialDraft as Partial<DraftA> & { boothPreferences?: string[] };
    const prefs = Array.isArray(d.boothPreferences)
      ? ([
          d.boothPreferences[0] ?? '',
          d.boothPreferences[1] ?? '',
          d.boothPreferences[2] ?? '',
        ] as [string, string, string])
      : emptyBoothPreferences();
    return {
      packCode: d.packCode,
      pricingTierId: d.pricingTierId,
      marseilleSelected: d.marseilleSelected === true,
      boothPreferences: prefs,
      addonIds: Array.isArray(d.addonIds) ? (d.addonIds as string[]) : [],
      paymentPath: d.paymentPath,
      cgvAccepted: false,
    };
  });
  const [openSection, setOpenSection] = useState<'pack' | 'booth' | 'payment'>('pack');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const tiers = useMemo(
    () => data.pricingTiers.filter((p) => p.category === 'prs_exhibitor'),
    [data.pricingTiers],
  );

  const selectedTier = useMemo(
    () => tiers.find((p) => p.id === draft.pricingTierId),
    [tiers, draft.pricingTierId],
  );

  // Addons : Paris est toujours present => prs_only et both passent.
  // Marseille passe si marseilleSelected => mds_only s'affiche.
  const filteredAddons = useMemo(() => {
    return data.addons.filter((a) => {
      if (a.scope === 'both') return true;
      if (a.scope === 'prs_only') return true; // Paris toujours selectionne
      if (a.scope === 'mds_only') return draft.marseilleSelected;
      return false;
    });
  }, [data.addons, draft.marseilleSelected]);

  const selectedAddons = useMemo(
    () => data.addons.filter((a) => draft.addonIds.includes(a.id)),
    [data.addons, draft.addonIds],
  );

  const marseilleSupplement = useMemo(() => {
    if (!draft.marseilleSelected) return 0;
    return selectedTier?.marseilleSupplementEurHt ?? 0;
  }, [draft.marseilleSelected, selectedTier]);

  const totalHt = useMemo(() => {
    const packPrice = selectedTier?.priceEurHt ?? 0;
    const addonsTotal = selectedAddons.reduce((acc, a) => acc + a.priceEurHt, 0);
    return packPrice + marseilleSupplement + addonsTotal;
  }, [selectedTier, selectedAddons, marseilleSupplement]);

  const vatRate = VAT_RATE_FR;
  const totalVat = totalHt * vatRate;
  const totalTtc = totalHt + totalVat;

  const allBoothPrefsFilled = draft.boothPreferences.every((p) => p.trim().length > 0);
  const section1Valid = !!draft.packCode && !!draft.pricingTierId;
  const section2Valid = section1Valid && allBoothPrefsFilled;
  const section3Valid = section2Valid && !!draft.paymentPath && draft.cgvAccepted;

  // Auto-save partiel debounce 800ms.
  useEffect(() => {
    const payload = {
      mode: 'caseA' as const,
      packCode: draft.packCode,
      pricingTierId: draft.pricingTierId,
      parisSelected: true,
      marseilleSelected: draft.marseilleSelected,
      boothPreferences: draft.boothPreferences.filter((p) => p.trim().length > 0),
      addonIds: draft.addonIds,
      paymentPath: draft.paymentPath,
    };

    const id = setTimeout(() => {
      void fetch('/api/signup/step2/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        /* best effort */
      });
    }, 800);
    return () => clearTimeout(id);
  }, [
    draft.packCode,
    draft.pricingTierId,
    draft.marseilleSelected,
    draft.boothPreferences,
    draft.addonIds,
    draft.paymentPath,
  ]);

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);

    const parsed = step2CaseASchema.safeParse({
      mode: 'caseA',
      packCode: draft.packCode,
      pricingTierId: draft.pricingTierId,
      parisSelected: true,
      marseilleSelected: draft.marseilleSelected,
      boothPreferences: draft.boothPreferences,
      addonIds: draft.addonIds,
      paymentPath: draft.paymentPath,
      cgvAccepted: draft.cgvAccepted,
    });

    if (!parsed.success) {
      setSubmitError(t('needAllStepsValid'));
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/signup/step2/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        setSubmitError(t('needAllStepsValid'));
        setSubmitting(false);
        return;
      }
      const result = (await res.json()) as { success: boolean; ref?: string };
      if (!result.success || !result.ref) {
        setSubmitError(t('needAllStepsValid'));
        setSubmitting(false);
        return;
      }
      router.push({ pathname: '/merci', query: { s: result.ref } });
    } catch {
      setSubmitError(t('needAllStepsValid'));
      setSubmitting(false);
    }
  }

  function toggleMarseille(checked: boolean) {
    setDraft((d) => ({
      ...d,
      marseilleSelected: checked,
      // Si on decoche Marseille, virer les addons mds_only.
      addonIds: checked
        ? d.addonIds
        : d.addonIds.filter((id) => {
            const a = data.addons.find((x) => x.id === id);
            return a?.scope !== 'mds_only';
          }),
    }));
  }

  function chooseAddon(addonId: string, checked: boolean) {
    setDraft((d) => ({
      ...d,
      addonIds: checked
        ? [...new Set([...d.addonIds, addonId])]
        : d.addonIds.filter((id) => id !== addonId),
    }));
  }

  function choosePack(tier: PricingTier) {
    setDraft((d) => ({
      ...d,
      packCode: tier.packCode as 'ACCESS' | 'CLASSIC' | 'PREMIUM',
      pricingTierId: tier.id,
    }));
  }

  function setBoothPref(idx: 0 | 1 | 2, value: string) {
    setDraft((d) => {
      const next = [...d.boothPreferences] as [string, string, string];
      next[idx] = value;
      return { ...d, boothPreferences: next };
    });
  }

  return (
    <>
      <header className="mb-8 text-center">
        <h1 className="text-md-text mb-2 text-3xl font-extrabold">
          {t('heading', { firstName: firstName || companyName })}
        </h1>
        <p className="text-md-text-muted text-base">{t('subheading')}</p>
      </header>

      <Card className="border-md-border overflow-hidden p-0 shadow-sm">
        <Accordion
          type="single"
          collapsible
          value={openSection}
          onValueChange={(v) => v && setOpenSection(v as 'pack' | 'booth' | 'payment')}
          className="divide-md-border"
        >
          {/* === Section 1 — Pack & Salons === */}
          <AccordionItem value="pack">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                {section1Valid && <CheckCircle2 className="text-md-success h-4 w-4" aria-hidden />}
                <span>1. {t('step1Title')}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-6">
              {/* Pack */}
              <fieldset className="space-y-3">
                <legend className="text-md-text text-sm font-semibold">{t('packLegend')}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {tiers.map((tier) => (
                    <PackCard
                      key={tier.id}
                      tier={tier}
                      locale={locale}
                      selected={draft.pricingTierId === tier.id}
                      onSelect={() => choosePack(tier)}
                    />
                  ))}
                </div>
              </fieldset>

              {/* Salons */}
              <fieldset className="space-y-3">
                <legend className="text-md-text text-sm font-semibold">{t('salonsLegend')}</legend>
                <div className="grid gap-2">
                  {/* Paris : pre-coche, disabled */}
                  <div className="border-md-magenta bg-md-magenta/5 flex items-start gap-3 rounded-md border p-3">
                    <div className="mt-0.5">
                      <Checkbox checked disabled aria-label={t('salonParis')} />
                    </div>
                    <div className="flex-1">
                      <p className="text-md-text text-sm font-medium">{t('salonParis')}</p>
                      <p className="text-md-text-muted mt-0.5 flex items-center gap-1 text-xs">
                        <Lock className="h-3 w-3" aria-hidden />
                        {t('salonParisIncluded')}
                      </p>
                    </div>
                  </div>

                  {/* Marseille : optionnel, supplement live */}
                  <MarseilleCheckbox
                    checked={draft.marseilleSelected}
                    supplement={selectedTier?.marseilleSupplementEurHt ?? null}
                    onChange={toggleMarseille}
                    disabled={!selectedTier}
                  />
                </div>
              </fieldset>

              <NextButton
                disabled={!section1Valid}
                onClick={() => setOpenSection('booth')}
                label={t('continueNext')}
              />
            </AccordionContent>
          </AccordionItem>

          {/* === Section 2 — Emplacement & Options === */}
          <AccordionItem value="booth">
            <AccordionTrigger disabled={!section1Valid}>
              <span className="flex items-center gap-2">
                {section2Valid && <CheckCircle2 className="text-md-success h-4 w-4" aria-hidden />}
                <span>2. {t('step2Title')}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-6">
              {/* Canva embed */}
              {data.canvaPlanUrl && (
                <div className="space-y-2">
                  <p className="text-md-text-muted text-xs">{t('boothPaceCanva')}</p>
                  <div className="border-md-border overflow-hidden rounded-md border">
                    <iframe
                      src={data.canvaPlanUrl}
                      className="aspect-video w-full"
                      allow="fullscreen"
                      loading="lazy"
                      title="Plan Canva — Paris Radio Show 2026"
                    />
                  </div>
                </div>
              )}

              {/* Booth preferences (3 inputs texte) */}
              <fieldset className="space-y-3">
                <legend className="text-md-text text-sm font-semibold">
                  {t('boothPreferencesLegend')}
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <BoothPrefInput
                    idx={0}
                    label={t('boothPreference1')}
                    value={draft.boothPreferences[0]}
                    placeholder={t('boothPreferencesPlaceholder')}
                    onChange={(v) => setBoothPref(0, v)}
                  />
                  <BoothPrefInput
                    idx={1}
                    label={t('boothPreference2')}
                    value={draft.boothPreferences[1]}
                    placeholder={t('boothPreferencesPlaceholder')}
                    onChange={(v) => setBoothPref(1, v)}
                  />
                  <BoothPrefInput
                    idx={2}
                    label={t('boothPreference3')}
                    value={draft.boothPreferences[2]}
                    placeholder={t('boothPreferencesPlaceholder')}
                    onChange={(v) => setBoothPref(2, v)}
                  />
                </div>
                <p className="text-md-text-muted text-xs italic">{t('boothPreferencesHelp')}</p>
              </fieldset>

              {/* Addons */}
              <fieldset className="space-y-3">
                <legend className="text-md-text text-sm font-semibold">{t('addonsLegend')}</legend>
                <AddonsList
                  addons={filteredAddons}
                  selected={draft.addonIds}
                  onChange={chooseAddon}
                  locale={locale}
                />
              </fieldset>

              <NextButton
                disabled={!section2Valid}
                onClick={() => setOpenSection('payment')}
                label={t('continueNext')}
              />
            </AccordionContent>
          </AccordionItem>

          {/* === Section 3 — Payment === */}
          <AccordionItem value="payment">
            <AccordionTrigger disabled={!section2Valid}>
              <span className="flex items-center gap-2">
                {draft.paymentPath && draft.cgvAccepted && (
                  <CheckCircle2 className="text-md-success h-4 w-4" aria-hidden />
                )}
                <span>3. {t('step3Title')}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-6">
              <fieldset className="space-y-3">
                <legend className="text-md-text text-sm font-semibold">{t('paymentLegend')}</legend>
                <RadioGroup
                  value={draft.paymentPath ?? ''}
                  onValueChange={(v) => setDraft((d) => ({ ...d, paymentPath: v as PaymentPath }))}
                  className="grid gap-2"
                >
                  {PAYMENT_PATHS.map((path) => (
                    <PaymentRadio key={path} path={path} />
                  ))}
                </RadioGroup>
              </fieldset>

              {/* Recap HT/TVA/TTC */}
              <SummaryBox
                tier={selectedTier}
                marseilleSelected={draft.marseilleSelected}
                marseilleSupplement={marseilleSupplement}
                addons={selectedAddons}
                totalHt={totalHt}
                vatRate={vatRate}
                totalVat={totalVat}
                totalTtc={totalTtc}
                locale={locale}
              />

              {/* CGV */}
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={draft.cgvAccepted}
                  onCheckedChange={(c) => setDraft((d) => ({ ...d, cgvAccepted: c === true }))}
                />
                <span className="text-md-text">
                  {t.rich('cgvAccept', {
                    link: (chunks) => (
                      <a
                        href={`/${locale}/${locale === 'fr' ? 'cgv' : 'terms'}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-md-blue underline-offset-2 hover:underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </span>
              </label>

              {submitError && (
                <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{submitError}</span>
                </div>
              )}

              <Button
                type="button"
                size="lg"
                disabled={!section3Valid || submitting}
                onClick={handleSubmit}
                className="bg-md-magenta hover:bg-md-magenta-soft w-full"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t('submitLoading')}
                  </>
                ) : (
                  t('submit')
                )}
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </>
  );
}

// ===== Sub-components =====

function MarseilleCheckbox({
  checked,
  supplement,
  onChange,
  disabled,
}: {
  checked: boolean;
  supplement: number | null;
  onChange: (c: boolean) => void;
  disabled: boolean;
}) {
  const t = useTranslations('signup.step2.caseA');
  const id = 'salon-marseille';
  const unavailable = supplement == null;

  return (
    <label
      htmlFor={id}
      className={cn(
        'border-md-border has-[input[data-state=checked]]:border-md-magenta has-[input[data-state=checked]]:bg-md-magenta/5 flex cursor-pointer items-start gap-3 rounded-md border bg-white p-3 transition-colors',
        (disabled || unavailable) && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="mt-0.5">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled || unavailable}
          onCheckedChange={(c) => onChange(c === true)}
        />
      </div>
      <div className="flex-1">
        <p className="text-md-text text-sm font-medium">{t('salonMarseille')}</p>
        <p className="text-md-text-muted mt-0.5 text-xs">
          {unavailable
            ? disabled
              ? '—'
              : t('salonMarseilleUnavailable')
            : t('salonMarseilleAdd', { price: formatEur(supplement) })}
        </p>
      </div>
    </label>
  );
}

function BoothPrefInput({
  idx,
  label,
  value,
  placeholder,
  onChange,
}: {
  idx: number;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = `booth-pref-${idx}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-md-text text-xs font-semibold">
        {label} <span className="text-md-magenta">*</span>
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={20}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="uppercase"
      />
    </div>
  );
}

function PackCard({
  tier,
  locale,
  selected,
  onSelect,
}: {
  tier: PricingTier;
  locale: 'fr' | 'en';
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('signup.step2.caseA');
  const description = locale === 'fr' ? tier.descriptionShortFr : tier.descriptionShortEn;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'border-md-border hover:border-md-blue/50 flex flex-col items-start gap-2 rounded-md border bg-white p-4 text-left transition-colors',
        selected && 'border-md-magenta bg-md-magenta/5 ring-md-magenta/20 ring-2',
      )}
    >
      <span className="text-md-text text-base font-bold">{tier.packCode}</span>
      <span className="text-md-magenta text-sm font-semibold">
        {t('packPriceHt', { price: formatEur(tier.priceEurHt) })}
      </span>
      {description && <span className="text-md-text-muted text-xs">{description}</span>}
    </button>
  );
}

function AddonsList({
  addons,
  selected,
  onChange,
  locale,
}: {
  addons: AddonOption[];
  selected: string[];
  onChange: (id: string, checked: boolean) => void;
  locale: 'fr' | 'en';
}) {
  if (addons.length === 0) {
    return <p className="text-md-text-muted text-xs">—</p>;
  }
  const grouped = addons.reduce<Record<string, AddonOption[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});
  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="space-y-1.5">
          <h4 className="text-md-text-muted text-xs font-semibold tracking-wide uppercase">
            {cat}
          </h4>
          {items.map((a) => (
            <label
              key={a.id}
              className="border-md-border has-[input[data-state=checked]]:border-md-magenta has-[input[data-state=checked]]:bg-md-magenta/5 flex cursor-pointer items-center gap-3 rounded-md border bg-white p-2.5 transition-colors"
            >
              <Checkbox
                checked={selected.includes(a.id)}
                onCheckedChange={(c) => onChange(a.id, c === true)}
              />
              <div className="flex-1">
                <span className="text-md-text text-sm">
                  {locale === 'fr' ? a.nameFr : a.nameEn}
                </span>
                {a.descriptionFr && locale === 'fr' && (
                  <p className="text-md-text-muted text-xs">{a.descriptionFr}</p>
                )}
                {a.descriptionEn && locale === 'en' && (
                  <p className="text-md-text-muted text-xs">{a.descriptionEn}</p>
                )}
              </div>
              <span className="text-md-magenta text-sm font-semibold">
                +{formatEur(a.priceEurHt)} €
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function PaymentRadio({ path }: { path: PaymentPath }) {
  const t = useTranslations('signup.step2.caseA');
  const labels: Record<PaymentPath, [string, string]> = {
    devis_sepa: [t('paymentDevisSepa'), t('paymentDevisSepaDesc')],
    devis_acompte_stripe: [t('paymentDevisAcompteStripe'), t('paymentDevisAcompteStripeDesc')],
    proforma_acompte: [t('paymentProformaAcompte'), t('paymentProformaAcompteDesc')],
    facture_integrale: [t('paymentFactureIntegrale'), t('paymentFactureIntegraleDesc')],
  };
  const [label, desc] = labels[path];
  const id = `payment-${path}`;
  return (
    <label
      htmlFor={id}
      className="border-md-border has-[button[data-state=checked]]:border-md-magenta has-[button[data-state=checked]]:bg-md-magenta/5 flex cursor-pointer items-start gap-3 rounded-md border bg-white p-3 transition-colors"
    >
      <RadioGroupItem value={path} id={id} className="mt-0.5" />
      <div className="flex-1">
        <Label htmlFor={id} className="text-md-text font-semibold">
          {label}
        </Label>
        <p className="text-md-text-muted mt-0.5 text-xs">{desc}</p>
      </div>
    </label>
  );
}

function SummaryBox({
  tier,
  marseilleSelected,
  marseilleSupplement,
  addons,
  totalHt,
  vatRate,
  totalVat,
  totalTtc,
  locale,
}: {
  tier?: PricingTier;
  marseilleSelected: boolean;
  marseilleSupplement: number;
  addons: AddonOption[];
  totalHt: number;
  vatRate: number;
  totalVat: number;
  totalTtc: number;
  locale: 'fr' | 'en';
}) {
  const t = useTranslations('signup.step2.caseA');
  if (!tier) {
    return (
      <p className="text-md-text-muted bg-md-bg-soft/50 rounded-md p-3 text-xs">
        {t('summaryNoPack')}
      </p>
    );
  }
  return (
    <div className="bg-md-bg-soft/60 space-y-2 rounded-md p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-md-text">{t('summaryPackLine', { pack: tier.packCode })}</span>
        <span className="text-md-text font-medium">{formatEur(tier.priceEurHt)} €</span>
      </div>
      {marseilleSelected && marseilleSupplement > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-md-text">{t('summaryMarseille')}</span>
          <span className="text-md-text font-medium">+{formatEur(marseilleSupplement)} €</span>
        </div>
      )}
      {addons.map((a) => (
        <div key={a.id} className="flex items-center justify-between">
          <span className="text-md-text-muted">+ {locale === 'fr' ? a.nameFr : a.nameEn}</span>
          <span className="text-md-text-muted">{formatEur(a.priceEurHt)} €</span>
        </div>
      ))}
      <div className="border-md-border flex items-center justify-between border-t pt-2">
        <span className="text-md-text font-semibold">{t('summaryHt')}</span>
        <span className="text-md-text font-semibold">{formatEur(totalHt)} €</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-md-text-muted">
          {t('summaryVat', { rate: Math.round(vatRate * 100) })}
        </span>
        <span className="text-md-text-muted">{formatEur(totalVat)} €</span>
      </div>
      <div className="border-md-border flex items-center justify-between border-t pt-2 text-base">
        <span className="text-md-text font-bold">{t('summaryTtc')}</span>
        <span className="text-md-magenta font-bold">{formatEur(totalTtc)} €</span>
      </div>
    </div>
  );
}

function NextButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end">
      <Button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="bg-md-magenta hover:bg-md-magenta-soft"
      >
        {label}
      </Button>
    </div>
  );
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

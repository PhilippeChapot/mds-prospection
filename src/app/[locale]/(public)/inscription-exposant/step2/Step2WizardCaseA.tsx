'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import {
  PAYMENT_PATHS,
  type PaymentPath,
  type BoothEvent,
  step2CaseASchema,
} from '@/lib/signup/step2-schema';
import type { Step2Data, AddonOption, BoothOption, PricingTier } from '@/lib/signup/step2-data';
import { cn } from '@/lib/utils';

interface Props {
  signupId: string;
  locale: 'fr' | 'en';
  firstName: string;
  companyName: string;
  data: Step2Data;
  initialDraft: Record<string, unknown>;
}

interface DraftA {
  packCode?: 'ACCESS' | 'CLASSIC' | 'PREMIUM';
  pricingTierId?: string;
  salons: BoothEvent[];
  boothId?: string;
  addonIds: string[];
  paymentPath?: PaymentPath;
  cgvAccepted: boolean;
}

const VAT_RATE_FR = 0.2;

export function Step2WizardCaseA({ locale, firstName, companyName, data, initialDraft }: Props) {
  const t = useTranslations('signup.step2.caseA');
  const router = useRouter();

  const [draft, setDraft] = useState<DraftA>(() => {
    const d = initialDraft as Partial<DraftA>;
    return {
      packCode: d.packCode,
      pricingTierId: d.pricingTierId,
      salons: Array.isArray(d.salons) ? (d.salons as BoothEvent[]) : [],
      boothId: d.boothId,
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

  const filteredBooths = useMemo(() => {
    if (draft.salons.length === 0) return [];
    return data.booths.filter((b) => draft.salons.includes(b.event as BoothEvent));
  }, [data.booths, draft.salons]);

  const filteredAddons = useMemo(() => {
    if (draft.salons.length === 0) return [];
    return data.addons.filter((a) => {
      if (a.scope === 'both') return true;
      if (a.scope === 'prs_only') return draft.salons.includes('paris');
      if (a.scope === 'mds_only') return draft.salons.includes('marseille');
      return false;
    });
  }, [data.addons, draft.salons]);

  const selectedTier = useMemo(
    () => tiers.find((p) => p.id === draft.pricingTierId),
    [tiers, draft.pricingTierId],
  );
  const selectedAddons = useMemo(
    () => data.addons.filter((a) => draft.addonIds.includes(a.id)),
    [data.addons, draft.addonIds],
  );

  const totalHt = useMemo(() => {
    const packPrice = selectedTier?.priceEurHt ?? 0;
    const addonsTotal = selectedAddons.reduce((acc, a) => acc + a.priceEurHt, 0);
    return packPrice + addonsTotal;
  }, [selectedTier, selectedAddons]);

  // En P3 : TVA 20% si FR (par defaut), 0% sinon. La VAT VIES est P4.
  // Pour P3, on ne sait pas le pays exposant ici (pas dans le signup row).
  // -> On affiche TVA 20% par defaut. L'admin verra le pays a la conversion.
  const vatRate = VAT_RATE_FR;
  const totalVat = totalHt * vatRate;
  const totalTtc = totalHt + totalVat;

  const section1Valid = !!draft.packCode && !!draft.pricingTierId && draft.salons.length > 0;
  const section2Valid = section1Valid && !!draft.boothId;
  const section3Valid = section2Valid && !!draft.paymentPath && draft.cgvAccepted;

  // Auto-save partiel a chaque changement (debounce 800ms).
  // setTimeout est dans un callback async -> respecte react-hooks/set-state-in-effect.
  useEffect(() => {
    const payload = {
      mode: 'caseA' as const,
      packCode: draft.packCode,
      pricingTierId: draft.pricingTierId,
      salons: draft.salons,
      boothId: draft.boothId,
      addonIds: draft.addonIds,
      paymentPath: draft.paymentPath,
    };

    const id = setTimeout(() => {
      void fetch('/api/signup/step2/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Silent — best effort. L'utilisateur peut quand meme submit.
      });
    }, 800);
    return () => clearTimeout(id);
  }, [
    draft.packCode,
    draft.pricingTierId,
    draft.salons,
    draft.boothId,
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
      salons: draft.salons,
      boothId: draft.boothId,
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
      const data = (await res.json()) as { success: boolean; ref?: string };
      if (!data.success || !data.ref) {
        setSubmitError(t('needAllStepsValid'));
        setSubmitting(false);
        return;
      }
      router.push({ pathname: '/merci', query: { s: data.ref } });
    } catch {
      setSubmitError(t('needAllStepsValid'));
      setSubmitting(false);
    }
  }

  function chooseSalons(event: BoothEvent, checked: boolean) {
    setDraft((d) => {
      const next = checked
        ? [...new Set([...d.salons, event])]
        : d.salons.filter((e) => e !== event);
      // Reset booth si la selection change (le booth peut ne plus etre valide)
      const boothStillValid =
        d.boothId &&
        data.booths.some((b) => b.id === d.boothId && next.includes(b.event as BoothEvent));
      return {
        ...d,
        salons: next,
        boothId: boothStillValid ? d.boothId : undefined,
        addonIds: d.addonIds.filter((id) => {
          const a = data.addons.find((x) => x.id === id);
          if (!a) return false;
          if (a.scope === 'both') return true;
          if (a.scope === 'prs_only') return next.includes('paris');
          if (a.scope === 'mds_only') return next.includes('marseille');
          return false;
        }),
      };
    });
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
              {/* Salons */}
              <fieldset className="space-y-3">
                <legend className="text-md-text text-sm font-semibold">{t('salonsLegend')}</legend>
                <div className="grid gap-2">
                  <SalonCheckbox
                    id="salon-paris"
                    checked={draft.salons.includes('paris')}
                    onChange={(c) => chooseSalons('paris', c)}
                    label={t('salonParis')}
                  />
                  <SalonCheckbox
                    id="salon-marseille"
                    checked={draft.salons.includes('marseille')}
                    onChange={(c) => chooseSalons('marseille', c)}
                    label={t('salonMarseille')}
                  />
                </div>
              </fieldset>

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

              <NextButton
                disabled={!section1Valid}
                onClick={() => setOpenSection('booth')}
                label={t('continueNext')}
              />
            </AccordionContent>
          </AccordionItem>

          {/* === Section 2 — Booth & Options === */}
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

              {/* Booth select */}
              <fieldset className="space-y-2">
                <legend className="text-md-text text-sm font-semibold">{t('boothLegend')}</legend>
                {filteredBooths.length === 0 ? (
                  <p className="text-md-text-muted text-xs">{t('boothNoneAvailable')}</p>
                ) : (
                  <select
                    value={draft.boothId ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, boothId: e.target.value || undefined }))
                    }
                    className="border-md-border focus:border-md-blue focus:ring-md-blue/20 h-10 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
                  >
                    <option value="">—</option>
                    {filteredBooths.map((b) => (
                      <option key={b.id} value={b.id}>
                        {boothLabel(b)}
                      </option>
                    ))}
                  </select>
                )}
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

function SalonCheckbox({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (c: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="border-md-border has-[input[data-state=checked]]:border-md-magenta has-[input[data-state=checked]]:bg-md-magenta/5 flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3 transition-colors"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <span className="text-md-text text-sm">{label}</span>
    </label>
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
  // Group by category
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
  addons,
  totalHt,
  vatRate,
  totalVat,
  totalTtc,
  locale,
}: {
  tier?: PricingTier;
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
        <span className="text-md-text">
          Pack {tier.packCode} {locale === 'fr' ? '(prs_exhibitor)' : '(PRS exhibitor)'}
        </span>
        <span className="text-md-text font-medium">{formatEur(tier.priceEurHt)} €</span>
      </div>
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

function boothLabel(b: BoothOption): string {
  const parts = [
    b.event === 'paris' ? 'Paris' : b.event === 'marseille' ? 'Marseille' : 'Bruxelles',
    b.code,
  ];
  if (b.label) parts.push(b.label);
  if (b.surfaceM2) parts.push(`${b.surfaceM2} m²`);
  if (b.poleCode) parts.push(b.poleCode);
  return parts.join(' · ');
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

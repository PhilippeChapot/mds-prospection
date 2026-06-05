'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  STEP2_CASE_B_INTERESTS,
  STEP2_CASE_B_BUDGETS,
  STEP2_CASE_B_POLES,
  step2CaseBSchema,
  type Step2CaseBInterest,
  type Step2CaseBBudget,
  type Step2CaseBPole,
} from '@/lib/signup/step2-schema';

interface Props {
  locale: 'fr' | 'en';
  firstName: string;
  companyName: string;
  aiClassificationPole: string | null;
  initialDraft: Record<string, unknown>;
}

interface DraftB {
  interests: Step2CaseBInterest[];
  pole?: Step2CaseBPole;
  budget?: Step2CaseBBudget;
  message: string;
}

export function Step2WizardCaseB({
  firstName,
  companyName,
  aiClassificationPole,
  initialDraft,
}: Props) {
  const t = useTranslations('signup.step2.caseB');
  const router = useRouter();

  const [draft, setDraft] = useState<DraftB>(() => {
    const d = initialDraft as Partial<DraftB>;
    return {
      interests: Array.isArray(d.interests)
        ? (d.interests.filter((x) =>
            STEP2_CASE_B_INTERESTS.includes(x as Step2CaseBInterest),
          ) as Step2CaseBInterest[])
        : [],
      // Pre-fill pole from AI classification if available
      pole: (d.pole as Step2CaseBPole) ?? mapAiPole(aiClassificationPole),
      budget: d.budget as Step2CaseBBudget | undefined,
      message: typeof d.message === 'string' ? d.message : '',
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const valid =
    draft.interests.length > 0 && !!draft.pole && !!draft.budget && draft.message.length >= 0;

  function toggleInterest(value: Step2CaseBInterest, checked: boolean) {
    setDraft((d) => ({
      ...d,
      interests: checked
        ? [...new Set([...d.interests, value])]
        : d.interests.filter((i) => i !== value),
    }));
  }

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);

    const parsed = step2CaseBSchema.safeParse({
      mode: 'caseB',
      interests: draft.interests,
      pole: draft.pole,
      budget: draft.budget,
      message: draft.message,
    });

    if (!parsed.success) {
      setSubmitError(t('submit'));
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
        setSubmitError('error');
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { success: boolean; ref?: string };
      if (!data.success || !data.ref) {
        setSubmitError('error');
        setSubmitting(false);
        return;
      }
      router.push({ pathname: '/merci', query: { s: data.ref } });
    } catch {
      setSubmitError('error');
      setSubmitting(false);
    }
  }

  const interestLabels: Record<Step2CaseBInterest, string> = {
    stand_6: t('interestStand6'),
    stand_9: t('interestStand9'),
    sponsor_show: t('interestSponsorShow'),
    visitor: t('interestVisitor'),
    partner_media: t('interestPartnerMedia'),
  };

  const budgetLabels: Record<Step2CaseBBudget, string> = {
    '500_5k': t('budget500_5k'),
    '5k_15k': t('budget5k_15k'),
    '15k_plus': t('budget15kPlus'),
    tbd: t('budgetTBD'),
  };

  const poleLabels: Record<Step2CaseBPole, string> = {
    REGIES_RETAIL_MEDIA: 'Régies & Retail Media',
    AUDIO_RADIO: 'Audio & Radio',
    DIFFUSION_INFRA: 'Diffusion & Infra',
    VIDEO_CTV: 'Vidéo & CTV',
    OUTDOOR_DOOH: 'Outdoor & DOOH',
    DATA_ADTECH: 'Data & Adtech',
    MULTIPLE: t('poleMultiple'),
  };

  return (
    <>
      <header className="mb-8 text-center">
        <h1 className="text-md-text mb-2 text-3xl font-extrabold">
          {t('heading', { firstName: firstName || companyName })}
        </h1>
        <p className="text-md-text-muted text-base">{t('subheading')}</p>
      </header>

      <Card className="border-md-border space-y-6 p-6 shadow-sm sm:p-7">
        {/* Interests */}
        <fieldset className="space-y-3">
          <legend className="text-md-text text-sm font-semibold">{t('interestLegend')}</legend>
          <div className="grid gap-2">
            {STEP2_CASE_B_INTERESTS.map((interest) => (
              <label
                key={interest}
                className="border-md-border has-[input[data-state=checked]]:border-md-magenta has-[input[data-state=checked]]:bg-md-magenta/5 flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3 transition-colors"
              >
                <Checkbox
                  checked={draft.interests.includes(interest)}
                  onCheckedChange={(c) => toggleInterest(interest, c === true)}
                />
                <span className="text-md-text text-sm">{interestLabels[interest]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Pole */}
        <fieldset className="space-y-3">
          <legend className="text-md-text text-sm font-semibold">{t('poleLegend')}</legend>
          <select
            value={draft.pole ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, pole: e.target.value as Step2CaseBPole }))}
            className="border-md-border focus:border-md-blue focus:ring-md-blue/20 h-10 w-full rounded-md border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">—</option>
            {STEP2_CASE_B_POLES.map((p) => (
              <option key={p} value={p}>
                {poleLabels[p]}
              </option>
            ))}
          </select>
        </fieldset>

        {/* Budget */}
        <fieldset className="space-y-3">
          <legend className="text-md-text text-sm font-semibold">{t('budgetLegend')}</legend>
          <RadioGroup
            value={draft.budget ?? ''}
            onValueChange={(v) => setDraft((d) => ({ ...d, budget: v as Step2CaseBBudget }))}
            className="grid gap-2 sm:grid-cols-2"
          >
            {STEP2_CASE_B_BUDGETS.map((b) => {
              const id = `budget-${b}`;
              return (
                <label
                  key={b}
                  htmlFor={id}
                  className="border-md-border has-[button[data-state=checked]]:border-md-magenta has-[button[data-state=checked]]:bg-md-magenta/5 flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3 transition-colors"
                >
                  <RadioGroupItem value={b} id={id} />
                  <Label htmlFor={id} className="text-md-text text-sm">
                    {budgetLabels[b]}
                  </Label>
                </label>
              );
            })}
          </RadioGroup>
        </fieldset>

        {/* Message */}
        <fieldset className="space-y-2">
          <Label htmlFor="message" className="text-md-text font-semibold">
            {t('messageLegend')}
          </Label>
          <Textarea
            id="message"
            rows={5}
            value={draft.message}
            onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
            placeholder={t('messagePlaceholder')}
            maxLength={2000}
          />
        </fieldset>

        {submitError && (
          <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{submitError === 'error' ? '—' : submitError}</span>
          </div>
        )}

        <Button
          type="button"
          size="lg"
          disabled={!valid || submitting}
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
      </Card>
    </>
  );
}

function mapAiPole(code: string | null): Step2CaseBPole | undefined {
  if (!code) return undefined;
  if (STEP2_CASE_B_POLES.includes(code as Step2CaseBPole)) {
    return code as Step2CaseBPole;
  }
  if (code === 'INCONNU') return 'MULTIPLE';
  return undefined;
}

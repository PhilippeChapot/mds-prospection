import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { STEP2_SESSION_COOKIE, verifyStep2SessionValue } from '@/lib/signup/session';
import { loadStep2Data } from '@/lib/signup/step2-data';
import { Step2WizardCaseA } from './Step2WizardCaseA';
import { Step2WizardCaseB } from './Step2WizardCaseB';
import type { Locale } from 'next-intl';

export const metadata = {
  title: 'Étape 2',
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function Step2Page({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const sessionRaw = cookieStore.get(STEP2_SESSION_COOKIE)?.value;
  const session = verifyStep2SessionValue(sessionRaw);

  if (!session) {
    // Pas de session valide -> on renvoie vers /inscription-exposant
    // (le user peut recommencer depuis le debut).
    redirect(
      '/' + locale + (locale === 'fr' ? '/inscription-exposant' : '/exhibitor-registration'),
    );
  }

  const supabase = getSupabaseServiceClient();
  const { data: signup, error } = await supabase
    .from('public_signup_attempts')
    .select(
      'id, email, contact_first_name, contact_last_name, contact_phone, company_name_input, matched_company_id, derived_category, category, language, status, ai_classification, step2_payload',
    )
    .eq('id', session.signupId)
    .maybeSingle();

  if (error || !signup) {
    notFound();
  }

  if (
    signup.status === 'converted' ||
    signup.status === 'rejected' ||
    signup.status === 'expired'
  ) {
    return <AlreadyDone />;
  }

  const data = await loadStep2Data();
  if (!data) {
    return <NoSeasonError />;
  }

  // Cas A = exposant + societe matchee identifiee comme PRS exhibitor.
  // Tout le reste = Cas B.
  const isCaseA = signup.category === 'exposant' && signup.derived_category === 'prs_exhibitor';

  const firstName = signup.contact_first_name ?? '';
  const companyName = signup.company_name_input ?? '';

  // Reduce step2_payload (jsonb) en draft initial pour le wizard.
  const initialDraft =
    typeof signup.step2_payload === 'object' && signup.step2_payload !== null
      ? (signup.step2_payload as Record<string, unknown>)
      : {};

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-md-magenta mb-2 text-center text-xs font-semibold tracking-widest uppercase">
        2 / 2
      </p>
      {isCaseA ? (
        <Step2WizardCaseA
          locale={locale as 'fr' | 'en'}
          firstName={firstName}
          companyName={companyName}
          data={data}
          initialDraft={initialDraft}
        />
      ) : (
        <Step2WizardCaseB
          locale={locale as 'fr' | 'en'}
          firstName={firstName}
          companyName={companyName}
          aiClassificationPole={
            (signup.ai_classification as { pole_code?: string } | null)?.pole_code ?? null
          }
          initialDraft={initialDraft}
        />
      )}
    </section>
  );
}

function AlreadyDone() {
  const t = useTranslations('signup.step2.alreadyConverted');
  return (
    <section className="mx-auto max-w-xl px-4 py-16">
      <Card className="border-md-border space-y-4 p-8 text-center">
        <h1 className="text-md-text text-2xl font-bold">{t('heading')}</h1>
        <p className="text-md-text-muted">{t('body')}</p>
        <Button asChild variant="outline">
          <Link href="/">↩</Link>
        </Button>
      </Card>
    </section>
  );
}

function NoSeasonError() {
  return (
    <section className="mx-auto max-w-xl px-4 py-16">
      <Card className="border-md-border space-y-4 p-8 text-center">
        <h1 className="text-md-text text-2xl font-bold">Configuration manquante</h1>
        <p className="text-md-text-muted">
          Aucune saison active n&apos;est configurée. Contactez philippe@mediadays.solutions.
        </p>
      </Card>
    </section>
  );
}

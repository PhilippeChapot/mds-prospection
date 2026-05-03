import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { verifyPublicSignupRef } from '@/lib/signup/session';
import type { Locale } from 'next-intl';

export const metadata = {
  title: 'Merci',
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ s?: string }>;
}

type Variant = 'caseA_devis_sepa' | 'caseA_stripe_pending' | 'caseB' | 'fallback';

export default async function ThankYouPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { s } = await searchParams;

  const variant = await detectVariant(s);
  return <Content variant={variant} />;
}

async function detectVariant(ref: string | undefined): Promise<Variant> {
  if (!ref) return 'fallback';
  const signupId = verifyPublicSignupRef(ref);
  if (!signupId) return 'fallback';

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('public_signup_attempts')
    .select('derived_category, step2_payload, status')
    .eq('id', signupId)
    .maybeSingle();

  if (error || !data) return 'fallback';

  // Cas B : derived_category != prs_exhibitor OU step2_payload.mode === 'caseB'
  const payload = data.step2_payload as { mode?: string; paymentPath?: string } | null;
  if (payload?.mode === 'caseB' || data.derived_category !== 'prs_exhibitor') {
    return 'caseB';
  }

  if (payload?.paymentPath === 'devis_sepa') return 'caseA_devis_sepa';
  // Stripe est P4 : pour P3, on regroupe les autres parcours sous "stripe pending".
  if (payload?.paymentPath) return 'caseA_stripe_pending';

  return 'fallback';
}

function Content({ variant }: { variant: Variant }) {
  const t = useTranslations('signup.thankYou');

  const body =
    variant === 'caseA_devis_sepa'
      ? t('bodyDevisSepa')
      : variant === 'caseA_stripe_pending'
        ? t('bodyStripePending')
        : variant === 'caseB'
          ? t('bodyCaseB')
          : t('bodyDevisSepa');

  return (
    <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <Card className="border-md-border space-y-5 p-8 text-center shadow-sm">
        <div className="bg-md-success/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <CheckCircle2 className="text-md-success h-8 w-8" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-md-text text-2xl font-bold">{t('heading')}</h1>
          <p className="text-md-text-muted text-base">{body}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">{t('ctaHome')}</Link>
        </Button>
      </Card>
    </section>
  );
}

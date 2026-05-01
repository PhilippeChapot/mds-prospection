import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Tarifs' };

export default function PricingPage() {
  return (
    <ComingSoon
      title="Tarifs"
      phase="P2"
      description="CRUD pricing_tiers et addon_options. KPI prix par pack (ACCESS / CLASSIC / PREMIUM × PRS / Standard)."
    />
  );
}

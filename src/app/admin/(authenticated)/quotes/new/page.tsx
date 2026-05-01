import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Nouveau devis' };

export default function NewQuotePage() {
  return (
    <ComingSoon
      title="Nouveau devis · mode concierge"
      phase="P4"
      description="Creation directe d'un devis Sellsy depuis un rendez-vous client. Branchement Sellsy + Stripe Payment Link (cf. SPEC §3.21)."
    />
  );
}

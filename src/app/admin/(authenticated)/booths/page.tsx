import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Emplacements' };

export default function BoothsPage() {
  return (
    <ComingSoon
      title="Inventaire emplacements"
      phase="P2"
      description="Vue tableur du plan d'implantation par salon / pole. Locks optimistes a la selection (cf. SPEC §11 P3)."
    />
  );
}

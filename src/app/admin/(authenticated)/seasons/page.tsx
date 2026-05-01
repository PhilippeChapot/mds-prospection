import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Saisons' };

export default function SeasonsPage() {
  return (
    <ComingSoon
      title="Saisons"
      phase="P5"
      description="Gestion des editions du salon (creer, archiver, dupliquer) — cf. SPEC §3.15."
    />
  );
}

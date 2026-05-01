import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Nouveau prospect' };

export default function NewProspectPage() {
  return (
    <ComingSoon
      title="Nouveau prospect"
      phase="P2"
      description="Creation manuelle d'un prospect (societe + contact + statut). CRUD complet en P2."
    />
  );
}

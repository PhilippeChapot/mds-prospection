import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Fiche prospect' };

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ComingSoon
      title={`Fiche prospect ${id}`}
      phase="P2"
      description="Details prospect : societe, contacts, timeline d'activites, synchros, emplacement, options."
    />
  );
}

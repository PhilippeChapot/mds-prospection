import { notFound } from 'next/navigation';
import { ComingSoon } from '@/components/admin/ComingSoon';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Fiche societe' };

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();

  if (!company) notFound();

  return (
    <ComingSoon
      title={`Fiche societe · ${company.name}`}
      phase="P2"
      description="Details societe : contacts lies, historique prospects, reclassement pole manuel."
    />
  );
}

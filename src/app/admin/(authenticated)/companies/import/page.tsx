import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { ImportWizard } from './ImportWizard';

export const metadata = { title: 'Importer des societes' };

export default async function ImportCompaniesPage() {
  await requireAdminProfile();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link
          href="/admin/companies"
          className="text-md-text-muted mb-2 inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Retour aux societes
        </Link>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Importer des societes
        </h1>
        <p className="text-md-text-muted text-sm">
          CSV ou XLSX — preview, mapping de colonnes, dedup automatique par domaine. L&apos;audit
          log capture chaque INSERT/UPDATE individuellement.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}

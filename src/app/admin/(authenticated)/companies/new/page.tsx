import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { isApolloEnabled } from '@/lib/apollo/client';
import { NewCompanyForm } from './NewCompanyForm';

export const metadata = { title: 'Nouvelle societe' };

export default async function NewCompanyPage() {
  await requireAdminProfile();
  const apolloEnabled = await isApolloEnabled();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Nouvelle societe
        </h1>
        <p className="text-md-text-muted text-sm">
          Identite + classification (pole + categorie). Le domaine sera verifie pour eviter les
          doublons.
        </p>
      </header>

      <NewCompanyForm apolloEnabled={apolloEnabled} />
    </div>
  );
}

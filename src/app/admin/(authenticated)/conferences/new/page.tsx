import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { NewConferenceForm } from './NewConferenceForm';

export const metadata = { title: 'Nouvelle conférence' };

export default async function NewConferencePage() {
  await requireAdminProfile();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Nouvelle conférence
        </h1>
        <p className="text-md-text-muted text-sm">
          Renseignez le créneau (heure de Paris), la salle et les pôles. Les speakers
          s&apos;ajoutent ensuite depuis la fiche.
        </p>
      </header>

      <NewConferenceForm />
    </div>
  );
}

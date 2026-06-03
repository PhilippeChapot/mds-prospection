import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { listStaffForNewConversationAction } from '@/lib/internal-messaging/actions';
import { NewConversationForm } from './NewConversationForm';

export const metadata = { title: 'Nouvelle conversation' };
export const dynamic = 'force-dynamic';

export default async function NewConversationPage() {
  await requireAdminProfile();
  const staff = await listStaffForNewConversationAction();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/admin/messages?tab=interne"
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la messagerie interne
      </Link>

      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          ✉️ Nouvelle conversation
        </h1>
        <p className="text-md-text-muted text-sm">
          Choisissez un destinataire (collègue staff ou contact partenaire) puis tapez votre
          message.
        </p>
      </header>

      <NewConversationForm staffOptions={staff} />
    </div>
  );
}

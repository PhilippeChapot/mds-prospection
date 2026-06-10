import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { detectUserProfile } from '@/lib/espace-partenaire/detect-profile';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { ContactProfileForm } from './ContactProfileForm';
import { SecuritySection } from './SecuritySection';

export const metadata = { title: 'Mon profil' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

/**
 * P8.2 — page d'edition du profil contact (prenom/nom/tel/langue).
 * L'email est read-only (identifiant de login).
 */
export default async function ContactProfilePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const localeSafe = locale === 'en' ? 'en' : 'fr';

  const session = await requireContactSession(localeSafe);
  const profile = await detectUserProfile(session.contactId);

  // P11.x — fetch password_set_at pour la section Sécurité
  const supabase = getSupabaseServiceClient();
  const { data: contactAuth } = (await supabase
    .from('contacts')
    .select('password_set_at')
    .eq('id', session.contactId)
    .maybeSingle()) as { data: { password_set_at: string | null } | null };
  if (!profile) {
    return (
      <p className="text-md-text-muted text-sm">
        {localeSafe === 'en' ? 'Profile not found.' : 'Profil introuvable.'}
      </p>
    );
  }

  const copy = {
    fr: {
      title: 'Mon profil',
      subtitle: "Vos coordonnées personnelles. L'email reste fixe (identifiant de connexion).",
      emailLabel: 'Email (identifiant)',
      firstName: 'Prénom',
      lastName: 'Nom',
      phone: 'Téléphone',
      language: 'Langue des emails',
      companyLabel: 'Société rattachée',
      noCompany: 'Aucune société rattachée.',
      submit: 'Enregistrer',
    },
    en: {
      title: 'My profile',
      subtitle: 'Your personal information. The email stays fixed (login identifier).',
      emailLabel: 'Email (login)',
      firstName: 'First name',
      lastName: 'Last name',
      phone: 'Phone',
      language: 'Email language',
      companyLabel: 'Linked company',
      noCompany: 'No linked company.',
      submit: 'Save',
    },
  }[localeSafe];

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          👤 {copy.title}
        </h2>
        <p className="text-md-text-muted mt-1 text-sm">{copy.subtitle}</p>
      </header>

      <section className="border-md-border bg-card space-y-4 rounded-xl border p-5 shadow-sm">
        <div className="space-y-1.5">
          <p className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
            {copy.emailLabel}
          </p>
          <p className="text-md-text font-mono text-sm">{profile.email}</p>
        </div>

        <div className="border-md-border border-t pt-4">
          <ContactProfileForm
            locale={localeSafe}
            initial={{
              first_name: profile.first_name ?? '',
              last_name: profile.last_name ?? '',
              language: profile.language,
            }}
            labels={copy}
          />
        </div>
      </section>

      {/* P11.x — section Sécurité */}
      <SecuritySection locale={localeSafe} passwordSetAt={contactAuth?.password_set_at ?? null} />

      <section className="border-md-border bg-card space-y-2 rounded-xl border p-5 shadow-sm">
        <p className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
          {copy.companyLabel}
        </p>
        {profile.company_id && profile.company_name ? (
          <p className="text-md-text text-sm">
            <Link
              href={`/${localeSafe}/espace-partenaire/dashboard`}
              className="text-md-blue hover:underline"
            >
              {profile.company_name}
            </Link>
          </p>
        ) : (
          <p className="text-md-text-muted text-sm">{copy.noCompany}</p>
        )}
      </section>
    </div>
  );
}

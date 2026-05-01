import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Placeholder dashboard P1/M2 — le vrai dashboard (KPIs + activite) arrive en M3.
 * Le shell (sidebar + topbar + season switcher + user menu) est monte par le layout.
 */
export default async function AdminHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role, email')
    .eq('id', user!.id)
    .single();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="bg-card border-border rounded-2xl border p-8 shadow-sm">
        <span className="text-md-magenta text-xs font-bold tracking-[0.2em] uppercase">
          Console admin · M2 OK
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight">
          Bienvenue {profile?.full_name?.trim() || profile?.email || 'admin'} 👋
        </h1>
        <p className="text-md-text-muted mt-3 text-sm">
          Sidebar + topbar + season switcher + user menu cables. KPIs et tables mock arrivent en M3.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-md-text-muted text-xs font-semibold tracking-wider uppercase">
              Email
            </dt>
            <dd className="mt-1 font-mono">{profile?.email}</dd>
          </div>
          <div>
            <dt className="text-md-text-muted text-xs font-semibold tracking-wider uppercase">
              Role
            </dt>
            <dd className="mt-1 font-mono">{profile?.role}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

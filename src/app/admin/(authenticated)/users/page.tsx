import { redirect } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { listUsers, USER_ROLES, type UserRole } from '@/lib/admin/users/queries';
import { UsersClient } from './UsersClient';

export const metadata = { title: 'Utilisateurs' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 50;

type SearchParams = Promise<{
  role?: string;
  search?: string;
  include_archived?: string;
  page?: string;
}>;

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    redirect('/admin?error=admin_only');
  }

  const params = await searchParams;
  const role =
    params.role && (USER_ROLES as readonly string[]).includes(params.role)
      ? (params.role as UserRole)
      : undefined;
  const search = params.search?.trim() || undefined;
  const includeArchived = params.include_archived === '1';
  const page = Math.max(1, Number(params.page ?? '1'));

  const result = await listUsers({
    role,
    search,
    include_archived: includeArchived,
    page,
    page_size: PER_PAGE,
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Utilisateurs · {result.total}
        </h1>
        <p className="text-md-text-muted text-sm">
          Comptes admin / sales / super_admin. Toutes les mutations sont réservées aux super_admin
          et tracées dans l&apos;audit log.
        </p>
      </header>

      <UsersClient
        initialResult={result}
        currentRole={profile.role}
        currentUserId={profile.id}
        currentFilters={{ role, search, includeArchived, page }}
        perPage={PER_PAGE}
      />
    </div>
  );
}

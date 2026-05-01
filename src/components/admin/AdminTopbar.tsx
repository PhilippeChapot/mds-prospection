import Link from 'next/link';
import { HeaderLogo } from '@/components/brand/HeaderLogo';
import { Breadcrumb } from './Breadcrumb';
import { SeasonSwitcher } from './SeasonSwitcher';
import { UserMenu } from './UserMenu';

export function AdminTopbar({
  fullName,
  email,
  role,
}: {
  fullName: string | null;
  email: string;
  role: string;
}) {
  return (
    <header className="bg-md-blue-deep flex h-14 items-center justify-between gap-4 px-4 shadow-md sm:px-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="flex items-center" aria-label="Retour au dashboard">
          <HeaderLogo category="admin" theme="dark" size={26} />
        </Link>
        <span className="hidden h-6 w-px bg-white/15 sm:block" aria-hidden />
        <div className="hidden sm:block">
          <Breadcrumb />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SeasonSwitcher />
        <UserMenu fullName={fullName} email={email} role={role} />
      </div>
    </header>
  );
}

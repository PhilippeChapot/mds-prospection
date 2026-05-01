import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Utilisateurs' };

export default function UsersPage() {
  return (
    <ComingSoon
      title="Utilisateurs"
      phase="P5"
      description="Gestion comptes admin + commerciale, avec 2FA TOTP obligatoire pour role=admin (cf. SPEC §9.1)."
    />
  );
}

import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Audit log' };

export default function AuditLogPage() {
  return (
    <ComingSoon
      title="Audit log"
      phase="P5"
      description="Tracabilite actions admin sensibles — cf. SPEC §3.16.1."
    />
  );
}

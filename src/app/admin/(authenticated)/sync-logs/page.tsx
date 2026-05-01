import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Logs sync' };

export default function SyncLogsPage() {
  return (
    <ComingSoon
      title="Logs synchronisation"
      phase="P4"
      description="Historique des appels API (Sellsy, Brevo, Connectonair, Stripe)."
    />
  );
}

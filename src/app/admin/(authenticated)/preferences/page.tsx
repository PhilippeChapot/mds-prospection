import { ComingSoon } from '@/components/admin/ComingSoon';

export const metadata = { title: 'Preferences' };

export default function PreferencesPage() {
  return (
    <ComingSoon
      title="Preferences"
      phase="P2"
      description="Reglages app_settings (acompte %, RGPD, integrations, feature flags, saison active, mode test)."
    />
  );
}

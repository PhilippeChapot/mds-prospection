/**
 * P5.x.17 — section "Mes coordonnees" de l'Espace Partenaire V1.3.
 *
 * Wrappe ContactInfoForm avec un titre et capitalize first/last name.
 */

import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { capitalizeName } from '@/lib/format/name';
import { ContactInfoForm } from '../../ContactInfoForm';
import type { SectionProps } from './types';

export async function CoordonneesSection({ data, locale }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'espacePartenaire.dashboard' });

  return (
    <Card className="border-md-border space-y-4 p-5 shadow-sm sm:p-6">
      <h2 className="text-md-text text-base font-semibold">{t('contactInfo.section')}</h2>
      <ContactInfoForm
        initialPhone={data.contact.phone}
        initialRole={data.contact.role}
        fullName={`${capitalizeName(data.contact.first_name)} ${
          capitalizeName(data.contact.last_name) || ''
        }`.trim()}
        email={data.contact.email ?? ''}
      />
    </Card>
  );
}

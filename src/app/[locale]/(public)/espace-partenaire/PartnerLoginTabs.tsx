'use client';

/**
 * P11.x — wrapper client pour les 2 onglets login partenaire.
 * Séparé de page.tsx (server component) pour respecter la doctrine
 * check-use-client-before-event-handlers.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequestMagicLinkForm } from './RequestMagicLinkForm';
import { PasswordLoginForm } from './PasswordLoginForm';

export function PartnerLoginTabs({ locale }: { locale: 'fr' | 'en' }) {
  const [tab, setTab] = useState<'magic' | 'password'>('magic');
  const t = useTranslations('espacePartenaire.tabs');

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'magic' | 'password')}>
      <TabsList className="mb-4 grid w-full grid-cols-2">
        <TabsTrigger value="magic">{t('magicLink')}</TabsTrigger>
        <TabsTrigger value="password">{t('password')}</TabsTrigger>
      </TabsList>

      <TabsContent value="magic">
        <RequestMagicLinkForm locale={locale} />
      </TabsContent>

      <TabsContent value="password">
        <PasswordLoginForm locale={locale} />
      </TabsContent>
    </Tabs>
  );
}

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisitorRequestMagicLinkForm } from './VisitorRequestMagicLinkForm';
import { VisitorPasswordLoginForm } from './VisitorPasswordLoginForm';

export function VisitorLoginTabs({ locale }: { locale: 'fr' | 'en' }) {
  const [tab, setTab] = useState<'magic' | 'password'>('magic');
  const t = useTranslations('espaceVisiteur.tabs');

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as 'magic' | 'password')}>
      <TabsList className="mb-4 grid w-full grid-cols-2">
        <TabsTrigger value="magic">{t('magicLink')}</TabsTrigger>
        <TabsTrigger value="password">{t('password')}</TabsTrigger>
      </TabsList>
      <TabsContent value="magic">
        <VisitorRequestMagicLinkForm locale={locale} />
      </TabsContent>
      <TabsContent value="password">
        <VisitorPasswordLoginForm locale={locale} />
      </TabsContent>
    </Tabs>
  );
}

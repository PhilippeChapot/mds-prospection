'use client';

/**
 * P6.x.3-ter — wrapper Tabs Grid 2D ↔ Plan visuel (partenaire read-only).
 *
 * Combine `<StandsGridReadOnly>` (Grid 2D) et `<PlanCanvaInteractive>` (Plan
 * visuel Canva) avec un toggle shadcn. Utilisé dans la section "Explorer
 * tout le salon" de l'espace partenaire.
 *
 * Note : ce composant n'est PAS utilisé côté admin pour préserver le code
 * drag-drop existant (`EmplacementsClient.tsx` garde sa structure inline).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PlanCanvaInteractive } from './PlanCanvaInteractive';
import { StandsGridReadOnly } from './StandsGridReadOnly';
import type { StandPublicView } from '@/lib/espace-partenaire/stands-public-view';

interface Props {
  stands: StandPublicView[];
  /** Stand de l'partenaire : encadré rose dans les 2 vues. */
  highlightedStandId?: string;
}

export function StandsExplorerView({ stands, highlightedStandId }: Props) {
  const [view, setView] = useState<'grid' | 'plan'>('grid');
  const t = useTranslations('PartenaireDashboard');

  return (
    <Tabs value={view} onValueChange={(v) => setView(v as 'grid' | 'plan')}>
      <TabsList>
        <TabsTrigger value="grid">📊 {t('exploreVenueGrid')}</TabsTrigger>
        <TabsTrigger value="plan">🗺️ {t('exploreVenuePlan')}</TabsTrigger>
      </TabsList>

      <TabsContent value="grid">
        <StandsGridReadOnly stands={stands} highlightedStandId={highlightedStandId} />
      </TabsContent>

      <TabsContent value="plan">
        <PlanCanvaInteractive
          mode="partenaire"
          stands={stands}
          highlightedStandId={highlightedStandId}
        />
      </TabsContent>
    </Tabs>
  );
}

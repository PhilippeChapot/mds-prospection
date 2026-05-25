import { listResourcesAction } from '@/lib/exhibitor-resources/actions';
import { ExhibitorResourcesClient } from './ExhibitorResourcesClient';

export const metadata = { title: 'Ressources exposant' };
export const dynamic = 'force-dynamic';

export default async function ExhibitorResourcesPage() {
  const result = await listResourcesAction();
  const resources = result.ok ? result.data : [];
  const errorMessage = result.ok ? null : result.error;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Ressources exposant
          </h1>
          <p className="text-md-text-muted text-sm">
            Guide exposant, FAQ logistique, chartes graphiques (Markdown bilingue FR/EN).
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-md-danger/40 bg-md-danger/10 text-md-danger rounded-md border px-3 py-2 text-sm">
          Erreur de chargement : {errorMessage}
        </div>
      ) : null}

      <ExhibitorResourcesClient resources={resources} />
    </div>
  );
}

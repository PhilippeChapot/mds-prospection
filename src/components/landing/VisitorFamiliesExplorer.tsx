'use client';

/**
 * P6.x.4-a — grid 14 familles visiteurs + drawer Sheet sur clic.
 *
 * Doctrine messaging (cf. brief) :
 *   - action_landing='visiteur_gratuit' (familles 1-10, 12, 14) →
 *     "S'inscrire comme visiteur (gratuit)" vers wizard visiteur.
 *   - 'institutionnel_form' (famille 11) → ouvre <InstitutionnelEcoleForm>
 *     type='institutionnel'.
 *   - 'ecole_form' (famille 13) → ouvre <InstitutionnelEcoleForm>
 *     type='ecole'.
 */

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { Pole, VisitorFamily } from '@/lib/landing/taxonomy';
import { useInstitutionnelEcoleForm } from './institutionnel-ecole-form-context';

const VISITOR_SIGNUP_URL = '/inscription-exposant?category=visiteur';

function hexWithAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

export function VisitorFamiliesExplorer({
  families,
  poles,
}: {
  families: VisitorFamily[];
  poles: Pole[];
}) {
  const [selected, setSelected] = useState<VisitorFamily | null>(null);
  const polesByCode = new Map(poles.map((p) => [p.code, p]));

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {families.map((fam) => (
          <FamilyCard
            key={fam.id}
            family={fam}
            polesByCode={polesByCode}
            onClick={() => setSelected(fam)}
          />
        ))}
      </div>
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <FamilyDetail
              family={selected}
              polesByCode={polesByCode}
              onAction={() => setSelected(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PoleBadge({ pole, level }: { pole: Pole | undefined; level: number }) {
  if (!pole) return null;
  return (
    <span
      className="text-md-blue-dark inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: hexWithAlpha(pole.color, 0.6) }}
      title={pole.name + (level >= 2 ? ' (forte)' : ' (faible)')}
    >
      <span className="leading-none">{pole.emoji}</span>
      {level >= 2 ? '⚫⚫' : '⚫'}
    </span>
  );
}

function FamilyCard({
  family,
  polesByCode,
  onClick,
}: {
  family: VisitorFamily;
  polesByCode: Map<string, Pole>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-md-border bg-card hover:border-md-magenta/40 group focus-visible:ring-md-magenta/40 flex flex-col rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-md-blue-dark line-clamp-2 text-sm font-bold">{family.name}</h3>
        <span className="text-md-text-muted text-[10px] font-semibold whitespace-nowrap">
          {family.count} entités
        </span>
      </div>
      {family.affinite_poles.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {family.affinite_poles.map((code, i) => (
            <PoleBadge
              key={code}
              pole={polesByCode.get(code)}
              level={family.affinite_levels[i] ?? 1}
            />
          ))}
        </div>
      ) : (
        <div className="text-md-text-muted mb-2 text-[10px] italic">accès transversal</div>
      )}
      <p className="text-md-text-muted line-clamp-2 text-xs">
        {family.exemples.slice(0, 3).join(' · ')}
      </p>
      <span className="text-md-magenta mt-3 flex items-center gap-1 text-xs font-semibold transition-all group-hover:gap-2">
        Voir <ArrowRight className="size-3" aria-hidden />
      </span>
    </button>
  );
}

function FamilyDetail({
  family,
  polesByCode,
  onAction,
}: {
  family: VisitorFamily;
  polesByCode: Map<string, Pole>;
  onAction: () => void;
}) {
  const { openForm } = useInstitutionnelEcoleForm();

  function handleCta() {
    if (family.action_landing === 'institutionnel_form') {
      onAction();
      openForm('institutionnel');
    } else if (family.action_landing === 'ecole_form') {
      onAction();
      openForm('ecole');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-black/5 px-2 py-4">
        <SheetTitle className="text-md-blue-dark text-xl font-extrabold">{family.name}</SheetTitle>
        <SheetDescription className="text-md-text-muted text-xs">
          Famille #{family.id} · {family.count} entités identifiées
        </SheetDescription>
        {family.affinite_poles.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {family.affinite_poles.map((code, i) => (
              <PoleBadge
                key={code}
                pole={polesByCode.get(code)}
                level={family.affinite_levels[i] ?? 1}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <section className="mb-5">
          <h4 className="text-md-blue-dark mb-2 text-sm font-bold tracking-wide uppercase">
            Exemples
          </h4>
          <p className="text-md-text text-sm leading-relaxed">{family.exemples.join(' · ')}</p>
        </section>
        {family.fonctions ? (
          <section>
            <h4 className="text-md-blue-dark mb-2 text-sm font-bold tracking-wide uppercase">
              Fonctions visées
            </h4>
            <p className="text-md-text text-sm leading-relaxed">{family.fonctions}</p>
          </section>
        ) : null}
      </div>

      <div className="border-md-border border-t bg-white p-4">
        {family.action_landing === 'visiteur_gratuit' ? (
          <Button asChild className="bg-md-magenta hover:bg-md-magenta/90 w-full">
            <a href={VISITOR_SIGNUP_URL}>
              S’inscrire comme visiteur (gratuit)
              <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleCta}
            className="bg-md-magenta hover:bg-md-magenta/90 w-full"
          >
            {family.action_landing === 'institutionnel_form'
              ? 'Demander un tarif Institutionnel'
              : 'Demander un tarif École'}
            <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

'use client';

/**
 * P6.x.2a — UI interactive Emplacements.
 *
 * - KPI cards en haut
 * - Filtres (statut, taille)
 * - Grid stands groupés par salle (color-coded par statut)
 * - Sidebar drag source : prospects sans stand
 * - Drag-drop natif HTML5 (pas de lib externe) : sur drop, on appelle
 *   assignStandToProspectAction + revalidatePath.
 * - Clic sur stand → drawer Sheet avec détails + actions (retirer/bloquer)
 */

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X, Lock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  assignStandToProspectAction,
  removeStandFromProspectAction,
  updateStandAction,
  updateStandPositionAction,
} from '@/lib/admin/stands/actions';
import type {
  StandWithProspect,
  StandKpis,
  ProspectWithoutStand,
} from '@/lib/admin/stands/queries';
import { PlanCanvaInteractive } from '@/components/admin/plan/PlanCanvaInteractive';

const SALLE_LABEL: Record<string, string> = {
  delorme: 'Salle Delorme',
  gabriel: 'Salle Gabriel',
  le_notre: 'Salle Le Nôtre',
  foyer: 'Foyer',
  mezzanine: 'Mezzanine',
  soufflot: 'Salle Soufflot',
};

// P6.x.2a-bis : couleurs alignées sur le plan Canva officiel.
//   libre  = vert  (emerald)  — stand commercialisable
//   reserve = orange           — engagement en cours (devis envoyé / lead)
//   paye   = rouge             — engagement financier acté (acompte/signé/intégral)
//   bloque = gris foncé        — hors-vente (couloirs, scènes, zones techniques)
export const STATUS_COLOR: Record<string, { bg: string; ring: string; label: string }> = {
  libre: { bg: 'bg-emerald-50 hover:bg-emerald-100', ring: 'ring-emerald-300', label: 'Libre' },
  reserve: { bg: 'bg-orange-100 hover:bg-orange-200', ring: 'ring-orange-400', label: 'Réservé' },
  paye: { bg: 'bg-red-100 hover:bg-red-200', ring: 'ring-red-400', label: 'Payé' },
  bloque: { bg: 'bg-slate-300', ring: 'ring-slate-500', label: 'Bloqué' },
};

// P6.x.2a-ter — Couleurs de zone (background pâle de chaque cellule selon
// son pôle recommandé) pour reproduire la sectorisation du plan Canva.
export const POLE_ZONE_BG: Record<string, string> = {
  AUDIO_RADIO: 'bg-pink-50',
  DIFFUSION_INFRA: 'bg-purple-50',
  VIDEO_CTV: 'bg-blue-50',
  DATA_ADTECH: 'bg-green-50',
  OUTDOOR_DOOH: 'bg-yellow-50',
};
export const POLE_ZONE_LABEL: Record<string, string> = {
  AUDIO_RADIO: 'Radio & Audio',
  DIFFUSION_INFRA: 'Diffusion & Infra',
  VIDEO_CTV: 'Vidéo & CTV',
  DATA_ADTECH: 'Data & Adtech',
  OUTDOOR_DOOH: 'Outdoor & DOOH',
};

// Grille physique du plan Canva : 8 rangées (A-H) × 11 colonnes (0-10).
// Colonnes affichées de droite à gauche dans le plan → on itère [10..0].
const PLAN_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const PLAN_COLS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const;

const PROSPECT_DRAG_TYPE = 'application/x-prospect-id';

export function EmplacementsClient({
  initialStands,
  initialKpis,
  initialProspects,
}: {
  initialStands: StandWithProspect[];
  initialKpis: StandKpis;
  initialProspects: ProspectWithoutStand[];
}) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<'all' | 'libre' | 'reserve' | 'paye' | 'bloque'>(
    'all',
  );
  const [filterTaille, setFilterTaille] = useState<'all' | '6' | '9' | 'other'>('all');
  const [selectedStand, setSelectedStand] = useState<StandWithProspect | null>(null);
  const [, startTx] = useTransition();
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // P6.x.3 — toggle vue Grid 2D (default) <-> Plan visuel Canva
  const [view, setView] = useState<'grid' | 'plan'>('grid');

  const filteredStands = useMemo(() => {
    let list = initialStands;
    if (filterStatus !== 'all') list = list.filter((s) => s.status === filterStatus);
    if (filterTaille === '6') list = list.filter((s) => s.taille_m2 === 6);
    if (filterTaille === '9') list = list.filter((s) => s.taille_m2 === 9);
    if (filterTaille === 'other') list = list.filter((s) => s.taille_m2 !== 6 && s.taille_m2 !== 9);
    return list;
  }, [initialStands, filterStatus, filterTaille]);

  const groupedBySalle = useMemo(() => {
    const groups = new Map<string, StandWithProspect[]>();
    for (const s of filteredStands) {
      const arr = groups.get(s.salle) ?? [];
      arr.push(s);
      groups.set(s.salle, arr);
    }
    return Array.from(groups.entries());
  }, [filteredStands]);

  function handleDrop(stand: StandWithProspect, prospectId: string) {
    if (stand.status === 'bloque') {
      toast.error('Stand bloqué — assignation impossible.');
      return;
    }
    if (stand.status !== 'libre' && stand.prospect_id !== prospectId) {
      toast.error('Stand déjà occupé.');
      return;
    }
    startTx(async () => {
      const r = await assignStandToProspectAction({ stand_id: stand.id, prospect_id: prospectId });
      if (r.ok) {
        toast.success(`Stand ${stand.number} assigné.`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleRemove(standId: string) {
    startTx(async () => {
      const r = await removeStandFromProspectAction({ stand_id: standId });
      if (r.ok) {
        toast.success('Stand libéré.');
        setSelectedStand(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleToggleBloque(stand: StandWithProspect) {
    const nextStatus = stand.status === 'bloque' ? 'libre' : 'bloque';
    startTx(async () => {
      const r = await updateStandAction({ stand_id: stand.id, status: nextStatus });
      if (r.ok) {
        toast.success(nextStatus === 'bloque' ? 'Stand bloqué.' : 'Stand débloqué.');
        setSelectedStand(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        {/* KPIs — couleurs alignées sur les status (P6.x.2a-bis) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Total" value={initialKpis.total} accent="default" />
          <Kpi label="Libres" value={initialKpis.libre} accent="emerald" />
          <Kpi label="Réservés" value={initialKpis.reserve} accent="orange" />
          <Kpi label="Payés" value={initialKpis.paye} accent="red" />
        </div>

        {/* Filtres */}
        <div className="border-md-border bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <FilterGroup
            label="Statut"
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'libre', label: 'Libres' },
              { value: 'reserve', label: 'Réservés' },
              { value: 'paye', label: 'Payés' },
              { value: 'bloque', label: 'Bloqués' },
            ]}
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as typeof filterStatus)}
          />
          <FilterGroup
            label="Taille"
            options={[
              { value: 'all', label: 'Toutes' },
              { value: '6', label: '6 m²' },
              { value: '9', label: '9 m²' },
              { value: 'other', label: 'Autre' },
            ]}
            value={filterTaille}
            onChange={(v) => setFilterTaille(v as typeof filterTaille)}
          />
          <div className="text-md-text-muted ml-auto text-xs">
            {filteredStands.length} stand{filteredStands.length > 1 ? 's' : ''} affichés
          </div>
        </div>

        {/* P6.x.3 — toggle vue Grid 2D <-> Plan visuel Canva.
            Grid 2D reste le defaut (drag-drop fonctionne, lookup rapide).
            Plan visuel : iframe Canva + overlay clickable. */}
        <Legend />
        <Tabs value={view} onValueChange={(v) => setView(v as 'grid' | 'plan')}>
          <TabsList>
            <TabsTrigger value="grid">📊 Grid 2D</TabsTrigger>
            <TabsTrigger value="plan">🗺️ Plan visuel</TabsTrigger>
          </TabsList>
          <TabsContent value="grid">
            <PlanGrid
              stands={filteredStands.filter((s) => s.salle === 'le_notre')}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              onDrop={handleDrop}
              onSelect={(s) => setSelectedStand(s)}
            />
          </TabsContent>
          <TabsContent value="plan">
            <PlanCanvaInteractive
              mode="admin"
              stands={filteredStands.filter((s) => s.salle === 'le_notre')}
              onStandClick={(s) => setSelectedStand(s)}
            />
          </TabsContent>
        </Tabs>

        {/* Autres salles : flat grid fallback (rare, mais sécurise l'UI si
            l'admin ajoute manuellement un stand dans Foyer/Mezzanine/etc.). */}
        {groupedBySalle
          .filter(([salle]) => salle !== 'le_notre')
          .map(([salle, list]) => (
            <section key={salle}>
              <h2 className="text-md-blue-dark mt-6 mb-3 text-sm font-bold tracking-wide uppercase">
                {SALLE_LABEL[salle] ?? salle} ({list.length})
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {list.map((s) => (
                  <StandCard
                    key={s.id}
                    stand={s}
                    isDragTarget={dragOverId === s.id}
                    onDragOver={(e) => {
                      if (
                        s.status === 'libre' &&
                        e.dataTransfer.types.includes(PROSPECT_DRAG_TYPE)
                      ) {
                        e.preventDefault();
                        setDragOverId(s.id);
                      }
                    }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverId(null);
                      const prospectId = e.dataTransfer.getData(PROSPECT_DRAG_TYPE);
                      if (prospectId) handleDrop(s, prospectId);
                    }}
                    onClick={() => setSelectedStand(s)}
                  />
                ))}
              </div>
            </section>
          ))}
      </div>

      {/* Sidebar : prospects sans stand */}
      <aside className="border-md-border bg-card space-y-2 rounded-lg border p-3 lg:sticky lg:top-4 lg:h-fit">
        <h3 className="text-md-blue-dark text-xs font-bold tracking-wide uppercase">
          Prospects sans stand ({initialProspects.length})
        </h3>
        <p className="text-md-text-muted text-[10px]">
          Glissez une carte sur un stand libre pour l’assigner.
        </p>
        <div className="max-h-[600px] space-y-1.5 overflow-y-auto">
          {initialProspects.length === 0 ? (
            <p className="text-md-text-muted py-4 text-center text-xs">
              Aucun prospect en attente.
            </p>
          ) : (
            initialProspects.map((p) => <ProspectDragCard key={p.id} prospect={p} />)
          )}
        </div>
      </aside>

      <Sheet open={selectedStand !== null} onOpenChange={(o) => !o && setSelectedStand(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selectedStand ? (
            <StandDetail
              stand={selectedStand}
              onRemove={() => handleRemove(selectedStand.id)}
              onToggleBloque={() => handleToggleBloque(selectedStand)}
              onPositionSaved={() => router.refresh()}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'default' | 'emerald' | 'orange' | 'red';
}) {
  const accentClass = {
    default: 'text-md-text',
    emerald: 'text-emerald-700',
    orange: 'text-orange-700',
    red: 'text-red-700',
  }[accent];
  return (
    <div className="border-md-border bg-card rounded-lg border p-3 text-center">
      <div className={`text-2xl font-extrabold tabular-nums ${accentClass}`}>{value}</div>
      <div className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
        {label}
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-md-text-muted text-[10px] font-bold tracking-wide uppercase">
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
            value === opt.value
              ? 'bg-md-magenta text-white'
              : 'border-md-border text-md-text hover:bg-muted border bg-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StandCard({
  stand,
  isDragTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  stand: StandWithProspect;
  isDragTarget: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const c = STATUS_COLOR[stand.status];
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex flex-col items-start gap-1 rounded-lg p-3 text-left ring-2 transition ${c.bg} ${
        isDragTarget
          ? 'ring-md-magenta scale-105'
          : c.ring + ' ring-opacity-60 hover:ring-opacity-100'
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-md-blue-dark text-base font-extrabold">{stand.number}</span>
        <span className="text-md-text-muted text-[9px] font-bold tracking-wide uppercase">
          {c.label}
        </span>
      </div>
      <span className="text-md-text-muted text-[10px]">{stand.taille_m2} m²</span>
      {stand.prospect ? (
        <span className="text-md-text mt-1 line-clamp-1 text-[10px] font-semibold">
          {stand.prospect.company_name}
        </span>
      ) : null}
      {stand.status === 'bloque' ? (
        <Lock className="text-md-text-muted absolute top-2 right-2 size-3" aria-hidden />
      ) : null}
    </button>
  );
}

function ProspectDragCard({ prospect }: { prospect: ProspectWithoutStand }) {
  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(PROSPECT_DRAG_TYPE, prospect.id);
    e.dataTransfer.effectAllowed = 'link';
  }
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="border-md-border hover:border-md-magenta/40 cursor-grab rounded-md border bg-white p-2 text-xs transition active:cursor-grabbing"
    >
      <div className="text-md-text line-clamp-1 font-semibold">{prospect.company_name}</div>
      <div className="text-md-text-muted line-clamp-1 text-[10px]">
        {prospect.status} · {prospect.contact_email ?? 'no email'}
      </div>
    </div>
  );
}

function StandDetail({
  stand,
  onRemove,
  onToggleBloque,
  onPositionSaved,
}: {
  stand: StandWithProspect;
  onRemove: () => void;
  onToggleBloque: () => void;
  onPositionSaved?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-black/5 px-2 py-4">
        <SheetTitle className="text-md-blue-dark flex items-center gap-2 text-xl font-extrabold">
          <MapPin className="size-5" aria-hidden /> Stand {stand.number}
        </SheetTitle>
        <SheetDescription className="text-md-text-muted text-xs">
          {SALLE_LABEL[stand.salle] ?? stand.salle} · {stand.taille_m2} m² ·{' '}
          {STATUS_COLOR[stand.status].label}
        </SheetDescription>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4 text-sm">
        {stand.prospect ? (
          <section className="space-y-1">
            <h4 className="text-md-blue-dark text-xs font-bold tracking-wide uppercase">
              Prospect assigné
            </h4>
            <p className="text-md-text font-semibold">{stand.prospect.company_name}</p>
            <p className="text-md-text-muted text-xs">
              {stand.prospect.contact_email ?? '—'} · status {stand.prospect.status}
            </p>
            <a
              href={`/admin/prospects/${stand.prospect.id}`}
              className="text-md-magenta inline-block text-xs font-semibold underline"
            >
              Voir la fiche prospect →
            </a>
          </section>
        ) : (
          <p className="text-md-text-muted text-xs">Aucun prospect assigné.</p>
        )}

        {stand.pole_recommended ? (
          <p className="text-md-text-muted mt-4 text-xs">
            <strong>Pôle recommandé :</strong> {stand.pole_recommended}
          </p>
        ) : null}
        {stand.notes ? (
          <p className="text-md-text-muted mt-4 text-xs whitespace-pre-wrap">
            <strong>Notes :</strong> {stand.notes}
          </p>
        ) : null}

        {/* P6.x.3 — calibration position overlay plan Canva */}
        <PositionCalibration stand={stand} onSaved={onPositionSaved} />
      </div>

      <div className="border-md-border space-y-2 border-t bg-white p-4">
        {stand.prospect ? (
          <Button type="button" variant="outline" onClick={onRemove} className="w-full">
            <X className="mr-1.5 size-3.5" aria-hidden />
            Retirer l’assignation
          </Button>
        ) : null}
        {stand.status !== 'paye' && stand.status !== 'reserve' ? (
          <Button type="button" variant="outline" onClick={onToggleBloque} className="w-full">
            <Lock className="mr-1.5 size-3.5" aria-hidden />
            {stand.status === 'bloque' ? 'Débloquer' : 'Bloquer (hors-vente)'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// P6.x.2a-ter — Légende + Grid 2D reproduisant le plan Canva
// ---------------------------------------------------------------------------

function Legend() {
  const poles: Array<keyof typeof POLE_ZONE_BG> = [
    'AUDIO_RADIO',
    'DIFFUSION_INFRA',
    'VIDEO_CTV',
    'DATA_ADTECH',
    'OUTDOOR_DOOH',
  ];
  return (
    <div className="border-md-border bg-card flex flex-wrap items-center gap-4 rounded-lg border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-md-text-muted text-[10px] font-bold tracking-wide uppercase">
          Zones
        </span>
        {poles.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span
              className={`size-3 rounded ${POLE_ZONE_BG[p]} ring-1 ring-black/10`}
              aria-hidden
            />
            {POLE_ZONE_LABEL[p]}
          </span>
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <span className="text-md-text-muted text-[10px] font-bold tracking-wide uppercase">
          Statut
        </span>
        <StatusDot color="bg-emerald-400" label="Libre" />
        <StatusDot color="bg-orange-500" label="Réservé" />
        <StatusDot color="bg-red-500" label="Payé" />
        <StatusDot color="bg-slate-500" label="Bloqué" />
      </div>
    </div>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}

function PlanGrid({
  stands,
  dragOverId,
  setDragOverId,
  onDrop,
  onSelect,
}: {
  stands: StandWithProspect[];
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onDrop: (stand: StandWithProspect, prospectId: string) => void;
  onSelect: (stand: StandWithProspect) => void;
}) {
  const byNumber = useMemo(() => {
    const m = new Map<string, StandWithProspect>();
    for (const s of stands) m.set(s.number, s);
    return m;
  }, [stands]);

  return (
    <section>
      <h2 className="text-md-blue-dark mb-3 text-sm font-bold tracking-wide uppercase">
        Salle Le Nôtre — Plan
      </h2>
      <div
        className="grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: 'auto repeat(11, minmax(0, 1fr))' }}
      >
        {/* Header colonnes (10 → 0, gauche → droite, comme dans le plan Canva) */}
        <div aria-hidden />
        {PLAN_COLS.map((col) => (
          <div
            key={`h-${col}`}
            className="text-md-text-muted text-center text-[10px] font-bold tracking-wide uppercase"
          >
            {col}
          </div>
        ))}

        {/* Rangées A → H */}
        {PLAN_ROWS.map((row) => (
          <Fragment key={row}>
            <div className="text-md-blue-dark flex items-center justify-center text-lg font-extrabold">
              {row}
            </div>
            {PLAN_COLS.map((col) => {
              const num = `${row}${col}`;
              const stand = byNumber.get(num);
              if (!stand) {
                return (
                  <div
                    key={num}
                    aria-hidden
                    className="aspect-square rounded bg-slate-50/60"
                    title={`${num} — pas de stand (allée / scène)`}
                  />
                );
              }
              return (
                <StandCell
                  key={num}
                  stand={stand}
                  isDragTarget={dragOverId === stand.id}
                  onDragOver={(e) => {
                    if (
                      stand.status === 'libre' &&
                      e.dataTransfer.types.includes(PROSPECT_DRAG_TYPE)
                    ) {
                      e.preventDefault();
                      setDragOverId(stand.id);
                    }
                  }}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverId(null);
                    const prospectId = e.dataTransfer.getData(PROSPECT_DRAG_TYPE);
                    if (prospectId) onDrop(stand, prospectId);
                  }}
                  onClick={() => onSelect(stand)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function StandCell({
  stand,
  isDragTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  stand: StandWithProspect;
  isDragTarget: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const status = STATUS_COLOR[stand.status];
  const zoneBg = (stand.pole_recommended && POLE_ZONE_BG[stand.pole_recommended]) || 'bg-slate-50';
  // Border colorée selon le status (couleurs P6.x.2a-ter : vert/orange/rouge/gris).
  const borderClass = {
    libre: 'border-emerald-500',
    reserve: 'border-orange-500',
    paye: 'border-red-500',
    bloque: 'border-slate-400',
  }[stand.status];
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-stand-number={stand.number}
      data-stand-status={stand.status}
      data-pole-zone={stand.pole_recommended ?? ''}
      className={`relative flex aspect-square flex-col items-start gap-0.5 rounded border-2 p-1.5 text-left transition hover:shadow-md ${zoneBg} ${borderClass} ${
        isDragTarget ? 'ring-md-magenta scale-[1.04] ring-2' : ''
      }`}
      title={`${stand.number} — ${stand.taille_m2} m² — ${status.label}${
        stand.prospect ? ` — ${stand.prospect.company_name}` : ''
      }`}
    >
      <span className="text-md-blue-dark text-xs leading-none font-extrabold">{stand.number}</span>
      <span className="text-md-text-muted text-[9px] leading-none">{stand.taille_m2}m²</span>
      {stand.prospect ? (
        <span className="text-md-text mt-0.5 line-clamp-1 text-[9px] leading-tight font-semibold">
          {stand.prospect.company_name}
        </span>
      ) : null}
      {stand.status === 'bloque' ? (
        <Lock className="text-md-text-muted absolute right-1 bottom-1 size-2.5" aria-hidden />
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// P6.x.3 — PositionCalibration : 4 inputs % pour ajuster la position du
//          rectangle overlay sur le plan Canva.
// ---------------------------------------------------------------------------

function PositionCalibration({
  stand,
  onSaved,
}: {
  stand: StandWithProspect;
  onSaved?: () => void;
}) {
  const [x, setX] = useState<string>(stand.position_x?.toString() ?? '');
  const [y, setY] = useState<string>(stand.position_y?.toString() ?? '');
  const [w, setW] = useState<string>(stand.position_w?.toString() ?? '');
  const [h, setH] = useState<string>(stand.position_h?.toString() ?? '');
  const [saving, startTx] = useTransition();

  function save() {
    const nx = Number(x);
    const ny = Number(y);
    const nw = Number(w);
    const nh = Number(h);
    if ([nx, ny, nw, nh].some((n) => !Number.isFinite(n) || n < 0 || n > 100)) {
      toast.error('Toutes les coordonnées doivent être comprises entre 0 et 100.');
      return;
    }
    startTx(async () => {
      const r = await updateStandPositionAction({
        stand_id: stand.id,
        position_x: nx,
        position_y: ny,
        position_w: nw,
        position_h: nh,
      });
      if (r.ok) {
        toast.success(`Position du stand ${stand.number} mise à jour.`);
        onSaved?.();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <section className="mt-6 border-t pt-4">
      <h4 className="text-md-blue-dark mb-1 text-xs font-bold tracking-wide uppercase">
        📍 Position sur le plan visuel
      </h4>
      <p className="text-md-text-muted mb-3 text-[10px]">
        Coordonnées en % (0-100) relatives au plan Canva. Ajustez pour aligner le rectangle sur la
        case du stand.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <PositionInput label="X (gauche)" value={x} onChange={setX} />
        <PositionInput label="Y (haut)" value={y} onChange={setY} />
        <PositionInput label="Largeur" value={w} onChange={setW} />
        <PositionInput label="Hauteur" value={h} onChange={setH} />
      </div>
      <Button
        type="button"
        onClick={save}
        disabled={saving}
        size="sm"
        className="mt-3 w-full"
        variant="outline"
      >
        {saving ? 'Enregistrement…' : 'Mettre à jour la position'}
      </Button>
    </section>
  );
}

function PositionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-md-text-muted text-[10px]">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-md-border focus:border-md-magenta rounded border px-2 py-1 text-sm focus:outline-none"
      />
    </label>
  );
}

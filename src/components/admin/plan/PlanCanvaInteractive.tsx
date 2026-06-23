'use client';

/**
 * P6.x.3 — Plan Canva interactif (iframe + overlay HTML cliquable).
 *
 * Reutilise dans 2 contextes :
 *   - mode='admin'    : /admin/emplacements toggle "Plan visuel" -> click stand
 *                       ouvre le Sheet d'admin (drag-drop non supporte ici).
 *   - mode='partenaire' : fiche stand espace partenaire -> son stand est mis en
 *                       evidence (ring rose) + tooltips voisins. Si voisin
 *                       company_public_visibility=false, on n'affiche pas le
 *                       nom (RGPD doctrine P6.x.3).
 *
 * Calibration : positions en % (0-100) relatives au Canva 16:9. Stands sans
 * coordonnees (position_x null) sont silencieusement ignores du rendu.
 *
 * Iframe = aspect ratio 56.25% (16:9 Canva officiel) avec overlay HTML.
 * `pointer-events-none` sur l'overlay container ; `pointer-events-auto`
 * sur chaque rectangle pour laisser passer le scroll/zoom de l'iframe.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { StandPublicView } from '@/lib/espace-partenaire/stands-public-view';

const CANVA_PLAN_URL = 'https://www.canva.com/design/DAHGZNYdF2Q/3qgDD2_2W3KQJWUe_JpHIg/view?embed';

type Mode = 'admin' | 'partenaire';

interface Props {
  mode: Mode;
  /** P6.x.3-ter : accepte StandPublicView (sanitized) ou super-type
   *  StandWithProspect côté admin (compat ascendante via structural typing). */
  stands: StandPublicView[];
  /** Pour partenaire : son stand est encadre rose et tooltip "Votre stand". */
  highlightedStandId?: string;
  onStandClick?: (stand: StandPublicView) => void;
}

const STATUS_OVERLAY: Record<string, string> = {
  libre: 'bg-emerald-400/40 hover:bg-emerald-400/60 border-emerald-600',
  reserve: 'bg-orange-400/50 hover:bg-orange-400/70 border-orange-600',
  reserve_signe: 'bg-amber-500/50 hover:bg-amber-500/70 border-amber-700',
  paye: 'bg-red-400/50 hover:bg-red-400/70 border-red-600',
  bloque: 'bg-slate-400/40 border-slate-500 cursor-not-allowed',
};

const STATUS_LABEL: Record<string, string> = {
  libre: 'Libre',
  reserve: 'Réservé',
  reserve_signe: 'Réservé signé',
  paye: 'Payé',
  bloque: 'Bloqué',
};

export function PlanCanvaInteractive({ mode, stands, highlightedStandId, onStandClick }: Props) {
  const [hoveredStandId, setHoveredStandId] = useState<string | null>(null);
  const hovered = hoveredStandId ? (stands.find((s) => s.id === hoveredStandId) ?? null) : null;

  const positioned = stands.filter(
    (s) =>
      s.position_x !== null &&
      s.position_y !== null &&
      s.position_w !== null &&
      s.position_h !== null,
  );

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg shadow-md"
      style={{ paddingTop: '56.25%' }}
      data-testid="plan-canva-interactive"
      data-mode={mode}
    >
      <iframe
        src={CANVA_PLAN_URL}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        allowFullScreen
        allow="fullscreen"
        title="Plan Salle Le Nôtre — MediaDays Solutions 2026"
      />

      <div className="pointer-events-none absolute inset-0">
        {positioned.map((stand) => {
          const isHighlight = stand.id === highlightedStandId;
          const isDisabled = stand.status === 'bloque';
          return (
            <button
              key={stand.id}
              type="button"
              onClick={() => onStandClick?.(stand)}
              onMouseEnter={() => setHoveredStandId(stand.id)}
              onMouseLeave={() => setHoveredStandId(null)}
              onFocus={() => setHoveredStandId(stand.id)}
              onBlur={() => setHoveredStandId(null)}
              disabled={isDisabled}
              data-stand-number={stand.number}
              data-stand-status={stand.status}
              data-highlighted={isHighlight ? 'true' : undefined}
              style={{
                left: `${stand.position_x}%`,
                top: `${stand.position_y}%`,
                width: `${stand.position_w}%`,
                height: `${stand.position_h}%`,
              }}
              className={cn(
                'pointer-events-auto absolute flex items-center justify-center rounded border-2 text-[10px] font-bold text-white drop-shadow transition-all',
                STATUS_OVERLAY[stand.status],
                isHighlight && 'z-10 ring-4 ring-pink-500 ring-offset-2',
              )}
              aria-label={`Stand ${stand.number}, ${stand.taille_m2}m², ${STATUS_LABEL[stand.status]}`}
            >
              {stand.number}
            </button>
          );
        })}
      </div>

      {hovered ? (
        <StandTooltip
          stand={hovered}
          mode={mode}
          isHighlighted={hovered.id === highlightedStandId}
        />
      ) : null}
    </div>
  );
}

function StandTooltip({
  stand,
  mode,
  isHighlighted,
}: {
  stand: StandPublicView;
  mode: Mode;
  isHighlighted: boolean;
}) {
  // P6.x.3-ter — i18n + RGPD opt-out précis :
  //   - libre        -> "Disponible"
  //   - reserve/paye -> nom company si public_visibility=true (admin: toujours),
  //                     sinon "Confidentiel" italique
  //   - bloque       -> "Bloqué", pas de nom
  const t = useTranslations('PartenaireDashboard');
  const statusLabel = t(`stand_status_${stand.status}` as const);

  let nameLine: { text: string; muted: boolean } | null = null;
  if (stand.prospect && stand.status !== 'bloque' && stand.status !== 'libre') {
    const canShow = mode === 'admin' || stand.prospect.company_public_visibility !== false;
    if (canShow && stand.prospect.company_name) {
      nameLine = { text: stand.prospect.company_name, muted: false };
    } else if (!canShow) {
      nameLine = { text: t('stand_company_hidden'), muted: true };
    }
  }

  return (
    <div
      role="tooltip"
      className="absolute top-2 left-2 z-20 max-w-xs rounded-md bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/10"
      data-testid="stand-tooltip"
    >
      <div className="text-md-blue-dark font-extrabold">
        Stand {stand.number}
        {isHighlighted ? <span className="ml-2 text-pink-600">★ {t('your_booth')}</span> : null}
      </div>
      <div className="text-md-text-muted text-[10px]">
        {stand.taille_m2} m² · {statusLabel}
      </div>
      {nameLine ? (
        <div
          className={cn(
            'mt-1 text-[11px] font-semibold',
            nameLine.muted ? 'text-md-text-muted italic' : 'text-md-text',
          )}
        >
          {nameLine.text}
        </div>
      ) : null}
    </div>
  );
}

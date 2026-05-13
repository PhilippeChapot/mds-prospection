/**
 * P5.x.17 — petit composant Row partage par plusieurs sections de
 * l'Espace Exposant V1.3 (label/value sur 2 colonnes, ou value pleine
 * largeur si label vide).
 */

export function Row({ label, value }: { label: string; value: string }) {
  if (!label) {
    return <p className="text-md-text text-sm">{value}</p>;
  }
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="text-md-text-muted">{label}</span>
      <span className="text-md-text font-medium">{value}</span>
    </div>
  );
}

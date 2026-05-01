import Link from 'next/link';
import { Plus, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProspectsTable } from '@/components/admin/ProspectsTable';
import { PROSPECTS_MOCK } from '@/lib/mock/dashboard-data';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Prospects' };

const FILTER_CHIPS = [
  { label: 'Tous', count: 142, active: true },
  { label: 'A relancer', count: 12, active: false },
  { label: 'Signes', count: 14, active: false },
  { label: 'Pole Audio', count: 38, active: true, removable: true },
];

const STATUS_OPTIONS = ['Tous statuts', 'Lead', 'Devis envoye', 'Acompte paye', 'Signe', 'Perdu'];
const OWNER_OPTIONS = ['Tous owners', 'Phil', 'Commerciale'];

export default function ProspectsListPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Prospects · 142
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled title="Disponible en P2">
            <Download className="size-4" aria-hidden />
            Exporter CSV
          </Button>
          <Button asChild>
            <Link href="/admin/prospects/new">
              <Plus className="size-4" aria-hidden />
              Nouveau prospect
            </Link>
          </Button>
        </div>
      </div>

      {/* Barre de filtres — UI uniquement en P1, le filtrage reel arrive en P2 */}
      <div className="bg-card border-md-border flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
        <div className="relative min-w-[260px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            placeholder="Rechercher societe, contact, email, ville…"
            className="pl-9"
            disabled
          />
        </div>

        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            disabled
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition',
              chip.active
                ? 'bg-md-blue/10 border-md-blue/30 text-md-blue'
                : 'border-md-border text-md-text-muted bg-white',
            )}
          >
            <span>{chip.label}</span>
            <span className="text-[10px] opacity-70">({chip.count})</span>
            {chip.removable ? <span className="text-md-text-muted ml-0.5 text-xs">×</span> : null}
          </button>
        ))}

        <select
          disabled
          className="border-md-border text-md-text-muted rounded-md border bg-white px-2.5 py-1.5 text-xs"
          defaultValue={STATUS_OPTIONS[0]}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>

        <select
          disabled
          className="border-md-border text-md-text-muted rounded-md border bg-white px-2.5 py-1.5 text-xs"
          defaultValue={OWNER_OPTIONS[0]}
        >
          {OWNER_OPTIONS.map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <ProspectsTable rows={PROSPECTS_MOCK} />

      <div className="text-md-text-muted flex items-center justify-between text-xs">
        <span>Affichage 1-6 sur 142 (mock data)</span>
        <div className="flex gap-1">
          {(['‹', '1', '2', '3', '…', '24', '›'] as const).map((label, i) => (
            <button
              key={i}
              type="button"
              disabled
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] font-semibold transition',
                label === '1'
                  ? 'border-md-magenta/40 bg-md-magenta/10 text-md-magenta'
                  : 'border-md-border bg-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-md-text-muted border-md-border bg-muted/30 rounded-md border border-dashed px-4 py-3 text-xs">
        Donnees mock pour valider le visuel P1. Les filtres, la recherche, la pagination et le CRUD
        sont branches en P2 (cf. SPEC §11).
      </p>
    </div>
  );
}

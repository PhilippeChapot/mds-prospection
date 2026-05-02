import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { StatusPill } from './StatusPill';
import { PACK_LABEL } from '@/lib/supabase/queries';
import type { Database } from '@/lib/supabase/database.types';

type ProspectStatus = Database['public']['Enums']['prospect_status'];
type PackCode = Database['public']['Enums']['pack_code'];

export type LinkedProspect = {
  id: string;
  status: ProspectStatus;
  pack_code: PackCode;
  estimated_amount: number | null;
  contact_email: string | null;
  owner_label: string | null;
  created_at: string;
};

function formatEur(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value).toLocaleString('fr-FR')} €`;
}

export function LinkedProspectsTable({ rows }: { rows: LinkedProspect[] }) {
  if (rows.length === 0) {
    return <p className="text-md-text-muted text-sm">Aucun prospect rattache a cette societe.</p>;
  }
  return (
    <div className="border-md-border overflow-hidden rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-md-text-muted text-[10px] font-bold tracking-wider uppercase">
          <tr>
            <th className="px-3 py-2">Contact</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Pack</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2 text-right">€ HT</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-md-border hover:bg-muted/30 border-t">
              <td className="px-3 py-2 text-xs">{row.contact_email ?? '—'}</td>
              <td className="px-3 py-2">
                <StatusPill status={row.status} />
              </td>
              <td className="px-3 py-2 text-xs font-semibold">
                {row.pack_code === 'A_DEFINIR' ? (
                  <span className="text-md-text-muted">—</span>
                ) : (
                  PACK_LABEL[row.pack_code]
                )}
              </td>
              <td className="px-3 py-2 text-xs">{row.owner_label ?? '—'}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">
                {formatEur(row.estimated_amount)}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/admin/prospects/${row.id}`}
                  className="text-md-blue inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  Voir
                  <ArrowUpRight className="size-3" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

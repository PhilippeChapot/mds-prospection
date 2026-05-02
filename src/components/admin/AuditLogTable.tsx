import Link from 'next/link';
import { History, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/lib/supabase/database.types';

type AuditAction = Database['public']['Enums']['audit_action'];

export type AuditLogRow = {
  id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  user: { full_name: string | null; email: string } | null;
};

const ACTION_LABEL: Record<AuditAction, string> = {
  create: 'Creation',
  update: 'Modification',
  delete: 'Suppression',
  login: 'Connexion',
  rgpd_rtbf: 'RGPD effacement',
  rgpd_export: 'RGPD export',
  sync_manual: 'Sync manuelle',
};

const ENTITY_DETAIL_PATH: Record<string, string> = {
  prospects: '/admin/prospects',
  companies: '/admin/companies',
};

const SKIP_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'last_activity_at',
  'name_normalized',
]);

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActionBadge({ action }: { action: AuditAction }) {
  const Icon =
    action === 'create'
      ? Plus
      : action === 'delete'
        ? Trash2
        : action === 'update'
          ? Pencil
          : History;
  const cls =
    action === 'create'
      ? 'bg-md-success/15 text-md-success'
      : action === 'update'
        ? 'bg-md-blue/15 text-md-blue'
        : action === 'delete'
          ? 'bg-md-danger/15 text-md-danger'
          : 'bg-muted text-md-text-muted';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase',
        cls,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {ACTION_LABEL[action]}
    </span>
  );
}

function shortId(id: string | null): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

function diffSummary(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { key: string; from: unknown; to: unknown }[] {
  if (!before || !after) return [];
  const out: { key: string; from: unknown; to: unknown }[] = [];
  for (const key of Object.keys(after)) {
    if (SKIP_KEYS.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out.push({ key, from: before[key], to: after[key] });
    }
  }
  return out;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v).slice(0, 80);
}

export function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border-md-border rounded-xl border p-12 text-center shadow-sm">
        <p className="text-md-text font-semibold">Aucune entree audit ne correspond.</p>
        <p className="text-md-text-muted mt-2 text-sm">Modifie les filtres ou la periode.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-3 py-3">Quand</th>
              <th className="px-3 py-3">Acteur</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3">Entite</th>
              <th className="px-3 py-3">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const path = ENTITY_DETAIL_PATH[row.entity_type];
              const linkable = path && row.entity_id && row.action !== 'delete';
              const changes = diffSummary(row.before, row.after);
              return (
                <tr key={row.id} className="border-md-border border-t align-top">
                  <td className="text-md-text-muted px-3 py-3 text-xs whitespace-nowrap">
                    {formatTs(row.created_at)}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {row.user ? (
                      <span className="text-md-text font-medium">
                        {row.user.full_name?.trim() || row.user.email}
                      </span>
                    ) : (
                      <span className="text-md-text-muted italic">Systeme</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <ActionBadge action={row.action} />
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <code className="text-md-text-muted text-[11px]">{row.entity_type}</code>
                    <span className="text-md-text-muted">#</span>
                    {linkable ? (
                      <Link
                        href={`${path}/${row.entity_id}`}
                        className="text-md-blue font-mono hover:underline"
                      >
                        {shortId(row.entity_id)}
                      </Link>
                    ) : (
                      <span className="text-md-text-muted font-mono">{shortId(row.entity_id)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.action === 'create' ? (
                      <details className="text-xs">
                        <summary className="text-md-text-muted cursor-pointer">
                          Voir la creation
                        </summary>
                        <pre className="bg-muted/40 text-md-text mt-1 max-h-40 overflow-auto rounded p-2 text-[10px]">
                          {JSON.stringify(row.after, null, 2)}
                        </pre>
                      </details>
                    ) : row.action === 'delete' ? (
                      <details className="text-xs">
                        <summary className="text-md-text-muted cursor-pointer">
                          Voir l&apos;etat avant suppression
                        </summary>
                        <pre className="bg-muted/40 text-md-text mt-1 max-h-40 overflow-auto rounded p-2 text-[10px]">
                          {JSON.stringify(row.before, null, 2)}
                        </pre>
                      </details>
                    ) : changes.length === 0 ? (
                      <span className="text-md-text-muted text-xs">—</span>
                    ) : (
                      <details className="text-xs">
                        <summary className="text-md-text-muted cursor-pointer">
                          {changes.length} champ(s) modifie(s)
                        </summary>
                        <ul className="mt-1.5 space-y-0.5">
                          {changes.slice(0, 8).map((c) => (
                            <li key={c.key} className="text-[11px]">
                              <code className="text-md-text-muted">{c.key}</code>{' '}
                              <span className="text-md-danger line-through">
                                {stringify(c.from)}
                              </span>{' '}
                              <span aria-hidden>→</span>{' '}
                              <span className="text-md-success">{stringify(c.to)}</span>
                            </li>
                          ))}
                          {changes.length > 8 && (
                            <li className="text-md-text-muted text-[10px]">
                              …et {changes.length - 8} autre(s)
                            </li>
                          )}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

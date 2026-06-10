import { History, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatParisDateTime } from '@/lib/format/dates';

export type AuditRow = {
  id: string;
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'login'
    | 'rgpd_rtbf'
    | 'rgpd_export'
    | 'sync_manual'
    | 'partner_password_login'
    | 'partner_password_set'
    | 'partner_password_removed'
    | 'partner_password_reset_requested'
    | 'partner_password_reset_consumed'
    | 'admin_triggered_partner_magic_link'
    | 'admin_triggered_partner_password_reset'
    | 'admin_removed_partner_password';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  user: { full_name: string | null; email: string } | null;
};

/**
 * Ne montre que les champs "metier" pour les diffs — on filtre les colonnes
 * techniques (id, created_at, updated_at, last_activity_at) qui changent
 * automatiquement.
 */
const SKIP_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'last_activity_at',
  'name_normalized',
]);

export function AuditTimeline({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <p className="text-md-text-muted text-sm">Aucune entree audit pour cet element.</p>;
  }
  return (
    <ol className="border-md-border relative space-y-3 border-l pl-5">
      {rows.map((row) => (
        <li key={row.id} className="relative">
          <span
            className={cn(
              'absolute -left-[27px] flex size-5 items-center justify-center rounded-full',
              row.action === 'create' && 'bg-md-success/15 text-md-success',
              row.action === 'update' && 'bg-md-blue/15 text-md-blue',
              row.action === 'delete' && 'bg-md-danger/15 text-md-danger',
              row.action !== 'create' &&
                row.action !== 'update' &&
                row.action !== 'delete' &&
                'bg-muted text-md-text-muted',
            )}
          >
            <ActionIcon action={row.action} />
          </span>
          <div className="text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            {ACTION_LABEL[row.action] ?? row.action}
            <span aria-hidden> · </span>
            <span className="text-md-text-muted normal-case">{formatTs(row.created_at)}</span>
            {row.user && (
              <>
                <span aria-hidden> · </span>
                <span className="text-md-text-muted normal-case">
                  {row.user.full_name?.trim() || row.user.email}
                </span>
              </>
            )}
          </div>
          <DiffSummary action={row.action} before={row.before} after={row.after} />
        </li>
      ))}
    </ol>
  );
}

const ACTION_LABEL: Record<AuditRow['action'], string> = {
  create: 'Creation',
  update: 'Modification',
  delete: 'Suppression',
  login: 'Connexion',
  rgpd_rtbf: 'RGPD effacement',
  rgpd_export: 'RGPD export',
  sync_manual: 'Sync manuelle',
  partner_password_login: 'Connexion mot de passe',
  partner_password_set: 'Mot de passe défini',
  partner_password_removed: 'Mot de passe supprimé',
  partner_password_reset_requested: 'Reset demandé',
  partner_password_reset_consumed: 'Reset consommé',
  admin_triggered_partner_magic_link: 'Magic link admin',
  admin_triggered_partner_password_reset: 'Reset admin',
  admin_removed_partner_password: 'Suppression MDP admin',
};

function ActionIcon({ action }: { action: AuditRow['action'] }) {
  if (action === 'create') return <Plus className="size-3" aria-hidden />;
  if (action === 'delete') return <Trash2 className="size-3" aria-hidden />;
  if (action === 'update') return <Pencil className="size-3" aria-hidden />;
  return <History className="size-3" aria-hidden />;
}

function formatTs(iso: string): string {
  // P13.x.Phase2 : doctrine timezone Europe/Paris via helper centralise.
  return formatParisDateTime(iso, 'fr', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DiffSummary({
  action,
  before,
  after,
}: {
  action: AuditRow['action'];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (action === 'create' || action === 'delete') return null;
  if (!before || !after) return null;

  const changes: { key: string; from: unknown; to: unknown }[] = [];
  for (const key of Object.keys(after)) {
    if (SKIP_KEYS.has(key)) continue;
    const oldV = before[key];
    const newV = after[key];
    if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
      changes.push({ key, from: oldV, to: newV });
    }
  }

  if (changes.length === 0) {
    return <p className="text-md-text-muted text-sm">Pas de changement detectable.</p>;
  }

  return (
    <ul className="text-md-text mt-1 space-y-0.5 text-xs">
      {changes.slice(0, 6).map((c) => (
        <li key={c.key}>
          <code className="text-md-text-muted">{c.key}</code>{' '}
          <span className="text-md-danger line-through">{stringify(c.from)}</span>{' '}
          <span aria-hidden>→</span> <span className="text-md-success">{stringify(c.to)}</span>
        </li>
      ))}
      {changes.length > 6 && (
        <li className="text-md-text-muted">…et {changes.length - 6} autre(s)</li>
      )}
    </ul>
  );
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v).slice(0, 80);
}

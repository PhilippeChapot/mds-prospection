'use client';

/**
 * P5.x.1 — Client admin users.
 *
 * Pattern : DataTable + 3 dialogs (Invite / EditRole / Archive) tous gated
 * super_admin only. Admin standard voit la liste mais les boutons d'action
 * sont disabled avec tooltip explicatif.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Archive, ArchiveRestore, MailPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatDateTimeShortFr } from '@/lib/format/dates';
import {
  inviteUserAction,
  updateUserRoleAction,
  archiveUserAction,
  unarchiveUserAction,
  resendInviteAction,
} from '@/lib/admin/users/actions';
import {
  USER_ROLES,
  type ListUsersResult,
  type UserRole,
  type UserRow,
} from '@/lib/admin/users/queries';

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-sky-100 text-sky-800',
  sales: 'bg-emerald-100 text-emerald-800',
  super_admin: 'bg-violet-100 text-violet-800',
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  sales: 'Sales',
  super_admin: 'Super_admin',
};

export interface UsersClientProps {
  initialResult: ListUsersResult;
  currentRole: 'admin' | 'sales' | 'super_admin';
  currentUserId: string;
  currentFilters: {
    role?: UserRole;
    search?: string;
    includeArchived: boolean;
    page: number;
  };
  perPage: number;
}

export function UsersClient({
  initialResult,
  currentRole,
  currentUserId,
  currentFilters,
  perPage,
}: UsersClientProps) {
  const router = useRouter();
  const isSuperAdmin = currentRole === 'super_admin';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<UserRow | null>(null);
  const [unarchivePending, startUnarchive] = useTransition();
  const [resendPending, startResend] = useTransition();

  const totalPages = Math.max(1, Math.ceil(initialResult.total / perPage));

  function applyFilters(patch: Partial<typeof currentFilters>) {
    const sp = new URLSearchParams();
    const next = { ...currentFilters, ...patch };
    if (next.role) sp.set('role', next.role);
    if (next.search) sp.set('search', next.search);
    if (next.includeArchived) sp.set('include_archived', '1');
    if (next.page && next.page > 1) sp.set('page', String(next.page));
    const qs = sp.toString();
    router.push(`/admin/users${qs ? `?${qs}` : ''}`);
  }

  function handleUnarchive(row: UserRow) {
    startUnarchive(async () => {
      const r = await unarchiveUserAction({ user_id: row.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${row.email} désarchivé.`);
      router.refresh();
    });
  }

  function handleResend(row: UserRow) {
    startResend(async () => {
      const r = await resendInviteAction({ user_id: row.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Invitation renvoyée à ${row.email}.`);
    });
  }

  return (
    <div className="space-y-4">
      {/* Filtres + bouton invite */}
      <form
        action={(formData) => {
          applyFilters({
            search: ((formData.get('search') as string) ?? '').trim() || undefined,
            role:
              (formData.get('role') as UserRole | '') === ''
                ? undefined
                : (formData.get('role') as UserRole),
            includeArchived: formData.get('include_archived') === '1',
            page: 1,
          });
        }}
        className="bg-card border-md-border flex flex-wrap items-end gap-2 rounded-xl border p-3 shadow-sm"
      >
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label className="text-[10px] font-bold tracking-widest uppercase">Recherche</Label>
          <Input
            name="search"
            defaultValue={currentFilters.search ?? ''}
            placeholder="Email ou nom…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold tracking-widest uppercase">Rôle</Label>
          <select
            name="role"
            defaultValue={currentFilters.role ?? ''}
            className="border-md-border h-9 rounded-md border bg-white px-2 text-xs"
          >
            <option value="">Tous</option>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-xs">
          <input
            type="checkbox"
            name="include_archived"
            value="1"
            defaultChecked={currentFilters.includeArchived}
            className="size-4"
          />
          Inclure archivés
        </label>
        <button
          type="submit"
          className="bg-md-blue h-9 rounded-md px-3 text-xs font-semibold text-white"
        >
          Appliquer
        </button>
        {(currentFilters.role || currentFilters.search || currentFilters.includeArchived) && (
          <Link href="/admin/users" className="text-md-text-muted text-xs underline">
            Réinitialiser
          </Link>
        )}
        <div className="flex-1" />
        <Button
          onClick={() => setInviteOpen(true)}
          disabled={!isSuperAdmin}
          title={isSuperAdmin ? 'Inviter un utilisateur' : 'Réservé super_admin'}
        >
          <Plus className="size-3.5" aria-hidden /> Inviter un utilisateur
        </Button>
      </form>

      {/* Table */}
      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Dernière connexion</th>
                <th className="px-4 py-3">Créé le</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialResult.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-md-text-muted px-4 py-10 text-center text-sm">
                    Aucun utilisateur ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                initialResult.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-md-border hover:bg-muted/20 border-t',
                      row.archived_at && 'opacity-60',
                    )}
                  >
                    <td className="px-4 py-2 font-mono text-xs">
                      {row.email}
                      {row.id === currentUserId && (
                        <span className="bg-md-magenta/10 text-md-magenta ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                          Vous
                        </span>
                      )}
                    </td>
                    <td className="text-md-text px-4 py-2">{row.full_name ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-block rounded px-2 py-0.5 text-[10px] font-semibold',
                          ROLE_BADGE[row.role],
                        )}
                      >
                        {ROLE_LABEL[row.role]}
                      </span>
                    </td>
                    <td className="text-md-text-muted px-4 py-2 text-xs">
                      {row.last_login_at ? (
                        formatDateTimeShortFr(row.last_login_at)
                      ) : (
                        <span className="italic">jamais connecté</span>
                      )}
                    </td>
                    <td className="text-md-text-muted px-4 py-2 text-xs">
                      {formatDateTimeShortFr(row.created_at)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.archived_at ? (
                        <span className="bg-muted text-md-text-muted inline-block rounded px-2 py-0.5 text-[10px] font-semibold">
                          🗄️ Archivé
                        </span>
                      ) : (
                        <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          ✅ Actif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {!row.archived_at && !row.last_login_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResend(row)}
                            disabled={!isSuperAdmin || resendPending}
                            title={
                              isSuperAdmin
                                ? "Renvoyer l'invitation (magic link)"
                                : 'Réservé super_admin'
                            }
                            aria-label={`Renvoyer invite à ${row.email}`}
                          >
                            <MailPlus className="size-3.5" aria-hidden />
                          </Button>
                        )}
                        {!row.archived_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(row)}
                            disabled={!isSuperAdmin}
                            title={isSuperAdmin ? 'Modifier le rôle' : 'Réservé super_admin'}
                            aria-label={`Modifier rôle ${row.email}`}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                        )}
                        {row.archived_at ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnarchive(row)}
                            disabled={!isSuperAdmin || unarchivePending}
                            title={isSuperAdmin ? 'Désarchiver' : 'Réservé super_admin'}
                            aria-label={`Désarchiver ${row.email}`}
                          >
                            <ArchiveRestore className="size-3.5" aria-hidden />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setArchiveTarget(row)}
                            disabled={!isSuperAdmin}
                            title={isSuperAdmin ? 'Archiver' : 'Réservé super_admin'}
                            className="text-md-danger hover:text-md-danger disabled:text-md-text-muted"
                            aria-label={`Archiver ${row.email}`}
                          >
                            <Archive className="size-3.5" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination minimale */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-xs" aria-label="Pagination">
          <span className="text-md-text-muted">
            Page {currentFilters.page} / {totalPages}
          </span>
          <div className="flex gap-1">
            {currentFilters.page > 1 && (
              <button
                type="button"
                onClick={() => applyFilters({ page: currentFilters.page - 1 })}
                className="border-md-border bg-card hover:bg-muted rounded-md border px-2 py-1 text-[11px] font-semibold"
              >
                ‹
              </button>
            )}
            {currentFilters.page < totalPages && (
              <button
                type="button"
                onClick={() => applyFilters({ page: currentFilters.page + 1 })}
                className="border-md-border bg-card hover:bg-muted rounded-md border px-2 py-1 text-[11px] font-semibold"
              >
                ›
              </button>
            )}
          </div>
        </nav>
      )}

      <InviteUserDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false);
          router.refresh();
        }}
      />

      <EditRoleDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          router.refresh();
        }}
        activeSuperAdminCount={initialResult.active_super_admin_count}
      />

      <ArchiveUserDialog
        target={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={() => {
          setArchiveTarget(null);
          router.refresh();
        }}
        activeSuperAdminCount={initialResult.active_super_admin_count}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function InviteUserDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('admin');
  const [language, setLanguage] = useState<'fr' | 'en'>('fr');
  const [pending, startTx] = useTransition();

  function reset() {
    setEmail('');
    setFullName('');
    setRole('admin');
    setLanguage('fr');
  }

  function handleSubmit() {
    startTx(async () => {
      const r = await inviteUserAction({
        email: email.trim(),
        full_name: fullName.trim(),
        role,
        language,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Invitation envoyée à ${email}.`);
      reset();
      onInvited();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un utilisateur</DialogTitle>
          <DialogDescription>
            Un magic link Supabase sera envoyé à l&apos;email. Le user devra cliquer pour activer
            son compte.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: jean@mediadays.solutions"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Nom complet</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jean Dupont"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Rôle</Label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-language">Langue de l&apos;email</Label>
              <select
                id="invite-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')}
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                <option value="fr">🇫🇷 Français</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !email.trim() || fullName.trim().length < 2}
          >
            {pending ? 'Envoi…' : "Envoyer l'invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRoleDialog({
  target,
  onClose,
  onSaved,
  activeSuperAdminCount,
}: {
  target: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
  activeSuperAdminCount: number;
}) {
  const [newRole, setNewRole] = useState<UserRole>(target?.role ?? 'admin');
  const [reason, setReason] = useState('');
  const [pending, startTx] = useTransition();

  // Reset interne quand on ouvre sur une cible différente : on remonte le
  // dialog via key (cf. UsersClient en passant target.id en key implicite).

  if (!target) return null;

  const isLastSuperAdminDowngrade =
    target.role === 'super_admin' && newRole !== 'super_admin' && activeSuperAdminCount <= 1;

  function handleSubmit() {
    if (!target) return;
    startTx(async () => {
      const r = await updateUserRoleAction({
        user_id: target.id,
        new_role: newRole,
        reason: reason.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Rôle mis à jour : ${ROLE_LABEL[newRole]}`);
      setReason('');
      onSaved();
    });
  }

  return (
    <Dialog
      key={target.id}
      open={!!target}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le rôle de {target.email}</DialogTitle>
          <DialogDescription>
            Rôle actuel :{' '}
            <span
              className={cn(
                'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold',
                ROLE_BADGE[target.role],
              )}
            >
              {ROLE_LABEL[target.role]}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-role">Nouveau rôle</Label>
            <select
              id="new-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {isLastSuperAdminDowngrade && (
            <div className="border-md-danger/40 bg-md-danger/10 text-md-danger rounded-md border px-3 py-2 text-xs">
              ⚠️ Impossible : c&apos;est le dernier super_admin actif du système.
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="role-reason">Raison (≥ 3 caractères)</Label>
            <Textarea
              id="role-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pourquoi ce changement de rôle ?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              pending ||
              reason.trim().length < 3 ||
              newRole === target.role ||
              isLastSuperAdminDowngrade
            }
          >
            {pending ? 'Sauvegarde…' : 'Sauvegarder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveUserDialog({
  target,
  onClose,
  onArchived,
  activeSuperAdminCount,
}: {
  target: UserRow | null;
  onClose: () => void;
  onArchived: () => void;
  activeSuperAdminCount: number;
}) {
  const [reason, setReason] = useState('');
  const [pending, startTx] = useTransition();

  if (!target) return null;
  const isLastSuperAdmin = target.role === 'super_admin' && activeSuperAdminCount <= 1;

  function handleSubmit() {
    if (!target) return;
    startTx(async () => {
      const r = await archiveUserAction({ user_id: target.id, reason: reason.trim() });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${target.email} archivé.`);
      setReason('');
      onArchived();
    });
  }

  return (
    <Dialog
      key={target.id}
      open={!!target}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archiver {target.email} ?</DialogTitle>
          <DialogDescription>
            Soft delete : l&apos;utilisateur ne pourra plus se connecter mais son historique est
            préservé. Vous pourrez le désarchiver à tout moment.
          </DialogDescription>
        </DialogHeader>
        {isLastSuperAdmin ? (
          <div className="border-md-danger/40 bg-md-danger/10 text-md-danger rounded-md border px-3 py-2 text-xs">
            ⚠️ Impossible : c&apos;est le dernier super_admin actif du système.
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="archive-reason">Raison (≥ 3 caractères)</Label>
            <Textarea
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Pourquoi cet archivage ?"
              rows={3}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={pending || reason.trim().length < 3 || isLastSuperAdmin}
          >
            {pending ? 'Archivage…' : 'Archiver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

/**
 * P2.x.1 — Client admin pour CRUD app_settings.
 *
 * - 6 onglets : Tous + 5 catégories enum
 * - DataTable filtrée par catégorie
 * - Drawer adaptatif selon registry (mode "known") OU JSON brut (mode "custom")
 * - Suppression réservée super_admin (UI gated)
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatDateTimeShortFr } from '@/lib/format/dates';
import {
  APP_SETTING_CATEGORIES,
  SETTINGS_REGISTRY,
  getSettingDef,
  type AppSettingCategory,
  type SettingFieldDef,
} from '@/lib/admin/preferences/registry';
import { upsertSettingAction, deleteSettingAction } from '@/lib/admin/preferences/actions';
import type { SettingRow } from '@/lib/admin/preferences/queries';
import { SettingDrawer } from './SettingDrawer';

const CATEGORY_LABELS: Record<AppSettingCategory | 'all', string> = {
  all: '📚 Tous',
  finance: '💰 Finance',
  email: '📧 Email',
  integrations: '🔌 Intégrations',
  rgpd: '⚖️ RGPD',
  general: '⚙️ Général',
};

const TYPE_BADGE: Record<string, string> = {
  percent: 'bg-amber-100 text-amber-800',
  number: 'bg-amber-100 text-amber-800',
  string: 'bg-slate-100 text-slate-800',
  secret: 'bg-rose-100 text-rose-800',
  email: 'bg-sky-100 text-sky-800',
  email_list: 'bg-sky-100 text-sky-800',
  url: 'bg-indigo-100 text-indigo-800',
  boolean: 'bg-emerald-100 text-emerald-800',
  uuid: 'bg-violet-100 text-violet-800',
  select: 'bg-fuchsia-100 text-fuchsia-800',
  json: 'bg-zinc-100 text-zinc-800',
};

export interface PreferencesClientProps {
  initialSettings: SettingRow[];
  currentRole: 'admin' | 'sales' | 'super_admin';
  currentUserId: string;
}

export function PreferencesClient({ initialSettings, currentRole }: PreferencesClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<AppSettingCategory | 'all'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SettingRow | null>(null);
  const [customCreate, setCustomCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SettingRow | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, startDelete] = useTransition();

  const isSuperAdmin = currentRole === 'super_admin';

  const filtered = useMemo(() => {
    if (tab === 'all') return initialSettings;
    return initialSettings.filter((s) => s.category === tab);
  }, [initialSettings, tab]);

  // Suggestions de clés registry manquantes (pour bouton "Ajouter une clé connue").
  const missingDefs = useMemo(() => {
    const existing = new Set(initialSettings.map((r) => r.key));
    return SETTINGS_REGISTRY.filter((d) => !existing.has(d.key));
  }, [initialSettings]);

  function openEdit(row: SettingRow) {
    setEditing(row);
    setCustomCreate(false);
    setDrawerOpen(true);
  }

  function openCreateFromDef(def: SettingFieldDef) {
    // Crée une row "vide" basée sur le registry (la sauvegarde déclenche
    // l'INSERT côté DB).
    setEditing({
      key: def.key,
      value: defaultValueForType(def),
      description: def.description,
      category: def.category,
      updated_at: new Date().toISOString(),
      updated_by_user_id: null,
      label: def.label,
      type: def.type,
      is_known: true,
    });
    setCustomCreate(false);
    setDrawerOpen(true);
  }

  function openCustomCreate() {
    setEditing(null);
    setCustomCreate(true);
    setDrawerOpen(true);
  }

  function handleSaved() {
    setDrawerOpen(false);
    router.refresh();
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      const r = await deleteSettingAction({
        key: deleteTarget.key,
        reason: deleteReason.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Setting supprimée.');
      setDeleteTarget(null);
      setDeleteReason('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-md-text-muted text-xs">
          {missingDefs.length > 0 ? (
            <>
              {missingDefs.length} clé{missingDefs.length > 1 ? 's' : ''} du registry pas encore en
              base. Cliquez sur un onglet puis sur «&nbsp;+ Ajouter&nbsp;» pour la créer.
            </>
          ) : (
            <>Toutes les clés du registry sont en base.</>
          )}
        </p>
        <Button onClick={openCustomCreate} variant="outline" size="sm">
          <Plus className="size-3.5" aria-hidden /> Nouveau paramètre custom
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          {(['all', ...APP_SETTING_CATEGORIES] as const).map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </TabsTrigger>
          ))}
        </TabsList>

        {(['all', ...APP_SETTING_CATEGORIES] as const).map((cat) => {
          const catDefs =
            cat === 'all' ? SETTINGS_REGISTRY : SETTINGS_REGISTRY.filter((d) => d.category === cat);
          const catMissingDefs = catDefs.filter(
            (d) => !initialSettings.some((s) => s.key === d.key),
          );

          return (
            <TabsContent key={cat} value={cat} className="mt-4 space-y-3">
              {catMissingDefs.length > 0 && (
                <div className="border-md-warning/30 bg-md-warning/5 space-y-2 rounded-md border p-3 text-xs">
                  <p className="text-md-text-muted">
                    Clés registry non-présentes en base :{' '}
                    <span className="text-md-text-muted">(ajoutées avec valeur par défaut)</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {catMissingDefs.map((def) => (
                      <Button
                        key={def.key}
                        variant="outline"
                        size="sm"
                        onClick={() => openCreateFromDef(def)}
                      >
                        <Plus className="size-3" aria-hidden /> {def.key}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <SettingsTable
                rows={cat === 'all' ? initialSettings : filtered}
                isSuperAdmin={isSuperAdmin}
                onEdit={openEdit}
                onDelete={(row) => {
                  setDeleteTarget(row);
                  setDeleteReason('');
                }}
              />
            </TabsContent>
          );
        })}
      </Tabs>

      <SettingDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        initial={editing}
        customCreate={customCreate}
        onSave={async (input) => {
          const r = await upsertSettingAction(input);
          if (!r.ok) {
            toast.error(r.error);
            return false;
          }
          toast.success(r.created ? 'Setting créée.' : 'Setting mise à jour.');
          handleSaved();
          return true;
        }}
      />

      {/* Delete confirmation (super_admin only) */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer définitivement cette setting ?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  <code className="font-mono text-xs">{deleteTarget.key}</code> — catégorie{' '}
                  {deleteTarget.category}. Action super_admin uniquement, tracée dans l&apos;audit
                  log.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-reason">Raison (obligatoire, ≥ 3 caractères)</Label>
            <Textarea
              id="delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Pourquoi cette suppression ?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || deleteReason.trim().length < 3}
            >
              {deleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsTable({
  rows,
  isSuperAdmin,
  onEdit,
  onDelete,
}: {
  rows: SettingRow[];
  isSuperAdmin: boolean;
  onEdit: (row: SettingRow) => void;
  onDelete: (row: SettingRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-md-border text-md-text-muted bg-card rounded-xl border p-10 text-center text-sm">
        Aucune setting dans cette catégorie.
      </div>
    );
  }
  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">Clé / Label</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Valeur</th>
              <th className="px-4 py-3">Modifié</th>
              <th className="px-4 py-3 text-center">Statut</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const valuePreview = previewValue(row.value);
              return (
                <tr key={row.key} className="border-md-border hover:bg-muted/20 border-t">
                  <td className="px-4 py-2">
                    <div className="text-md-text font-semibold">
                      {row.is_known ? row.label : <code className="font-mono">{row.key}</code>}
                    </div>
                    {row.is_known && (
                      <code className="text-md-text-muted font-mono text-[10px]">{row.key}</code>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${
                        TYPE_BADGE[row.type] ?? TYPE_BADGE.json
                      }`}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-2 text-xs">
                    <code className="font-mono text-[11px] break-all" title={valuePreview}>
                      {valuePreview.slice(0, 80)}
                      {valuePreview.length > 80 ? '…' : ''}
                    </code>
                  </td>
                  <td className="text-md-text-muted px-4 py-2 text-xs">
                    {formatDateTimeShortFr(row.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {row.is_known ? (
                      <span
                        className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                        title="Clé connue dans le registry"
                      >
                        🛡️ Validé
                      </span>
                    ) : (
                      <span
                        className="bg-md-bg-soft text-md-text-muted inline-block rounded px-2 py-0.5 text-[10px] font-semibold"
                        title="Clé custom, JSON libre"
                      >
                        🆓 Custom
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(row)}
                        aria-label={`Éditer ${row.key}`}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(row)}
                        disabled={!isSuperAdmin}
                        title={isSuperAdmin ? 'Supprimer' : 'Réservé super_admin'}
                        className="text-md-danger hover:text-md-danger disabled:text-md-text-muted"
                        aria-label={`Supprimer ${row.key}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
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

function previewValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function defaultValueForType(def: SettingFieldDef): unknown {
  switch (def.type) {
    case 'percent':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'email_list':
      return [];
    case 'string':
    case 'secret':
    case 'email':
    case 'url':
    case 'uuid':
    case 'select':
      return '';
    case 'json':
    default:
      return {};
  }
}

// Exporté pour les tests : ne pas inliner.
export { previewValue, defaultValueForType, getSettingDef };

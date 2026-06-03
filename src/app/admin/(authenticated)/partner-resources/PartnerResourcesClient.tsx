'use client';

/**
 * P3.1 — Client admin pour CRUD exhibitor_resources.
 *
 * - Table tri par display_order, recherche slug+title
 * - Drawer Sheet large (right) : Meta (slug/order/published) + Tabs Édition|Aperçu
 * - Modal confirmation pour delete
 *
 * Le rendu markdown utilise <MarkdownView /> (rehype désactivé, anti-XSS).
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { deleteResourceAction, upsertResourceAction } from '@/lib/partner-resources/actions';
import type { PartnerResourceRow } from '@/lib/partner-resources/types';
import { MarkdownView } from '@/components/partner-resources/MarkdownView';

type FormState = {
  id?: string;
  slug: string;
  title_fr: string;
  title_en: string;
  body_fr: string;
  body_en: string;
  is_published: boolean;
  display_order: number;
};

const EMPTY_FORM: FormState = {
  slug: '',
  title_fr: '',
  title_en: '',
  body_fr: '',
  body_en: '',
  is_published: false,
  display_order: 100,
};

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor(diff / 3_600_000);
    return hours <= 1 ? "il y a moins d'1h" : `il y a ${hours}h`;
  }
  if (days < 30) return `il y a ${days}j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

export function PartnerResourcesClient({ resources }: { resources: PartnerResourceRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<PartnerResourceRow | null>(null);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter(
      (r) =>
        r.slug.includes(q) ||
        r.title_fr.toLowerCase().includes(q) ||
        r.title_en.toLowerCase().includes(q),
    );
  }, [resources, search]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFieldErrors({});
    setDrawerOpen(true);
  }

  function openEdit(row: PartnerResourceRow) {
    setForm({
      id: row.id,
      slug: row.slug,
      title_fr: row.title_fr,
      title_en: row.title_en,
      body_fr: row.body_fr ?? '',
      body_en: row.body_en ?? '',
      is_published: row.is_published,
      display_order: row.display_order,
    });
    setFormError(null);
    setFieldErrors({});
    setDrawerOpen(true);
  }

  function handleSave() {
    setFormError(null);
    setFieldErrors({});
    startSave(async () => {
      const result = await upsertResourceAction({
        id: form.id,
        slug: form.slug.trim(),
        title_fr: form.title_fr.trim(),
        title_en: form.title_en.trim(),
        body_fr: form.body_fr.trim(),
        body_en: form.body_en.trim(),
        is_published: form.is_published,
        display_order: form.display_order,
      });
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? 'Ressource mise à jour.' : 'Ressource créée.');
      setDrawerOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      const result = await deleteResourceAction({ id: deleteTarget.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Ressource supprimée.');
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher slug ou titre…"
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Nouvelle ressource
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
              <tr>
                <th className="w-16 px-4 py-3 text-right">Ordre</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Titre FR</th>
                <th className="px-4 py-3">Titre EN</th>
                <th className="px-4 py-3 text-center">Publié</th>
                <th className="px-4 py-3">Mis à jour</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-md-text-muted px-4 py-10 text-center text-sm">
                    {resources.length === 0
                      ? 'Aucune ressource. Cliquez « Nouvelle ressource » pour démarrer.'
                      : 'Aucune ressource ne correspond à la recherche.'}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-md-border hover:bg-muted/20 border-t">
                    <td className="px-4 py-3 text-right font-mono text-xs">{row.display_order}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.slug}</td>
                    <td className="max-w-[260px] truncate px-4 py-3">{row.title_fr}</td>
                    <td className="max-w-[260px] truncate px-4 py-3">{row.title_en}</td>
                    <td className="px-4 py-3 text-center">
                      {row.is_published ? (
                        <span className="bg-md-success/10 text-md-success rounded px-2 py-0.5 text-[11px] font-semibold">
                          ✅ Publiée
                        </span>
                      ) : (
                        <span className="bg-muted text-md-text-muted rounded px-2 py-0.5 text-[11px] font-semibold">
                          ⏸ Brouillon
                        </span>
                      )}
                    </td>
                    <td className="text-md-text-muted px-4 py-3 text-xs">
                      {formatRelative(row.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(row)}
                          aria-label={`Éditer ${row.slug}`}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-md-danger hover:text-md-danger"
                          onClick={() => setDeleteTarget(row)}
                          aria-label={`Supprimer ${row.slug}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer édition */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="bg-background flex h-full w-full flex-col gap-0 border-l p-0 shadow-2xl sm:w-[min(1100px,95vw)] sm:max-w-[1100px]"
        >
          <header className="border-md-border flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <SheetTitle className="text-md-blue-dark text-lg font-bold">
                {form.id ? 'Éditer la ressource' : 'Nouvelle ressource'}
              </SheetTitle>
              <SheetDescription>
                Contenu Markdown bilingue FR/EN. Aperçu live à droite.
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="sm" aria-label="Fermer">
                ✕
              </Button>
            </SheetClose>
          </header>

          <div className="flex flex-1 gap-0 overflow-hidden">
            {/* Meta panel */}
            <aside className="border-md-border bg-md-bg-soft/40 w-64 shrink-0 space-y-4 border-r p-5">
              <div className="space-y-1.5">
                <Label htmlFor="res-slug">
                  Slug (URL) <span className="text-md-magenta">*</span>
                </Label>
                <Input
                  id="res-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  onBlur={() => {
                    if (!form.slug && form.title_fr) {
                      setForm((prev) => ({ ...prev, slug: slugify(prev.title_fr) }));
                    }
                  }}
                  placeholder="ex: guide-partenaire"
                  className="font-mono text-xs"
                />
                {fieldErrors.slug ? (
                  <p className="text-md-danger text-xs">{fieldErrors.slug}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="res-order">Ordre d&apos;affichage</Label>
                <Input
                  id="res-order"
                  type="number"
                  min={0}
                  max={9999}
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) || 0 })}
                />
                <p className="text-md-text-muted text-[11px]">
                  Tri ascendant côté partenaire (10, 20, 30…).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    className="size-4"
                  />
                  <span>Publiée (visible partenaires)</span>
                </Label>
              </div>

              {formError ? (
                <div className="border-md-danger/40 bg-md-danger/10 text-md-danger rounded border px-2 py-2 text-xs">
                  {formError}
                </div>
              ) : null}
            </aside>

            {/* Body : Tabs Édition | Aperçu */}
            <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
              <Tabs defaultValue="edit" className="w-full">
                <TabsList>
                  <TabsTrigger value="edit">Édition</TabsTrigger>
                  <TabsTrigger value="preview">Aperçu</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="mt-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="res-title-fr">
                        Titre (FR) <span className="text-md-magenta">*</span>
                      </Label>
                      <Input
                        id="res-title-fr"
                        value={form.title_fr}
                        onChange={(e) => setForm({ ...form, title_fr: e.target.value })}
                        placeholder="Guide partenaire"
                      />
                      <Label htmlFor="res-body-fr" className="mt-3 block">
                        Contenu (FR) — markdown
                      </Label>
                      <Textarea
                        id="res-body-fr"
                        value={form.body_fr}
                        onChange={(e) => setForm({ ...form, body_fr: e.target.value })}
                        placeholder="# Titre&#10;&#10;Bonjour…"
                        className="min-h-[400px] font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="res-title-en">
                        Title (EN) <span className="text-md-magenta">*</span>
                      </Label>
                      <Input
                        id="res-title-en"
                        value={form.title_en}
                        onChange={(e) => setForm({ ...form, title_en: e.target.value })}
                        placeholder="Partner guide"
                      />
                      <Label htmlFor="res-body-en" className="mt-3 block">
                        Content (EN) — markdown
                      </Label>
                      <Textarea
                        id="res-body-en"
                        value={form.body_en}
                        onChange={(e) => setForm({ ...form, body_en: e.target.value })}
                        placeholder="# Title&#10;&#10;Hello…"
                        className="min-h-[400px] font-mono text-xs"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="mt-4">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div>
                      <p className="text-md-text-muted mb-2 text-[11px] font-bold tracking-wider uppercase">
                        Aperçu FR
                      </p>
                      <div className="border-md-border rounded-md border bg-white p-4">
                        <h2 className="text-md-blue-dark mb-2 text-base font-bold">
                          {form.title_fr || '(titre FR vide)'}
                        </h2>
                        <MarkdownView body={form.body_fr || '_(contenu FR vide)_'} />
                      </div>
                    </div>
                    <div>
                      <p className="text-md-text-muted mb-2 text-[11px] font-bold tracking-wider uppercase">
                        Aperçu EN
                      </p>
                      <div className="border-md-border rounded-md border bg-white p-4">
                        <h2 className="text-md-blue-dark mb-2 text-base font-bold">
                          {form.title_en || '(title EN empty)'}
                        </h2>
                        <MarkdownView body={form.body_en || '_(content EN empty)_'} />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <footer className="border-md-border flex items-center justify-end gap-2 border-t bg-white px-6 py-3">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </Button>
          </footer>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer définitivement cette ressource ?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? (
                <>
                  <span className="font-mono text-xs">{deleteTarget.slug}</span> —{' '}
                  {deleteTarget.title_fr}
                </>
              ) : null}
              <br />
              Cette action est irréversible (le contenu est facilement re-créable, mais l&apos;URL
              du slug sera perdue).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

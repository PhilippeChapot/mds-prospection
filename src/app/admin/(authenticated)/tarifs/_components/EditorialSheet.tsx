'use client';

/**
 * P6.x.1a — sheet d'édition complète d'une ligne tariff_editorial.
 *
 * Champs riches (titre éditorial, tagline, description markdown, image,
 * tags, target audience, value proposition). Les colonnes de base
 * (catégorie, ordre, featured, visible_public) sont éditées inline dans
 * la table, mais aussi exposées ici pour les éditer dans la sheet.
 *
 * Preview markdown via `marked` (déjà dans deps).
 */

import { useState, useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { upsertEditorialAction, deleteEditorialAction } from '@/lib/tarifs/admin-actions';
import { TARIF_CATEGORIES, CATEGORY_LABELS, type TarifCategory } from '@/lib/tarifs/types';
import type { ProductWithEditorial } from '@/lib/tarifs/types';
import { formatEurHt } from '@/lib/tarifs/format';

export function EditorialSheet({
  row,
  trigger,
}: {
  row: ProductWithEditorial;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const e = row.editorial;

  // Form state — initialisé depuis la ligne éditoriale (ou défauts si absente)
  const [category, setCategory] = useState<TarifCategory>(e?.category ?? 'autre');
  const [subCategory, setSubCategory] = useState(e?.sub_category ?? '');
  const [displayOrder, setDisplayOrder] = useState(e?.display_order ?? 9999);
  const [featured, setFeatured] = useState(e?.featured ?? false);
  const [visiblePublic, setVisiblePublic] = useState(e?.is_visible_public ?? true);
  const [editorialTitle, setEditorialTitle] = useState(e?.editorial_title ?? '');
  const [tagline, setTagline] = useState(e?.tagline ?? '');
  const [descriptionMd, setDescriptionMd] = useState(e?.description_md ?? '');
  const [imageUrl, setImageUrl] = useState(e?.image_url ?? '');
  const [tagsInput, setTagsInput] = useState((e?.tags ?? []).join(', '));
  const [targetAudience, setTargetAudience] = useState(e?.target_audience ?? '');
  const [valueProp, setValueProp] = useState(e?.value_proposition ?? '');

  function handleSave() {
    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    start(async () => {
      const result = await upsertEditorialAction({
        sellsy_product_id: row.sellsy.sellsy_item_id,
        category,
        sub_category: subCategory.trim() || null,
        display_order: displayOrder,
        featured,
        editorial_title: editorialTitle.trim() || null,
        tagline: tagline.trim() || null,
        description_md: descriptionMd.trim() || null,
        image_url: imageUrl.trim() || null,
        tags: parsedTags,
        target_audience: targetAudience.trim() || null,
        value_proposition: valueProp.trim() || null,
        is_visible_public: visiblePublic,
      });
      if (result.ok) {
        toast.success('Tarif édité');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleReset() {
    if (!confirm('Réinitialiser ce tarif (supprimer toutes les métadonnées éditoriales) ?')) return;
    start(async () => {
      const result = await deleteEditorialAction({
        sellsy_product_id: row.sellsy.sellsy_item_id,
      });
      if (result.ok) {
        toast.success('Tarif réinitialisé (catégorie autre implicite)');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  // marked.parse retourne `string | Promise<string>` selon options ; on force async:false.
  const descriptionHtml = descriptionMd
    ? (marked.parse(descriptionMd, { async: false }) as string)
    : '';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="!max-w-2xl overflow-y-auto sm:!max-w-2xl">
        <div className="space-y-5 p-6">
          <div>
            <SheetTitle className="text-md-blue-deep">
              {row.sellsy.name ?? row.sellsy.reference}
            </SheetTitle>
            <SheetDescription>
              Sellsy #{row.sellsy.sellsy_item_id} · {row.sellsy.reference}
              {row.sellsy.price_excl_tax != null ? (
                <> · {formatEurHt(row.sellsy.price_excl_tax)}</>
              ) : null}
            </SheetDescription>
          </div>

          {/* Catégorisation */}
          <Section title="Catégorisation">
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Catégorie">
                <select
                  value={category}
                  onChange={(ev) => setCategory(ev.target.value as TarifCategory)}
                  className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                >
                  {TARIF_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </FormRow>
              <FormRow label="Sous-catégorie">
                <Input
                  value={subCategory}
                  onChange={(ev) => setSubCategory(ev.target.value)}
                  placeholder="standard, or, wifi…"
                />
              </FormRow>
              <FormRow label="Ordre d'affichage">
                <Input
                  type="number"
                  value={displayOrder}
                  onChange={(ev) => setDisplayOrder(Number.parseInt(ev.target.value, 10) || 9999)}
                />
              </FormRow>
              <div className="flex flex-col gap-2 pt-5">
                <label className="text-md-text inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(ev) => setFeatured(ev.target.checked)}
                  />
                  Mis en avant
                </label>
                <label className="text-md-text inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={visiblePublic}
                    onChange={(ev) => setVisiblePublic(ev.target.checked)}
                  />
                  Visible public
                </label>
              </div>
            </div>
          </Section>

          {/* Contenu éditorial */}
          <Section title="Contenu éditorial">
            <FormRow label="Titre éditorial">
              <Input
                value={editorialTitle}
                onChange={(ev) => setEditorialTitle(ev.target.value)}
                placeholder="Ex: Pack Standard MDS"
              />
            </FormRow>
            <FormRow label="Tagline (1 ligne)">
              <Input
                value={tagline}
                onChange={(ev) => setTagline(ev.target.value)}
                placeholder="L'essentiel pour exposer"
              />
            </FormRow>
            <FormRow label="Description (markdown)">
              <Textarea
                value={descriptionMd}
                onChange={(ev) => setDescriptionMd(ev.target.value)}
                rows={6}
                placeholder="**Le pack le plus complet** pour exposer sur MDS 2026…"
              />
            </FormRow>
            {descriptionHtml ? (
              <div className="border-md-border bg-muted/30 rounded-md border p-3 text-sm">
                <p className="text-md-text-muted mb-1 text-[10px] font-semibold tracking-wider uppercase">
                  Preview
                </p>
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                />
              </div>
            ) : null}
            <FormRow label="Image URL">
              <Input
                type="url"
                value={imageUrl}
                onChange={(ev) => setImageUrl(ev.target.value)}
                placeholder="https://…"
              />
            </FormRow>
            <FormRow label="Tags (séparés par virgules)">
              <Input
                value={tagsInput}
                onChange={(ev) => setTagsInput(ev.target.value)}
                placeholder="best-seller, premium, limited"
              />
            </FormRow>
            <FormRow label="Public cible">
              <Input
                value={targetAudience}
                onChange={(ev) => setTargetAudience(ev.target.value)}
                placeholder="Régies & adtech"
              />
            </FormRow>
            <FormRow label="Value proposition">
              <Textarea
                value={valueProp}
                onChange={(ev) => setValueProp(ev.target.value)}
                rows={2}
                placeholder="Pourquoi ce pack/option ?"
              />
            </FormRow>
          </Section>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            {e ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={pending}
                className="text-md-danger hover:bg-md-danger/10"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Réinitialiser
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <SheetClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Annuler
                </Button>
              </SheetClose>
              <Button type="button" onClick={handleSave} disabled={pending}>
                {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-md-blue-dark text-xs font-bold tracking-wider uppercase">{title}</h3>
      {children}
    </section>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-md-text-muted text-xs">{label}</Label>
      {children}
    </div>
  );
}

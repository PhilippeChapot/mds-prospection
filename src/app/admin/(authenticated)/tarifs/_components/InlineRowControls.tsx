'use client';

/**
 * P6.x.1a — contrôles inline (rapides) sur une ligne tariff_editorial.
 *
 * Édition rapide : catégorie, sous-catégorie, ordre, featured, visible_public.
 * Pour les champs riches (titre/tagline/description), passer par EditorialSheet.
 *
 * On debounce les saves côté serveur via une simple soumission au blur /
 * onChange pour les checkboxes. UX minimaliste, pas de spinner par cellule.
 */

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { upsertEditorialAction } from '@/lib/tarifs/admin-actions';
import {
  TARIF_CATEGORIES,
  CATEGORY_LABELS,
  type ProductWithEditorial,
  type TarifCategory,
} from '@/lib/tarifs/types';

export function InlineRowControls({ row }: { row: ProductWithEditorial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const e = row.editorial;

  // Local state pour permettre l'édition immédiate ; on persiste sur blur/change
  const [category, setCategory] = useState<TarifCategory>(e?.category ?? 'autre');
  const [subCategory, setSubCategory] = useState(e?.sub_category ?? '');
  const [order, setOrder] = useState(e?.display_order ?? 9999);
  const [featured, setFeatured] = useState(e?.featured ?? false);
  const [visiblePublic, setVisiblePublic] = useState(e?.is_visible_public ?? true);

  function save(
    overrides?: Partial<{
      category: TarifCategory;
      sub_category: string;
      display_order: number;
      featured: boolean;
      is_visible_public: boolean;
    }>,
  ) {
    start(async () => {
      const result = await upsertEditorialAction({
        sellsy_product_id: row.sellsy.sellsy_item_id,
        category: overrides?.category ?? category,
        sub_category: (overrides?.sub_category ?? subCategory).trim() || null,
        display_order: overrides?.display_order ?? order,
        featured: overrides?.featured ?? featured,
        is_visible_public: overrides?.is_visible_public ?? visiblePublic,
        // Préserve les champs riches existants (sinon upsert les écraserait null).
        editorial_title: e?.editorial_title ?? null,
        tagline: e?.tagline ?? null,
        description_md: e?.description_md ?? null,
        image_url: e?.image_url ?? null,
        tags: e?.tags ?? [],
        target_audience: e?.target_audience ?? null,
        value_proposition: e?.value_proposition ?? null,
      });
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <td className="px-3 py-2">
        <select
          value={category}
          onChange={(ev) => {
            const next = ev.target.value as TarifCategory;
            setCategory(next);
            save({ category: next });
          }}
          disabled={pending}
          className="border-md-border h-7 w-full rounded-md border bg-white px-1.5 text-xs"
        >
          {TARIF_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={subCategory}
          onChange={(ev) => setSubCategory(ev.target.value)}
          onBlur={() => save({ sub_category: subCategory })}
          disabled={pending}
          placeholder="—"
          className="border-md-border h-7 w-24 rounded-md border bg-white px-1.5 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={order}
          onChange={(ev) => setOrder(Number.parseInt(ev.target.value, 10) || 9999)}
          onBlur={() => save({ display_order: order })}
          disabled={pending}
          className="border-md-border h-7 w-16 rounded-md border bg-white px-1.5 text-xs"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={featured}
          onChange={(ev) => {
            setFeatured(ev.target.checked);
            save({ featured: ev.target.checked });
          }}
          disabled={pending}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={visiblePublic}
          onChange={(ev) => {
            setVisiblePublic(ev.target.checked);
            save({ is_visible_public: ev.target.checked });
          }}
          disabled={pending}
        />
      </td>
    </>
  );
}

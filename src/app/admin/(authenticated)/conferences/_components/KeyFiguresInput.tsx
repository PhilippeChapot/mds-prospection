'use client';

/**
 * P16.x.ConferencesKeyFigures — saisie multi-entrées des chiffres clés (FR).
 * Une ligne = un chiffre clé. Max 5, 200 chars chacun (côté serveur Zod).
 */

import { Textarea } from '@/components/ui/textarea';

export function KeyFiguresInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <Textarea
        rows={4}
        value={value.join('\n')}
        placeholder={
          'Un chiffre clé par ligne, ex :\n4,18 Mds$ en 2026 (+24,2 %)\n88 % des foyers équipés'
        }
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .slice(0, 5),
          )
        }
      />
      <p className="text-md-text-muted text-[11px]">
        {value.length}/5 chiffres clés · une ligne = une stat (max 200 caractères).
      </p>
    </div>
  );
}

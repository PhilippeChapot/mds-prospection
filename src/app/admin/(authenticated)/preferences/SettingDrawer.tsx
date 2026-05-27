'use client';

/**
 * P2.x.1 — drawer édition d'une `app_settings`.
 *
 * 2 modes :
 *   - "known"   : initial.is_known === true -> render typé selon registry
 *   - "custom"  : customCreate=true -> render générique key/category/value JSON
 *
 * La validation finale est faite côté server action (registry schema).
 * Ici on fait juste un check léger UX (parse JSON pour mode custom).
 */

import { useState } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  APP_SETTING_CATEGORIES,
  getSettingDef,
  type AppSettingCategory,
  type SettingFieldDef,
} from '@/lib/admin/preferences/registry';
import type { SettingRow } from '@/lib/admin/preferences/queries';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SettingRow | null;
  customCreate: boolean;
  onSave: (input: {
    key: string;
    value: unknown;
    category: AppSettingCategory;
    description?: string | null;
  }) => Promise<boolean>;
}

export function SettingDrawer({ open, onOpenChange, initial, customCreate, onSave }: Props) {
  // P2.x.1 — re-monte le formulaire interne à chaque ouverture pour ne pas
  // garder le state d'une ligne précédente (pattern key={...} sur enfant).
  const formKey = `${open ? 'open' : 'closed'}-${initial?.key ?? 'new'}-${customCreate}`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-background flex h-full w-full flex-col gap-0 border-l p-0 shadow-2xl sm:w-[min(700px,95vw)] sm:max-w-[700px]"
      >
        <SettingDrawerForm
          key={formKey}
          initial={initial}
          customCreate={customCreate}
          onClose={() => onOpenChange(false)}
          onSave={onSave}
        />
      </SheetContent>
    </Sheet>
  );
}

function SettingDrawerForm({
  initial,
  customCreate,
  onClose,
  onSave,
}: {
  initial: SettingRow | null;
  customCreate: boolean;
  onClose: () => void;
  onSave: Props['onSave'];
}) {
  const [key, setKey] = useState(initial?.key ?? '');
  const [category, setCategory] = useState<AppSettingCategory>(initial?.category ?? 'general');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [value, setValue] = useState<unknown>(initial?.value);
  const [jsonText, setJsonText] = useState<string>(initial ? safeStringify(initial.value) : '{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const def: SettingFieldDef | undefined =
    !customCreate && initial?.is_known ? getSettingDef(initial.key) : undefined;

  const isKnownMode = !!def && !customCreate;

  async function handleSubmit() {
    let finalValue: unknown = value;
    // En mode custom : parse le JSON text avant envoi.
    if (!isKnownMode) {
      try {
        finalValue = JSON.parse(jsonText);
        setJsonError(null);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'JSON invalide');
        return;
      }
    }
    setSaving(true);
    const ok = await onSave({
      key: key.trim(),
      value: finalValue,
      category,
      description: description.trim() || null,
    });
    setSaving(false);
    if (!ok && !isKnownMode) {
      // Mode custom : erreur retournée déjà toast via parent. Drawer reste ouvert.
    }
  }

  return (
    <>
      <header className="border-md-border flex items-start justify-between gap-4 border-b px-6 py-4">
        <div>
          <SheetTitle className="text-md-blue-dark text-lg font-bold">
            {customCreate
              ? 'Nouveau paramètre custom'
              : isKnownMode
                ? def.label
                : (initial?.key ?? 'Éditer')}
          </SheetTitle>
          <SheetDescription>
            {customCreate
              ? 'Clé non répertoriée dans le registry — JSON libre, pas de validation typée.'
              : isKnownMode
                ? def.description
                : (initial?.description ?? 'Édition JSON libre (clé custom).')}
          </SheetDescription>
        </div>
        <SheetClose asChild>
          <Button variant="ghost" size="sm" aria-label="Fermer">
            ✕
          </Button>
        </SheetClose>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {/* Mode custom : éditer key + category libres */}
        {customCreate && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="setting-key">
                Clé <span className="text-md-magenta">*</span>
              </Label>
              <Input
                id="setting-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="ex: ma_feature_flag"
                className="font-mono text-xs"
              />
              <p className="text-md-text-muted text-[11px]">
                Format snake_case (a-z, 0-9, _). Minimum 2 caractères.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-category">Catégorie</Label>
              <select
                id="setting-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AppSettingCategory)}
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                {APP_SETTING_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-description">Description</Label>
              <Textarea
                id="setting-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="À quoi sert ce paramètre ?"
                rows={2}
              />
            </div>
          </>
        )}

        {/* Mode known : key + category figés, juste valeur */}
        {!customCreate && (
          <div className="bg-md-bg-soft text-md-text-muted rounded-md p-3 text-xs">
            <div>
              <strong>Clé :</strong> <code className="font-mono text-[11px]">{initial?.key}</code>
            </div>
            <div>
              <strong>Catégorie :</strong> {initial?.category}
            </div>
          </div>
        )}

        {/* Éditeur de valeur adaptatif */}
        {isKnownMode && def ? (
          <div className="space-y-1.5">
            <Label>
              Valeur <span className="text-md-magenta">*</span>
            </Label>
            <FieldEditor def={def} value={value} onChange={setValue} />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="setting-json">
              Valeur (JSON) <span className="text-md-magenta">*</span>
            </Label>
            <Textarea
              id="setting-json"
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                try {
                  JSON.parse(e.target.value);
                  setJsonError(null);
                } catch (err) {
                  setJsonError(err instanceof Error ? err.message : 'JSON invalide');
                }
              }}
              rows={10}
              className="font-mono text-xs"
            />
            {jsonError && <p className="text-md-danger text-xs">{jsonError}</p>}
          </div>
        )}
      </div>

      <footer className="border-md-border flex items-center justify-end gap-2 border-t bg-white px-6 py-3">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={saving || (!!jsonError && !isKnownMode)}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
      </footer>
    </>
  );
}

function FieldEditor({
  def,
  value,
  onChange,
}: {
  def: SettingFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (def.type) {
    case 'percent':
    case 'number':
      return (
        <Input
          type="number"
          min={def.type === 'percent' ? 0 : undefined}
          max={def.type === 'percent' ? 100 : undefined}
          step={1}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : Number(e.target.value);
            onChange(Number.isFinite(v) ? v : 0);
          }}
          placeholder={def.placeholder}
        />
      );
    case 'string':
    case 'email':
    case 'url':
    case 'uuid':
      return (
        <Input
          type={def.type === 'email' ? 'email' : def.type === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
        />
      );
    case 'secret':
      // P9.1 : secrets (webhook secrets, API keys super-sensibles). Input
      // type=password pour eviter le shoulder-surfing en demo. La valeur
      // reste editable en clair via JSON brut si besoin (admin only).
      return (
        <Input
          type="password"
          autoComplete="new-password"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
        />
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4"
          />
          <span>{value === true ? 'Activé' : 'Désactivé'}</span>
        </label>
      );
    case 'email_list':
      return (
        <EmailListInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          placeholder={def.placeholder}
        />
      );
    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
        >
          {def.selectOptions?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'json':
    default:
      return (
        <Textarea
          value={safeStringify(value)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              // Silencieux : le bouton Save validera côté server action.
            }
          }}
          rows={8}
          className="font-mono text-xs"
        />
      );
  }
}

function EmailListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  function add(email: string) {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
  }
  function remove(email: string) {
    onChange(value.filter((e) => e !== email));
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((email) => (
          <span
            key={email}
            className="bg-md-bg-soft inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
          >
            {email}
            <button
              type="button"
              onClick={() => remove(email)}
              className="text-md-text-muted hover:text-md-danger"
              aria-label={`Retirer ${email}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <Input
        type="email"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(input);
          }
        }}
        onBlur={() => input.trim() && add(input)}
        placeholder={placeholder ?? 'email + Entrée'}
      />
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

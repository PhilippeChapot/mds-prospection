'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateMyContactProfileAction } from '@/lib/espace-partenaire/profile-actions';

/**
 * P8.2 — form d'edition profil contact (self-service).
 */
export function ContactProfileForm({
  locale,
  initial,
  labels,
}: {
  locale: 'fr' | 'en';
  initial: {
    first_name: string;
    last_name: string;
    language: 'FR' | 'EN';
  };
  labels: {
    firstName: string;
    lastName: string;
    phone: string;
    language: string;
    submit: string;
  };
}) {
  const [form, setForm] = useState({
    first_name: initial.first_name,
    last_name: initial.last_name,
    phone: '',
    language: initial.language,
  });
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateMyContactProfileAction({
        locale,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        language: form.language,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(locale === 'en' ? 'Profile updated' : 'Profil mis à jour');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cp-first">{labels.firstName}</Label>
          <Input
            id="cp-first"
            autoComplete="given-name"
            maxLength={120}
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-last">{labels.lastName}</Label>
          <Input
            id="cp-last"
            autoComplete="family-name"
            maxLength={120}
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-phone">{labels.phone}</Label>
        <Input
          id="cp-phone"
          type="tel"
          autoComplete="tel"
          maxLength={40}
          placeholder="+33 6 12 34 56 78"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-language">{labels.language}</Label>
        <select
          id="cp-language"
          value={form.language}
          onChange={(e) =>
            setForm((f) => ({ ...f, language: e.target.value === 'EN' ? 'EN' : 'FR' }))
          }
          className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
        >
          <option value="FR">FR</option>
          <option value="EN">EN</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Save className="size-4" aria-hidden />
        )}
        {labels.submit}
      </Button>
    </form>
  );
}

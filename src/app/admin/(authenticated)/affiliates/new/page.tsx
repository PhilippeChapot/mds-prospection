import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAffiliateAction } from '../actions';

export const metadata = { title: 'Nouvel affilié' };

export default function NewAffiliatePage() {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/affiliates">
            <ArrowLeft className="size-4" aria-hidden />
            Retour à la liste
          </Link>
        </Button>
      </div>

      <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
        Nouvel affilié
      </h1>

      <Card className="border-md-border p-6 shadow-sm">
        <form action={createAffiliateAction} className="space-y-4">
          <Field
            label="Nom complet"
            id="displayName"
            name="displayName"
            placeholder="ex: Podcast News"
            required
          />

          <Field
            label="Email contact"
            id="contactEmail"
            name="contactEmail"
            type="email"
            placeholder="ex: contact@podcast-news.com"
          />

          <div className="space-y-1.5">
            <Label className="font-semibold">Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <TypeRadio value="media" label="Média partenaire" defaultChecked />
              <TypeRadio value="referral" label="Parrainage exposant" />
            </div>
          </div>

          <Field
            label="Code (token affilié)"
            id="token"
            name="token"
            placeholder="auto depuis le nom"
            helper="Optionnel — laisser vide pour auto-générer (ex: PODCAST_NEWS). Alphanum + _ . -"
          />

          <Field
            label="Commission (%)"
            id="commissionPercent"
            name="commissionPercent"
            type="number"
            defaultValue="10"
            min="0"
            max="100"
            step="0.01"
            required
          />

          <div className="space-y-1.5">
            <Label htmlFor="notesInternal" className="font-semibold">
              Notes internes
            </Label>
            <textarea
              id="notesInternal"
              name="notesInternal"
              className="border-md-border focus:border-md-blue focus:ring-md-blue/20 min-h-[80px] w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              placeholder="Modalités, contact technique, conditions particulières…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button asChild variant="ghost">
              <Link href="/admin/affiliates">Annuler</Link>
            </Button>
            <Button type="submit" className="bg-md-magenta hover:bg-md-magenta-soft">
              Créer l&apos;affilié
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  helper,
  required,
  ...rest
}: {
  label: string;
  helper?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={rest.id} className="font-semibold">
        {label}
        {required ? <span className="text-md-magenta"> *</span> : null}
      </Label>
      <Input {...rest} required={required} />
      {helper ? <p className="text-md-text-muted text-xs">{helper}</p> : null}
    </div>
  );
}

function TypeRadio({
  value,
  label,
  defaultChecked,
}: {
  value: 'media' | 'referral';
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="border-md-border has-[input:checked]:border-md-magenta has-[input:checked]:bg-md-magenta/5 flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3 transition-colors">
      <input
        type="radio"
        name="type"
        value={value}
        defaultChecked={defaultChecked}
        className="text-md-magenta"
      />
      <span className="text-md-text text-sm font-medium">{label}</span>
    </label>
  );
}

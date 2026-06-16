'use client';

/**
 * P15.4-bis — outils admin sur la demande d'invitation (super_admin) :
 * Modifier (modale) · Régénérer le PDF · Supprimer.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CountryAutocomplete } from '@/components/admin/CountryAutocomplete';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import {
  adminEditInvitationDataAction,
  adminRegenerateInvitationPdfAction,
  adminDeleteInvitationAction,
  type SubmitInvitationInput,
} from '@/lib/admin/visitors/invitation-actions';

export type InvitationEditInitial = {
  nationality: string | null;
  profession: string | null;
  birth_date: string | null;
  birth_place: string | null;
  passport_number: string | null;
  passport_country: string | null;
  passport_issue_date: string | null;
  passport_expiry: string | null;
  company_name: string | null;
  company_full_address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  locale: string | null;
};

export function VisitorVisaAdminTools({
  visitorId,
  currentRole,
  initial,
}: {
  visitorId: string;
  currentRole: 'admin' | 'sales' | 'super_admin';
  initial: InvitationEditInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const [form, setForm] = useState<SubmitInvitationInput>({
    nationality: initial.nationality ?? '',
    profession: initial.profession ?? '',
    birth_date: initial.birth_date ?? '',
    birth_place: initial.birth_place ?? '',
    passport_number: initial.passport_number ?? '',
    passport_country: initial.passport_country ?? '',
    passport_issue_date: initial.passport_issue_date ?? '',
    passport_expiry: initial.passport_expiry ?? '',
    company_name: initial.company_name ?? '',
    company_full_address: initial.company_full_address ?? '',
    postal_code: initial.postal_code ?? '',
    city: initial.city ?? '',
    country: initial.country ?? '',
    locale: (initial.locale as 'fr' | 'en') ?? 'fr',
  });

  if (!isSuperAdmin(currentRole)) return null;

  function set<K extends keyof SubmitInvitationInput>(k: K, v: SubmitInvitationInput[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      try {
        await adminEditInvitationDataAction({ visitor_id: visitorId, data: form });
        toast.success('Données mises à jour.');
        setEditOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function regenerate() {
    startTransition(async () => {
      try {
        await adminRegenerateInvitationPdfAction({ visitor_id: visitorId });
        toast.success('PDF régénéré.');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function remove() {
    if (!window.confirm('Supprimer définitivement cette demande d’invitation ?')) return;
    startTransition(async () => {
      try {
        await adminDeleteInvitationAction({ visitor_id: visitorId });
        toast.success('Demande supprimée.');
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <div className="border-md-border flex flex-wrap gap-2 border-t pt-3">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditOpen(true)}>
        <Pencil className="size-4" aria-hidden />
        Modifier
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={regenerate}>
        <RefreshCw className="size-4" aria-hidden />
        Régénérer le PDF
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-md-danger border-md-danger/30 hover:bg-md-danger/5"
        disabled={pending}
        onClick={remove}
      >
        <Trash2 className="size-4" aria-hidden />
        Supprimer
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier les données d&apos;invitation</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldText
              label="Nationalité"
              value={form.nationality}
              onChange={(v) => set('nationality', v)}
            />
            <FieldText
              label="Profession"
              value={form.profession}
              onChange={(v) => set('profession', v)}
            />
            <FieldText
              label="Date de naissance"
              type="date"
              value={form.birth_date}
              onChange={(v) => set('birth_date', v)}
            />
            <FieldText
              label="Lieu de naissance"
              value={form.birth_place ?? ''}
              onChange={(v) => set('birth_place', v)}
            />
            <FieldText
              label="Passeport n°"
              value={form.passport_number}
              onChange={(v) => set('passport_number', v)}
            />
            <div className="space-y-1.5">
              <Label className="font-semibold">Pays passeport</Label>
              <CountryAutocomplete
                value={form.passport_country}
                onChange={(v) => set('passport_country', v)}
                locale="fr"
                valueMode="code"
                placeholder="Pays…"
              />
            </div>
            <FieldText
              label="Délivré le"
              type="date"
              value={form.passport_issue_date}
              onChange={(v) => set('passport_issue_date', v)}
            />
            <FieldText
              label="Expire le"
              type="date"
              value={form.passport_expiry}
              onChange={(v) => set('passport_expiry', v)}
            />
            <FieldText
              label="Société"
              value={form.company_name}
              onChange={(v) => set('company_name', v)}
            />
            <FieldText
              label="Adresse société"
              value={form.company_full_address}
              onChange={(v) => set('company_full_address', v)}
            />
            <FieldText
              label="Code postal"
              value={form.postal_code}
              onChange={(v) => set('postal_code', v)}
            />
            <FieldText label="Ville" value={form.city} onChange={(v) => set('city', v)} />
            <div className="space-y-1.5">
              <Label className="font-semibold">Pays société</Label>
              <CountryAutocomplete
                value={form.country}
                onChange={(v) => set('country', v)}
                locale="fr"
                valueMode="name"
                placeholder="Pays…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Langue de la lettre</Label>
              <select
                value={form.locale}
                onChange={(e) => set('locale', e.target.value as 'fr' | 'en')}
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-semibold">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createManualAffiliateClaimAction } from '@/lib/admin/affiliate-claims/manual-create-action';

export interface AffiliatePickerItem {
  id: string;
  displayName: string;
  commissionPercent: number;
}

type Props = {
  open: boolean;
  onClose: () => void;
  affiliates: AffiliatePickerItem[];
} & ({ companyId: string; prospectId?: never } | { prospectId: string; companyId?: never });

export function AddAffiliateClaimModal({ open, onClose, affiliates, ...ids }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setSelectedId('');
    setNotes('');
    setError(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const input = {
        affiliate_id: selectedId,
        ...('companyId' in ids && ids.companyId
          ? { company_id: ids.companyId }
          : { prospect_id: (ids as { prospectId: string }).prospectId }),
        notes_admin: notes.trim() || undefined,
      };
      const r = await createManualAffiliateClaimAction(input);
      if (r.ok) {
        toast.success('Apporteur lié avec succès.');
        handleClose();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lier un apporteur affilié</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="affiliate-select" className="text-sm font-medium">
              Affilié
            </label>
            <select
              id="affiliate-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              required
              className="border-md-border bg-card text-md-text w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-1 focus:outline-none"
            >
              <option value="">— Choisir un affilié —</option>
              {affiliates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} ({a.commissionPercent}%)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="notes-admin" className="text-sm font-medium">
              Note interne <span className="text-md-text-muted font-normal">(optionnel)</span>
            </label>
            <textarea
              id="notes-admin"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Contexte du rattachement…"
              className="border-md-border bg-card text-md-text w-full resize-none rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-1 focus:outline-none"
            />
          </div>

          {error ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={pending}>
              Annuler
            </Button>
            <Button type="submit" disabled={!selectedId || pending}>
              {pending ? 'En cours…' : 'Lier cet apporteur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

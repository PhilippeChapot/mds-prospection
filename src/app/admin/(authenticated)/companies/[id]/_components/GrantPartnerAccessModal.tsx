'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { grantPartnerAccessAction } from '@/lib/admin/partner-access/grant-actions';

export interface ContactOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Props {
  companyId: string;
  availableContacts: ContactOption[];
}

export function GrantPartnerAccessModal({ availableContacts }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [role, setRole] = useState<'owner' | 'collaborator' | 'viewer'>('collaborator');
  const [sendMagicLink, setSendMagicLink] = useState(true);
  const [notes, setNotes] = useState('');
  const [isPending, startTx] = useTransition();

  function handleOpen() {
    setSelectedContactId(availableContacts[0]?.id ?? '');
    setRole('collaborator');
    setSendMagicLink(true);
    setNotes('');
    setOpen(true);
  }

  function handleSubmit() {
    if (!selectedContactId) return;
    startTx(async () => {
      const r = await grantPartnerAccessAction({
        contact_id: selectedContactId,
        role,
        send_magic_link: sendMagicLink,
        notes: notes.trim() || undefined,
      });
      if (r.success) {
        toast.success('Accès accordé' + (sendMagicLink ? ' · Magic link envoyé.' : '.'));
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  if (availableContacts.length === 0) {
    return (
      <Button size="sm" variant="outline" disabled className="gap-1.5 opacity-50">
        <KeyRound className="size-3.5" />
        Donner accès
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleOpen} className="gap-1.5">
        <KeyRound className="size-3.5" aria-hidden />
        Donner accès à un contact
      </Button>

      <Dialog open={open} onOpenChange={(o) => !isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Donner accès à l&apos;espace partenaire</DialogTitle>
            <DialogDescription>
              Le contact recevra un magic link pour se connecter immédiatement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Picker contact */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Contact</label>
              <select
                className="border-md-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                value={selectedContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                disabled={isPending}
              >
                {availableContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email} — {c.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Rôle */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Rôle</label>
              <select
                className="border-md-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                disabled={isPending}
              >
                <option value="owner">👑 Owner</option>
                <option value="collaborator">🤝 Collaborateur</option>
                <option value="viewer">👁 Lecteur</option>
              </select>
            </div>

            {/* Notes internes */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Notes internes (optionnel)</label>
              <input
                type="text"
                className="border-md-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                placeholder="ex : Responsable facturation"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isPending}
                maxLength={500}
              />
            </div>

            {/* Checkbox magic link */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendMagicLink}
                onChange={(e) => setSendMagicLink(e.target.checked)}
                disabled={isPending}
              />
              Envoyer le magic link maintenant
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!selectedContactId || isPending}>
              {isPending ? 'En cours…' : "Accorder l'accès"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

/**
 * P12.x.EmailIntegration — ajout d'un compte email (config IMAP/SMTP).
 * Le mot de passe N'EST PAS saisi ici : seul env_var_key (les secrets vivent
 * dans Vercel : `${env_var_key}_IMAP_PASSWORD` / `_SMTP_PASSWORD`).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEmailAccountAction } from '@/lib/admin/emails/actions';

export function AddAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    email: '',
    display_name: '',
    env_var_key: '',
    imap_host: 'imap.ionos.fr',
    imap_port: '993',
    smtp_host: 'smtp.ionos.fr',
    smtp_port: '465',
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit() {
    start(async () => {
      const r = await createEmailAccountAction({
        email: form.email.trim(),
        display_name: form.display_name.trim() || undefined,
        env_var_key: form.env_var_key.trim(),
        imap_host: form.imap_host.trim(),
        imap_port: Number(form.imap_port) || 993,
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port) || 465,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Compte ajouté. Ajoutez les mots de passe dans Vercel puis testez.');
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Ajouter un compte
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={form.email} onChange={set('email')} placeholder="nom@domaine.fr" />
        </div>
        <div className="space-y-1.5">
          <Label>Nom affiché</Label>
          <Input value={form.display_name} onChange={set('display_name')} />
        </div>
        <div className="space-y-1.5">
          <Label>Clé env (préfixe)</Label>
          <Input value={form.env_var_key} onChange={set('env_var_key')} placeholder="IONOS_PHIL" />
        </div>
        <div className="space-y-1.5">
          <Label>Hôte IMAP</Label>
          <Input value={form.imap_host} onChange={set('imap_host')} />
        </div>
        <div className="space-y-1.5">
          <Label>Port IMAP</Label>
          <Input value={form.imap_port} onChange={set('imap_port')} inputMode="numeric" />
        </div>
        <div className="space-y-1.5">
          <Label>Hôte SMTP</Label>
          <Input value={form.smtp_host} onChange={set('smtp_host')} />
        </div>
        <div className="space-y-1.5">
          <Label>Port SMTP</Label>
          <Input value={form.smtp_port} onChange={set('smtp_port')} inputMode="numeric" />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Les mots de passe se règlent dans Vercel :{' '}
        <code>{form.env_var_key || 'CLE'}_IMAP_PASSWORD</code> et{' '}
        <code>{form.env_var_key || 'CLE'}_SMTP_PASSWORD</code>.
      </p>
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Créer
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

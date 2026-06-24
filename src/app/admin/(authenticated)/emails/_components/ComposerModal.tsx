'use client';

/**
 * P12.x.EmailIntegration — composer email (Dialog). Sélecteur de compte,
 * destinataires (To/CC/BCC séparés par virgule), template (remplissage +
 * remplacement de variables {contact.first_name} {company.name}
 * {prospect.amount}), envoi via sendEmailAction.
 */

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendEmailAction } from '@/lib/admin/emails/send-action';
import { applyTemplateVars } from '@/lib/email/template-vars';
import type { EmailTemplateItem } from '@/lib/admin/emails/queries';

export interface ComposerAccount {
  id: string;
  email: string;
  display_name: string | null;
}
export interface ComposerPrefill {
  to?: string;
  cc?: string;
  subject?: string;
  inReplyTo?: string | null;
  references?: string | null;
  prospectId?: string | null;
  /** Variables pour les templates (ex: {'contact.first_name': 'Jean'}). */
  vars?: Record<string, string>;
}

function splitAddrs(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function ComposerModal({
  open,
  onOpenChange,
  accounts,
  templates,
  prefill,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: ComposerAccount[];
  templates: EmailTemplateItem[];
  prefill?: ComposerPrefill;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [to, setTo] = useState(prefill?.to ?? '');
  const [cc, setCc] = useState(prefill?.cc ?? '');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  function applyTemplate(key: string) {
    const tpl = templates.find((t) => t.key === key);
    if (!tpl) return;
    const vars = prefill?.vars ?? {};
    setSubject(applyTemplateVars(tpl.subject, vars));
    setBody(applyTemplateVars(tpl.body_text ?? tpl.body_html.replace(/<[^>]+>/g, ''), vars));
  }

  async function handleSend() {
    const recipients = splitAddrs(to);
    if (!accountId) return toast.error('Sélectionnez un compte.');
    if (recipients.length === 0) return toast.error('Ajoutez au moins un destinataire.');
    if (!subject.trim()) return toast.error('Sujet requis.');
    if (!body.trim()) return toast.error('Message vide.');
    setSending(true);
    const bodyHtml = body
      .split('\n')
      .map((l) => `<p>${l.replace(/</g, '&lt;') || '&nbsp;'}</p>`)
      .join('');
    const r = await sendEmailAction({
      account_id: accountId,
      to: recipients,
      cc: splitAddrs(cc),
      bcc: splitAddrs(bcc),
      subject: subject.trim(),
      body_html: bodyHtml,
      body_text: body,
      in_reply_to: prefill?.inReplyTo ?? null,
      references: prefill?.references ?? null,
      prospect_id: prefill?.prospectId ?? null,
    });
    setSending(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success('Email envoyé.');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau message</DialogTitle>
          <DialogDescription>Envoi via votre compte email connecté.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Depuis</Label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name ? `${a.display_name} <${a.email}>` : a.email}
                  </option>
                ))}
              </select>
            </div>
            {templates.length > 0 && (
              <div className="space-y-1.5">
                <Label>Template</Label>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && applyTemplate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">— Aucun —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-to">À (séparés par virgule)</Label>
            <Input id="cm-to" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cm-cc">CC</Label>
              <Input id="cm-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-bcc">BCC</Label>
              <Input id="cm-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-subject">Sujet</Label>
            <Input id="cm-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-body">Message</Label>
            <Textarea
              id="cm-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleSend} disabled={sending}>
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              Envoyer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

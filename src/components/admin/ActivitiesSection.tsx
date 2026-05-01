'use client';

import { useState, useTransition } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addProspectActivityAction } from '@/app/admin/(authenticated)/prospects/[id]/actions';
import { toast } from 'sonner';

export type ActivityRow = {
  id: string;
  type: string;
  body: string | null;
  title: string | null;
  created_at: string;
  user_full_name: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  note: 'Note',
  email_sent: 'Email envoye',
  email_received: 'Email recu',
  call: 'Appel',
  meeting: 'RDV',
  devis_sent: 'Devis envoye',
  devis_signed: 'Devis signe',
};

export function ActivitiesSection({
  prospectId,
  activities,
}: {
  prospectId: string;
  activities: ActivityRow[];
}) {
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      try {
        await addProspectActivityAction(prospectId, text);
        setBody('');
        toast.success('Note ajoutee');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="border-md-border bg-muted/30 space-y-2 rounded-md border p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ajouter une note (visible dans la timeline)…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending || !body.trim()} onClick={submit}>
            <MessageSquarePlus className="size-4" aria-hidden />
            {pending ? 'Ajout…' : 'Ajouter'}
          </Button>
        </div>
      </div>

      {activities.length === 0 ? (
        <p className="text-md-text-muted text-sm">Aucune activite enregistree.</p>
      ) : (
        <ul className="space-y-2">
          {activities.map((a) => (
            <li
              key={a.id}
              className="border-md-border bg-card rounded-md border p-3 text-sm shadow-sm"
            >
              <div className="text-md-text-muted mb-1 flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase">
                <span>{TYPE_LABEL[a.type] ?? a.type}</span>
                <span aria-hidden>·</span>
                <span>{relativeTime(a.created_at)}</span>
                {a.user_full_name && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{a.user_full_name}</span>
                  </>
                )}
              </div>
              {a.title ? <p className="text-md-text font-semibold">{a.title}</p> : null}
              {a.body ? <p className="text-md-text whitespace-pre-wrap">{a.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diffSec = Math.round((now - ts) / 1000);
  if (diffSec < 60) return `il y a ${diffSec}s`;
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`;
  if (diffSec < 86400) return `il y a ${Math.round(diffSec / 3600)}h`;
  if (diffSec < 86400 * 30) return `il y a ${Math.round(diffSec / 86400)}j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

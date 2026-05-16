'use client';

/**
 * P6.x.4-a — ligne table admin avec edition inline du status + notes.
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { updateInstitutionnelEcoleRequest } from './actions';

const STATUS_OPTIONS: Array<{
  value: 'new' | 'contacted' | 'devis_sent' | 'won' | 'lost';
  label: string;
  cls: string;
}> = [
  { value: 'new', label: 'Nouvelle', cls: 'bg-blue-100 text-blue-800' },
  { value: 'contacted', label: 'Contactée', cls: 'bg-amber-100 text-amber-800' },
  { value: 'devis_sent', label: 'Devis envoyé', cls: 'bg-purple-100 text-purple-800' },
  { value: 'won', label: 'Won', cls: 'bg-emerald-100 text-emerald-800' },
  { value: 'lost', label: 'Lost', cls: 'bg-red-100 text-red-800' },
];

export interface RequestRowData {
  id: string;
  type: 'institutionnel' | 'ecole';
  org_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  website: string | null;
  message: string | null;
  status: 'new' | 'contacted' | 'devis_sent' | 'won' | 'lost';
  admin_notes: string | null;
  created_at: string;
}

export function RequestRow({ request }: { request: RequestRowData }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(request.admin_notes ?? '');

  function setStatus(value: RequestRowData['status']) {
    start(async () => {
      const r = await updateInstitutionnelEcoleRequest({ id: request.id, status: value });
      if (r.ok) toast.success(`Statut → ${value}`);
      else toast.error(r.error);
    });
  }

  function saveNotes() {
    start(async () => {
      const r = await updateInstitutionnelEcoleRequest({ id: request.id, admin_notes: notes });
      if (r.ok) toast.success('Notes enregistrées');
      else toast.error(r.error);
    });
  }

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === request.status) ?? STATUS_OPTIONS[0];

  return (
    <li className="border-md-border bg-card overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="hover:bg-muted/30 flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
              request.type === 'institutionnel'
                ? 'bg-indigo-100 text-indigo-800'
                : 'bg-teal-100 text-teal-800'
            }`}
          >
            {request.type}
          </span>
          <span className="text-md-text truncate font-semibold">{request.org_name}</span>
          <span className="text-md-text-muted text-xs">
            {request.contact_name} · {request.contact_email}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusOpt.cls}`}>
            {statusOpt.label}
          </span>
          <span className="text-md-text-muted text-xs whitespace-nowrap">
            {new Date(request.created_at).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className="border-md-border space-y-4 border-t px-4 py-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Email" value={request.contact_email} />
            <DetailField label="Téléphone" value={request.contact_phone ?? '—'} />
            <DetailField label="Site web" value={request.website ?? '—'} />
            <DetailField
              label="Créée le"
              value={new Date(request.created_at).toLocaleString('fr-FR')}
            />
          </div>
          {request.message ? (
            <div>
              <p className="text-md-text-muted mb-1 text-[10px] font-bold tracking-wide uppercase">
                Message
              </p>
              <p className="text-md-text text-sm whitespace-pre-wrap">{request.message}</p>
            </div>
          ) : null}

          <div>
            <p className="text-md-text-muted mb-2 text-[10px] font-bold tracking-wide uppercase">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <Button
                  key={s.value}
                  type="button"
                  variant={s.value === request.status ? 'default' : 'outline'}
                  size="sm"
                  disabled={pending || s.value === request.status}
                  onClick={() => setStatus(s.value)}
                  className={
                    s.value === request.status ? 'bg-md-magenta hover:bg-md-magenta/90' : ''
                  }
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-md-text-muted mb-1 text-[10px] font-bold tracking-wide uppercase">
              Notes admin
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Suivi commercial, contexte, prochaine action…"
            />
            <div className="mt-2 flex justify-end">
              <Button type="button" onClick={saveNotes} disabled={pending} size="sm">
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  'Enregistrer'
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-md-text-muted text-[10px] font-bold tracking-wide uppercase">{label}</p>
      <p className="text-md-text text-sm">{value}</p>
    </div>
  );
}

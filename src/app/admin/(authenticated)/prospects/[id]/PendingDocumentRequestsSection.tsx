'use client';

/**
 * P5.x.SellsyDocumentsFlow — bloc admin "Demandes en attente" sur la fiche
 * prospect. Chaque demande partenaire (pro-forma / facture) peut être
 * émise (→ crée le doc Sellsy + passe la demande en 'approved') ou refusée.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitSellsyTypedDocumentAction } from '@/lib/admin/prospects/quote-builder-actions';
import { rejectDocumentRequestAction } from '@/lib/admin/document-requests/actions';
import type { DocumentRequestRow } from '@/lib/admin/document-requests/queries';
import { formatDateTimeShortFr } from '@/lib/format/dates';

interface Props {
  prospectId: string;
  isTest: boolean;
  requests: DocumentRequestRow[];
}

export function PendingDocumentRequestsSection({ prospectId, isTest, requests }: Props) {
  if (requests.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <h2 className="text-sm font-bold text-amber-800">
        📩 {requests.length} demande{requests.length > 1 ? 's' : ''} de document en attente
      </h2>
      <div className="space-y-2">
        {requests.map((req) => (
          <RequestRow key={req.id} prospectId={prospectId} isTest={isTest} req={req} />
        ))}
      </div>
    </div>
  );
}

function RequestRow({
  prospectId,
  isTest,
  req,
}: {
  prospectId: string;
  isTest: boolean;
  req: DocumentRequestRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const typeLabel = req.document_type === 'proforma' ? 'Pro-forma' : 'Facture';
  const requesterName =
    [req.contact?.first_name, req.contact?.last_name].filter(Boolean).join(' ').trim() ||
    req.contact?.email ||
    '—';

  function handleEmit() {
    startTransition(async () => {
      try {
        const result = await emitSellsyTypedDocumentAction({
          prospect_id: prospectId,
          document_type: req.document_type,
          purchase_order_number: req.purchase_order_number,
          billing_contact_id: req.requested_billing_contact_id,
          billing_email_override: req.requested_billing_email,
          request_id: req.id,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`${typeLabel} émise. Refresh…`);
        setTimeout(() => router.refresh(), 1500);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  function handleReject() {
    if (!confirm('Refuser cette demande ?')) return;
    startTransition(async () => {
      try {
        const result = await rejectDocumentRequestAction({
          request_id: req.id,
          prospect_id: prospectId,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success('Demande refusée.');
        setTimeout(() => router.refresh(), 800);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 py-2 last:border-0">
      <div className="min-w-0">
        <span className="text-md-text text-sm font-semibold">{typeLabel}</span>
        {req.requires_purchase_order && (
          <span className="ml-2 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            🧾 BC : {req.purchase_order_number ?? '(à fournir)'}
          </span>
        )}
        {req.requested_billing_email && (
          <span className="text-md-text-muted ml-2 text-[11px]">
            → {req.requested_billing_email}
          </span>
        )}
        <p className="text-md-text-muted text-[11px]">
          Demandé par {requesterName} le {formatDateTimeShortFr(req.requested_at)}
        </p>
        {req.requested_note && (
          <p className="text-md-text mt-0.5 text-xs italic">« {req.requested_note} »</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleEmit} disabled={pending || isTest}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}✅ Émettre
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleReject} disabled={pending}>
          ❌ Refuser
        </Button>
      </div>
    </div>
  );
}

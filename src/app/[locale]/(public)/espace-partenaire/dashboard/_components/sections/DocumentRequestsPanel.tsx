'use client';

/**
 * P5.x.SellsyDocumentsFlow — panneau partenaire : demander une pro-forma /
 * facture + liste "Mes demandes".
 *
 * Le PO et le contact de facturation ne concernent que la facture. La
 * pro-forma est toujours envoyée au demandeur (pas de choix de destinataire
 * côté partenaire — l'admin peut surcharger à l'émission).
 */

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { submitDocumentRequestAction } from '@/lib/espace-partenaire/document-requests-actions';
import type { MyDocumentRequest } from '@/lib/espace-partenaire/document-requests-queries';

type DocType = 'proforma' | 'invoice';

interface Props {
  locale: 'fr' | 'en';
  myRequests: MyDocumentRequest[];
  proformaEmitted: boolean;
  invoiceEmitted: boolean;
}

export function DocumentRequestsPanel({
  locale,
  myRequests,
  proformaEmitted,
  invoiceEmitted,
}: Props) {
  const t = useTranslations('espacePartenaire.dashboard.documentRequests');
  const [openType, setOpenType] = useState<DocType | null>(null);

  const hasPending = (type: DocType) =>
    myRequests.some((r) => r.document_type === type && r.status === 'pending');

  const proformaDisabled = proformaEmitted || hasPending('proforma');
  const invoiceDisabled = invoiceEmitted || hasPending('invoice');

  return (
    <Card className="border-md-border space-y-4 p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-md-text text-base font-semibold">{t('section')}</h2>
        <p className="text-md-text-muted mt-1 text-sm">{t('intro')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={proformaDisabled}
          onClick={() => setOpenType('proforma')}
          title={proformaEmitted ? t('alreadyEmitted') : undefined}
        >
          {t('requestProforma')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={invoiceDisabled}
          onClick={() => setOpenType('invoice')}
          title={invoiceEmitted ? t('alreadyEmitted') : undefined}
        >
          {t('requestInvoice')}
        </Button>
      </div>

      <MyRequestsList locale={locale} myRequests={myRequests} t={t} />

      {openType && (
        <RequestDialog locale={locale} docType={openType} onClose={() => setOpenType(null)} t={t} />
      )}
    </Card>
  );
}

function MyRequestsList({
  locale,
  myRequests,
  t,
}: {
  locale: 'fr' | 'en';
  myRequests: MyDocumentRequest[];
  t: ReturnType<typeof useTranslations>;
}) {
  if (myRequests.length === 0) {
    return <p className="text-md-text-muted text-xs italic">{t('noRequests')}</p>;
  }
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));

  return (
    <div className="border-md-border space-y-2 border-t pt-3">
      <h3 className="text-md-text-muted text-[11px] font-bold tracking-widest uppercase">
        {t('mySection')}
      </h3>
      {myRequests.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <span className="text-md-text font-medium">
              {r.document_type === 'proforma' ? t('typeProforma') : t('typeInvoice')}
            </span>
            {r.purchase_order_number && (
              <span className="text-md-text-muted ml-2 text-xs">
                · BC {r.purchase_order_number}
              </span>
            )}
            <span className="text-md-text-muted ml-2 text-xs">
              · {t('requestedOn', { date: fmtDate(r.requested_at) })}
            </span>
          </div>
          <StatusBadge status={r.status} t={t} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: MyDocumentRequest['status'];
  t: ReturnType<typeof useTranslations>;
}) {
  if (status === 'pending')
    return (
      <Badge className="border-amber-300 bg-amber-100 text-amber-800">{t('statusPending')}</Badge>
    );
  if (status === 'approved')
    return (
      <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">
        {t('statusApproved')}
      </Badge>
    );
  if (status === 'rejected')
    return <Badge className="border-red-300 bg-red-100 text-red-800">{t('statusRejected')}</Badge>;
  return <Badge variant="outline">{t('statusCancelled')}</Badge>;
}

function RequestDialog({
  locale,
  docType,
  onClose,
  t,
}: {
  locale: 'fr' | 'en';
  docType: DocType;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const isInvoice = docType === 'invoice';
  const [requiresPo, setRequiresPo] = useState(false);
  const [poNumber, setPoNumber] = useState('');
  const [billingExternal, setBillingExternal] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (isInvoice && requiresPo && !poNumber.trim()) {
      toast.error(t('poLabel'));
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitDocumentRequestAction({
          locale,
          document_type: docType,
          requires_purchase_order: isInvoice ? requiresPo : false,
          purchase_order_number: isInvoice && requiresPo ? poNumber.trim() : null,
          requested_billing_email:
            isInvoice && billingExternal && billingEmail.trim() ? billingEmail.trim() : null,
          requested_note: note.trim() || null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(t('success'));
        onClose();
      } catch {
        toast.error(t('errorGeneric'));
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isInvoice ? t('dialogTitleInvoice') : t('dialogTitleProforma')}
          </DialogTitle>
          <DialogDescription>{t('intro')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isInvoice && (
            <>
              <div className="space-y-2">
                <p className="text-md-text text-sm font-medium">{t('poQuestion')}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={requiresPo ? 'default' : 'outline'}
                    onClick={() => setRequiresPo(true)}
                  >
                    {t('poYes')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!requiresPo ? 'default' : 'outline'}
                    onClick={() => setRequiresPo(false)}
                  >
                    {t('poNo')}
                  </Button>
                </div>
              </div>
              {requiresPo && (
                <div className="space-y-1.5">
                  <Label htmlFor="po-number">{t('poLabel')}</Label>
                  <Input
                    id="po-number"
                    value={poNumber}
                    maxLength={100}
                    placeholder={t('poPlaceholder')}
                    onChange={(e) => setPoNumber(e.target.value)}
                  />
                  <p className="text-md-text-muted text-xs">{t('poHint')}</p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-md-text text-sm font-medium">{t('billingQuestion')}</p>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!billingExternal ? 'default' : 'outline'}
                    onClick={() => setBillingExternal(false)}
                  >
                    {t('billingSelf')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={billingExternal ? 'default' : 'outline'}
                    onClick={() => setBillingExternal(true)}
                  >
                    {t('billingExternal')}
                  </Button>
                </div>
              </div>
              {billingExternal && (
                <div className="space-y-1.5">
                  <Label htmlFor="billing-email">{t('billingEmailLabel')}</Label>
                  <Input
                    id="billing-email"
                    type="email"
                    value={billingEmail}
                    placeholder={t('billingEmailPlaceholder')}
                    onChange={(e) => setBillingEmail(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="request-note">{t('noteLabel')}</Label>
            <Textarea
              id="request-note"
              value={note}
              maxLength={1000}
              placeholder={t('notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

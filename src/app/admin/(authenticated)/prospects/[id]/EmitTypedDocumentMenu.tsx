'use client';

/**
 * P5.x.SellsyDocumentsFlow — bouton admin "Émettre pro-forma / facture".
 *
 * Parallèle au bouton "Émettre devis Sellsy" interne à SyncBadgesSection
 * (lui géré par le routing auto quote_items/payment_path). Ici l'admin
 * choisit explicitement le type + (facture) le numéro de bon de commande
 * et l'adresse de facturation.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { emitSellsyTypedDocumentAction } from '@/lib/admin/prospects/quote-builder-actions';

type DocType = 'proforma' | 'invoice';

interface Props {
  prospectId: string;
  isTest: boolean;
  proformaEmitted: boolean;
  invoiceEmitted: boolean;
  /** Avertissement si le prospect n'a pas encore payé d'acompte (facture). */
  acompteUnpaid: boolean;
}

export function EmitTypedDocumentMenu({
  prospectId,
  isTest,
  proformaEmitted,
  invoiceEmitted,
  acompteUnpaid,
}: Props) {
  const [openType, setOpenType] = useState<DocType | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={isTest}>
            <FileText className="size-3.5" aria-hidden />
            Pro-forma / Facture
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={proformaEmitted} onSelect={() => setOpenType('proforma')}>
            📋 Pro-forma {proformaEmitted && '(déjà émise)'}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={invoiceEmitted} onSelect={() => setOpenType('invoice')}>
            🧾 Facture {invoiceEmitted && '(déjà émise)'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {openType && (
        <EmitDialog
          prospectId={prospectId}
          docType={openType}
          acompteUnpaid={acompteUnpaid}
          onClose={() => setOpenType(null)}
        />
      )}
    </>
  );
}

function EmitDialog({
  prospectId,
  docType,
  acompteUnpaid,
  onClose,
}: {
  prospectId: string;
  docType: DocType;
  acompteUnpaid: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isInvoice = docType === 'invoice';
  const [poNumber, setPoNumber] = useState('');
  const [billingExternal, setBillingExternal] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const [pending, startTransition] = useTransition();

  function handleEmit() {
    startTransition(async () => {
      try {
        const result = await emitSellsyTypedDocumentAction({
          prospect_id: prospectId,
          document_type: docType,
          purchase_order_number: isInvoice && poNumber.trim() ? poNumber.trim() : null,
          billing_email_override:
            billingExternal && billingEmail.trim() ? billingEmail.trim() : null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          `${isInvoice ? 'Facture' : 'Pro-forma'} émise${result.sellsy_document_number ? ` (${result.sellsy_document_number})` : ''}. Refresh…`,
        );
        onClose();
        setTimeout(() => router.refresh(), 1500);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isInvoice ? 'Émettre une facture' : 'Émettre une pro-forma'}</DialogTitle>
          <DialogDescription>
            Le document est créé dans Sellsy à partir du Devis Builder. L&apos;envoi du PDF reste
            manuel depuis Sellsy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isInvoice && acompteUnpaid && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ Ce prospect n&apos;a pas encore payé d&apos;acompte. Émettre une facture maintenant
              ? (non bloquant)
            </div>
          )}

          {isInvoice && (
            <div className="space-y-1.5">
              <Label htmlFor="admin-po">Numéro de bon de commande (facultatif)</Label>
              <Input
                id="admin-po"
                value={poNumber}
                maxLength={100}
                placeholder="Ex : BC-2026-0042"
                onChange={(e) => setPoNumber(e.target.value)}
              />
              <p className="text-md-text-muted text-xs">
                Reporté dans la note de la facture (visible par la compta du client).
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-md-text text-sm font-medium">Contact de facturation</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={!billingExternal ? 'default' : 'outline'}
                onClick={() => setBillingExternal(false)}
              >
                Contact principal
              </Button>
              <Button
                type="button"
                size="sm"
                variant={billingExternal ? 'default' : 'outline'}
                onClick={() => setBillingExternal(true)}
              >
                Email externe
              </Button>
            </div>
            {billingExternal && (
              <Input
                type="email"
                value={billingEmail}
                placeholder="compta@exemple.com"
                onChange={(e) => setBillingEmail(e.target.value)}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button type="button" onClick={handleEmit} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {isInvoice ? 'Émettre la facture' : 'Émettre la pro-forma'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { Link as LinkIcon, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatParisDate } from '@/lib/format/dates';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createConciergePaymentLinkAction } from './actions';

interface Props {
  prospectId: string;
  isTest: boolean;
  defaultAmountHt: number | null;
  defaultDescription: string;
}

/**
 * Dialog admin pour generer un Stripe Payment Link custom.
 * Mode concierge : Phil renseigne montant HT + description + duree de
 * validite, on retourne l'URL Stripe + bouton Copier.
 */
export function ConciergePaymentLinkDialog({
  prospectId,
  isTest,
  defaultAmountHt,
  defaultDescription,
}: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(defaultAmountHt?.toString() ?? '');
  const [description, setDescription] = useState(defaultDescription);
  const [expiresInDays, setExpiresInDays] = useState<'1' | '7' | '30'>('7');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Montant invalide');
      return;
    }
    startTransition(async () => {
      try {
        const r = await createConciergePaymentLinkAction({
          prospectId,
          amountEurHt: amountNum,
          description: description.trim(),
          expiresInDays: Number(expiresInDays) as 1 | 7 | 30,
        });
        setResult(r);
        toast.success('Payment Link Stripe créé.');
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    toast.success('URL copiée dans le presse-papier.');
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setOpen(false);
    // Reset interne au prochain reopen pour eviter de re-afficher l'ancien result.
    setTimeout(() => setResult(null), 200);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isTest}
          title={
            isTest ? 'Mode TEST : Payment Link désactivé' : 'Générer un Stripe Payment Link custom'
          }
        >
          <LinkIcon className="size-3.5" aria-hidden />
          Payment Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Générer un Payment Link Stripe</DialogTitle>
          <DialogDescription>
            Concierge : crée un lien de paiement custom à envoyer au prospect (tarif négocié, lien
            externe…). Ajouté aux notes du prospect.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cpld-amount">Montant HT (€)</Label>
              <Input
                id="cpld-amount"
                type="number"
                min={1}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpld-description">Description</Label>
              <Input
                id="cpld-description"
                type="text"
                maxLength={250}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpld-expires">Validité du lien</Label>
              <Select
                value={expiresInDays}
                onValueChange={(v) => setExpiresInDays(v as '1' | '7' | '30')}
                disabled={pending}
              >
                <SelectTrigger id="cpld-expires">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">24 heures</SelectItem>
                  <SelectItem value="7">7 jours</SelectItem>
                  <SelectItem value="30">30 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={pending}>
                Annuler
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                Créer le lien
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="border-md-success/30 bg-md-success/5 rounded-md border p-3 text-sm">
              <p className="text-md-success font-semibold">Lien créé ✓</p>
              <p className="text-md-text-muted mt-1 text-xs">
                Expire le {formatParisDate(result.expiresAt)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpld-url">URL Stripe</Label>
              <div className="flex gap-2">
                <Input
                  id="cpld-url"
                  readOnly
                  value={result.url}
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  title="Copier"
                >
                  {copied ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Fermer
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

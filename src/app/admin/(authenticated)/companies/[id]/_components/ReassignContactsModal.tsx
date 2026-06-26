'use client';

/**
 * P5.x.ReassignContactsToCompany — modal de réaffectation de contacts.
 *
 * Flow : la société courante = source. On cherche la société destination
 * (autocomplete debounce 300ms), on affiche un warning si ≥1 contact a un
 * domaine email incohérent avec la cible, puis on déplace (le bouton passe
 * orange « Déplacer quand même » en cas de mismatch = forçage explicite).
 *
 * Doctrine [[feedback_check_use_client_before_event_handlers]] : 'use client'.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Search, AlertTriangle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  searchTargetCompaniesAction,
  reassignContactsToCompanyAction,
  type TargetCompanyLite,
} from '@/lib/admin/companies/contact-reassign-actions';
import {
  contactsWithDomainMismatch,
  type ReassignContactLite,
} from '@/lib/admin/companies/contact-reassign-helpers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCompanyId: string;
  selectedContacts: ReassignContactLite[];
  /** Appelé après un déplacement réussi (reset sélection + refresh). */
  onDone: () => void;
}

export function ReassignContactsModal({
  open,
  onOpenChange,
  currentCompanyId,
  selectedContacts,
  onDone,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TargetCompanyLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<TargetCompanyLite | null>(null);
  const [pending, startTx] = useTransition();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  function resetAll() {
    setQuery('');
    setResults([]);
    setTarget(null);
  }

  // Autocomplete debounce 300ms (aligné MergeButton / SellsyClientSearchPicker).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (target) return;
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchTargetCompaniesAction({
        q: query.trim(),
        exclude_company_id: currentCompanyId,
      });
      setResults(r);
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, target, currentCompanyId]);

  // Warning domaine : contacts dont l'email ne matche pas le domaine cible.
  const mismatches = useMemo(
    () => (target ? contactsWithDomainMismatch(selectedContacts, target.primary_domain) : []),
    [target, selectedContacts],
  );
  const hasMismatch = mismatches.length > 0;

  function handleReassign() {
    if (!target) return;
    startTx(async () => {
      const r = await reassignContactsToCompanyAction({
        contact_ids: selectedContacts.map((c) => c.id),
        target_company_id: target.id,
        force_domain_mismatch: hasMismatch,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.moved_contacts} contact(s) déplacé(s) vers ${r.target_name}` +
          (r.moved_prospects > 0 ? ` — ${r.moved_prospects} prospect(s) lié(s) déplacé(s)` : ''),
      );
      onOpenChange(false);
      resetAll();
      onDone();
      router.refresh();
    });
  }

  const count = selectedContacts.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetAll();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Déplacer {count} contact{count > 1 ? 's' : ''} vers une autre société
          </DialogTitle>
          <DialogDescription>
            Les prospects liés (via leur contact principal) suivront le contact vers la nouvelle
            société.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Récap contacts sélectionnés */}
          <div className="border-md-border bg-muted/30 max-h-28 overflow-y-auto rounded-md border p-3 text-xs">
            <p className="text-md-text-muted mb-1 font-semibold tracking-wider uppercase">
              Contacts sélectionnés
            </p>
            <ul className="text-md-text space-y-0.5">
              {selectedContacts.map((c) => (
                <li key={c.id}>
                  • {c.name}{' '}
                  {c.email ? <span className="text-md-text-muted">({c.email})</span> : null}
                </li>
              ))}
            </ul>
          </div>

          {/* Sélection cible ou autocomplete */}
          {!target ? (
            <div className="space-y-2">
              <Label htmlFor="reassign-target-search">Société de destination</Label>
              <div className="relative">
                <Search
                  className="text-md-text-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  id="reassign-target-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher une société…"
                  className="pl-8"
                  autoComplete="off"
                />
              </div>
              {searching ? (
                <p className="text-md-text-muted flex items-center gap-1.5 px-1 text-xs">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Recherche…
                </p>
              ) : query.trim().length >= 2 && results.length === 0 ? (
                <p className="text-md-text-muted px-1 text-xs">Aucune société trouvée.</p>
              ) : results.length > 0 ? (
                <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setTarget(r)}
                        className="hover:bg-muted/50 w-full px-3 py-2 text-left text-sm"
                      >
                        <span className="text-md-text font-medium">{r.name}</span>
                        <span className="text-md-text-muted mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                          {r.primary_domain ? <span>{r.primary_domain}</span> : null}
                          {r.country ? <span>· {r.country}</span> : null}
                          <span>· {r.contact_count} contact(s)</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border-md-border bg-muted/30 flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span className="text-md-text inline-flex items-center gap-2 font-medium">
                  <Building2 className="text-md-text-muted size-4" aria-hidden />
                  {target.name}
                  {target.primary_domain ? (
                    <span className="text-md-text-muted text-xs">({target.primary_domain})</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => setTarget(null)}
                  className="text-md-text-muted text-xs underline"
                >
                  Changer
                </button>
              </div>

              {hasMismatch ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="mb-1 inline-flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    Domaine email incohérent
                  </p>
                  <p className="mb-1">
                    {mismatches.length} contact(s) ont un domaine email qui ne correspond pas à
                    {target.primary_domain ? ` « ${target.primary_domain} »` : ' cette société'} :
                  </p>
                  <ul className="space-y-0.5">
                    {mismatches.map((c) => (
                      <li key={c.id}>
                        • {c.name} ({c.email})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              resetAll();
            }}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleReassign}
            disabled={!target || pending}
            className={hasMismatch ? 'bg-amber-500 text-white hover:bg-amber-600' : undefined}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {hasMismatch ? 'Déplacer quand même' : 'Déplacer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

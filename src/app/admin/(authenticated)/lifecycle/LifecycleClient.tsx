'use client';

/**
 * P8.5 — composant client pour /admin/lifecycle.
 *
 * Liste les 8 regles avec :
 *   - Toggle ON/OFF (visible si canToggle = super_admin)
 *   - Derniere execution + compteur 7j
 *   - Boutons : Dry-run / Editer / Historique / Re-cibler
 *
 * Dry-run = dialog avec liste des candidats actuels (sans toucher la queue).
 * Edit = drawer avec BilingualBodyEditor (reuse P8.3-quater).
 */

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Loader2, Pencil, Power, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatParisDateTime } from '@/lib/format/dates';
import {
  toggleLifecycleRuleAction,
  editLifecycleTemplateAction,
  translateLifecycleRuleAction,
  dryRunLifecycleRuleAction,
  reTargetLifecycleRuleAction,
} from '@/lib/admin/lifecycle/actions';

export interface LifecycleRuleView {
  rule_key: string;
  label_fr: string;
  label_en: string;
  description_fr: string | null;
  description_en: string | null;
  pref_category: string;
  is_active: boolean;
  cron_schedule: string;
  subject_fr: string;
  subject_en: string;
  body_fr_html: string;
  body_en_html: string;
  en_translated_by_ai_at: string | null;
  fr_translated_by_ai_at: string | null;
  updated_at: string;
  last_execution: {
    executed_at: string;
    candidates_count: number;
    queued_count: number;
  } | null;
  stats_7d: { sent: number; error: number; pending: number };
}

interface DryRunCandidate {
  contact_id: string;
  email: string;
  full_name: string;
  company_name: string | null;
  language: 'FR' | 'EN';
}

interface Props {
  rules: LifecycleRuleView[];
  canToggle: boolean;
}

export function LifecycleClient({ rules, canToggle }: Props) {
  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <RuleCard key={rule.rule_key} rule={rule} canToggle={canToggle} />
      ))}
    </div>
  );
}

function RuleCard({ rule, canToggle }: { rule: LifecycleRuleView; canToggle: boolean }) {
  const [pending, startTransition] = useTransition();
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reTargetOpen, setReTargetOpen] = useState(false);

  function handleToggle() {
    startTransition(async () => {
      const r = await toggleLifecycleRuleAction({
        rule_key: rule.rule_key,
        is_active: !rule.is_active,
      });
      if (!r.ok) toast.error(r.error);
      else toast.success(rule.is_active ? 'Règle désactivée' : 'Règle activée');
    });
  }

  return (
    <article className="border-md-border bg-card space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-md-text text-base font-bold">
            {rule.label_fr}{' '}
            <code className="text-md-text-muted ml-1 text-[10px] font-normal">{rule.rule_key}</code>
          </h2>
          {rule.description_fr ? (
            <p className="text-md-text-muted mt-0.5 text-xs">{rule.description_fr}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-bold tracking-wider uppercase',
                rule.is_active ? 'bg-md-success/15 text-md-success' : 'bg-muted text-md-text-muted',
              )}
            >
              {rule.is_active ? '✓ ON' : 'OFF'}
            </span>
            <span className="text-md-text-muted">
              <strong>Pref</strong> : <code>{rule.pref_category}</code>
            </span>
            <span className="text-md-text-muted">
              <strong>Cron</strong> : <code>{rule.cron_schedule}</code>
            </span>
          </div>
        </div>
        {canToggle ? (
          <Button
            size="sm"
            variant={rule.is_active ? 'destructive' : 'default'}
            onClick={handleToggle}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Power className="size-3.5" aria-hidden />
            )}
            {rule.is_active ? 'Désactiver' : 'Activer'}
          </Button>
        ) : null}
      </div>

      <div className="border-md-border grid grid-cols-2 gap-3 rounded-md border bg-white p-2 text-[11px] md:grid-cols-4">
        <Stat label="Dernière exéc.">
          {rule.last_execution ? formatParisDateTime(rule.last_execution.executed_at) : '—'}
        </Stat>
        <Stat label="Candidats (7j)">{rule.last_execution?.candidates_count ?? 0}</Stat>
        <Stat label="Envoyés (7j)">{rule.stats_7d.sent}</Stat>
        <Stat label="Échecs (7j)" highlight={rule.stats_7d.error > 0}>
          {rule.stats_7d.error}
        </Stat>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setDryRunOpen(true)}>
          <Eye className="size-3.5" aria-hidden /> Dry-run
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5" aria-hidden /> Éditer template
        </Button>
        {canToggle ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReTargetOpen(true)}
            className="text-md-warning border-md-warning/40"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Re-cibler
          </Button>
        ) : null}
      </div>

      <DryRunDialog
        open={dryRunOpen}
        onOpenChange={setDryRunOpen}
        ruleKey={rule.rule_key}
        ruleLabel={rule.label_fr}
      />
      <EditDialog open={editOpen} onOpenChange={setEditOpen} rule={rule} />
      <ReTargetDialog
        open={reTargetOpen}
        onOpenChange={setReTargetOpen}
        ruleKey={rule.rule_key}
        ruleLabel={rule.label_fr}
      />
    </article>
  );
}

function Stat({
  label,
  children,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-md-text-muted text-[9px] font-bold tracking-widest uppercase">
        {label}
      </div>
      <div
        className={cn(
          'text-md-text mt-0.5 truncate text-sm font-semibold',
          highlight && 'text-md-warning',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function DryRunDialog({
  open,
  onOpenChange,
  ruleKey,
  ruleLabel,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  ruleKey: string;
  ruleLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [candidates, setCandidates] = useState<DryRunCandidate[] | null>(null);

  function handleRun() {
    startTransition(async () => {
      const r = await dryRunLifecycleRuleAction({ rule_key: ruleKey });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setCandidates(r.data?.candidates ?? []);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dry-run — {ruleLabel}</DialogTitle>
          <DialogDescription>
            Liste les contacts qui seraient ciblés MAINTENANT (sans toucher à la queue).
          </DialogDescription>
        </DialogHeader>
        {candidates === null ? (
          <div className="flex justify-center py-6">
            <Button onClick={handleRun} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
              Calculer les éligibles
            </Button>
          </div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            <p className="text-md-text-muted text-xs">
              <strong>{candidates.length}</strong> contact(s) éligible(s)
            </p>
            <ul className="border-md-border divide-md-border divide-y rounded-md border bg-white">
              {candidates.length === 0 ? (
                <li className="text-md-text-muted px-3 py-4 text-center text-sm">
                  Aucun contact éligible actuellement.
                </li>
              ) : (
                candidates.map((c) => (
                  <li key={c.contact_id} className="px-3 py-2 text-xs">
                    <div className="text-md-text font-semibold">{c.full_name}</div>
                    <div className="text-md-text-muted">
                      {c.email} · {c.company_name ?? '—'} · {c.language}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  rule: LifecycleRuleView;
}) {
  const [subjectFr, setSubjectFr] = useState(rule.subject_fr);
  const [subjectEn, setSubjectEn] = useState(rule.subject_en);
  const [bodyFr, setBodyFr] = useState(rule.body_fr_html);
  const [bodyEn, setBodyEn] = useState(rule.body_en_html);
  const [pending, startTransition] = useTransition();
  const [translating, startTranslate] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const r = await editLifecycleTemplateAction({
        rule_key: rule.rule_key,
        subject_fr: subjectFr,
        subject_en: subjectEn,
        body_fr_html: bodyFr,
        body_en_html: bodyEn,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Template enregistré.');
      onOpenChange(false);
    });
  }

  function handleTranslate(target: 'fr' | 'en') {
    const source = target === 'fr' ? 'en' : 'fr';
    startTranslate(async () => {
      const r = await translateLifecycleRuleAction({
        rule_key: rule.rule_key,
        source,
        target,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (target === 'en' && r.data) {
        setSubjectEn(r.data.subject);
        setBodyEn(r.data.body_html);
        toast.success('Version EN générée par Claude Haiku 4.5');
      } else if (target === 'fr' && r.data) {
        setSubjectFr(r.data.subject);
        setBodyFr(r.data.body_html);
        toast.success('Version FR générée par Claude Haiku 4.5');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Éditer template — {rule.label_fr}</DialogTitle>
          <DialogDescription>
            Variables : <code>{'{prenom}'}</code> <code>{'{societe}'}</code>{' '}
            <code>{'{etape}'}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Section
            flag="🇫🇷"
            title="Français"
            aiFlag={rule.fr_translated_by_ai_at}
            onTranslate={() => handleTranslate('fr')}
            translating={translating}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`subj-fr-${rule.rule_key}`}>Objet</Label>
              <Input
                id={`subj-fr-${rule.rule_key}`}
                value={subjectFr}
                onChange={(e) => setSubjectFr(e.target.value)}
                placeholder="{prenom}, …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`body-fr-${rule.rule_key}`}>Body HTML</Label>
              <Textarea
                id={`body-fr-${rule.rule_key}`}
                value={bodyFr}
                onChange={(e) => setBodyFr(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
          </Section>

          <Section
            flag="🇬🇧"
            title="English"
            aiFlag={rule.en_translated_by_ai_at}
            onTranslate={() => handleTranslate('en')}
            translating={translating}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`subj-en-${rule.rule_key}`}>Subject</Label>
              <Input
                id={`subj-en-${rule.rule_key}`}
                value={subjectEn}
                onChange={(e) => setSubjectEn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`body-en-${rule.rule_key}`}>Body HTML</Label>
              <Textarea
                id={`body-en-${rule.rule_key}`}
                value={bodyEn}
                onChange={(e) => setBodyEn(e.target.value)}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  flag,
  title,
  aiFlag,
  onTranslate,
  translating,
  children,
}: {
  flag: string;
  title: string;
  aiFlag: string | null;
  onTranslate: () => void;
  translating: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-md-border space-y-3 rounded-md border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-md-text text-sm font-bold">
          {flag} {title}
        </h3>
        <div className="flex items-center gap-2">
          {aiFlag ? (
            <span className="bg-md-warning/15 text-md-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              <AlertTriangle className="size-3" aria-hidden /> Traduit par IA — à relire
            </span>
          ) : (
            <span className="bg-md-success/15 text-md-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              <CheckCircle2 className="size-3" aria-hidden /> Vérifié
            </span>
          )}
          <Button size="sm" variant="outline" onClick={onTranslate} disabled={translating}>
            {translating ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            🪄 Traduire
          </Button>
        </div>
      </div>
      {children}
    </section>
  );
}

function ReTargetDialog({
  open,
  onOpenChange,
  ruleKey,
  ruleLabel,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  ruleKey: string;
  ruleLabel: string;
}) {
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (confirm !== 'RE-CIBLER') {
      toast.error('Tapez exactement "RE-CIBLER" pour confirmer.');
      return;
    }
    startTransition(async () => {
      const r = await reTargetLifecycleRuleAction({ rule_key: ruleKey });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Re-ciblage OK : ${r.data?.deleted ?? 0} contacts seront re-traités au prochain tick.`,
      );
      onOpenChange(false);
      setConfirm('');
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-md-warning flex items-center gap-2">
            <AlertTriangle className="size-5" aria-hidden /> Re-cibler — {ruleLabel}
          </DialogTitle>
          <DialogDescription>
            Cette action{' '}
            <strong>
              supprime tous les <code>lifecycle_recipients</code>
            </strong>{' '}
            de la règle. Au prochain tick cron, tous les contacts éligibles seront re-cible (y
            compris ceux qui ont déjà reçu cette règle dans le passé).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="retarget-confirm">
            Tapez <code>RE-CIBLER</code> pour confirmer
          </Label>
          <Input
            id="retarget-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="RE-CIBLER"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending || confirm !== 'RE-CIBLER'}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Confirmer le re-ciblage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

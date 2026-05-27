'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, RefreshCcw, Eye, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createCampaignAction, previewAudienceAction } from '@/lib/admin/campaigns/actions';
import type {
  AudienceDef,
  AudiencePreviewResult,
  CampaignCategory,
} from '@/lib/admin/campaigns/types';
import { cn } from '@/lib/utils';

/**
 * P8.3 — Wizard 4-step "Nouvelle campagne" :
 *   1. Audience (preview count avec exclus pref).
 *   2. Contenu (inline ou template).
 *   3. Programmation (now ou scheduled_at).
 *   4. Validation (test obligatoire + confirmation chiffrée).
 *
 * V1 : la step 4 (test + confirmation) se fait sur la page de detail
 * /admin/campaigns/[id] apres creation, pour permettre de previsualiser
 * en serveur. Ce wizard cree juste la campagne en draft puis redirige.
 */

interface Props {
  audiences: AudienceDef[];
  categories: CampaignCategory[];
  canSend: boolean;
}

export function NewCampaignWizard({ audiences, categories }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, startTransition] = useTransition();
  const [previewing, startPreview] = useTransition();

  // State campaign
  const [name, setName] = useState('');
  const [audienceKey, setAudienceKey] = useState<string>('newsletter_subscribers');
  const [category, setCategory] = useState<CampaignCategory>('general');
  const [poles, setPoles] = useState<string>(''); // CSV pole codes
  const [etapes, setEtapes] = useState<string>(''); // CSV
  const [langue, setLangue] = useState<'' | 'FR' | 'EN'>('');
  const [contentMode, setContentMode] = useState<'inline' | 'template'>('inline');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(
    "<p>Bonjour {prenom},</p>\n<p>Votre message ici...</p>\n<p>L'équipe MediaDays Solutions</p>",
  );
  const [brevoTemplateId, setBrevoTemplateId] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  // Preview state
  const [preview, setPreview] = useState<AudiencePreviewResult | null>(null);

  function autoSelectCategory(key: string) {
    const def = audiences.find((a) => a.key === key);
    if (def) setCategory(def.defaultCategory);
  }

  function handlePreview() {
    startPreview(async () => {
      try {
        const filters: Record<string, unknown> = {};
        if (poles.trim())
          filters.poles = poles
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (etapes.trim())
          filters.etapes = etapes
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (langue) filters.langue = langue;
        const r = await previewAudienceAction({
          audience_key: audienceKey,
          category,
          filters,
        });
        setPreview(r);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur de preview');
      }
    });
  }

  function handleCreate() {
    if (!name.trim()) {
      toast.error('Donnez un nom à votre campagne.');
      return;
    }
    if (!subject.trim()) {
      toast.error('Le sujet est requis.');
      return;
    }
    if (contentMode === 'inline' && bodyHtml.trim().length < 10) {
      toast.error('Le corps du mail est trop court.');
      return;
    }
    if (contentMode === 'template' && !brevoTemplateId.trim()) {
      toast.error('ID template Brevo requis.');
      return;
    }
    startTransition(async () => {
      const filters: Record<string, unknown> = {};
      if (poles.trim())
        filters.poles = poles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      if (etapes.trim())
        filters.etapes = etapes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      if (langue) filters.langue = langue;

      const r = await createCampaignAction({
        name: name.trim(),
        category,
        audience_key: audienceKey,
        audience_filters: filters,
        content_mode: contentMode,
        subject: subject.trim(),
        body_html: contentMode === 'inline' ? bodyHtml : undefined,
        brevo_template_id: contentMode === 'template' ? Number(brevoTemplateId) : undefined,
        scheduled_at:
          scheduleMode === 'later' && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Campagne créée');
      router.push(`/admin/campaigns/${r.campaign_id}`);
    });
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-xs">
        {[1, 2, 3].map((s) => (
          <li
            key={s}
            className={cn(
              'flex-1 rounded-md border px-3 py-2',
              step === s
                ? 'border-md-magenta bg-md-magenta/10 text-md-magenta font-semibold'
                : 'border-md-border text-md-text-muted',
            )}
          >
            Étape {s}/3 · {s === 1 ? 'Audience' : s === 2 ? 'Contenu' : 'Programmation'}
          </li>
        ))}
      </ol>

      {/* STEP 1 : Audience */}
      {step === 1 ? (
        <section className="border-md-border bg-card space-y-4 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            1 · Audience
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-name">Nom interne *</Label>
            <Input
              id="cmp-name"
              required
              minLength={3}
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Relance acompte décembre"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-audience">Audience prédéfinie *</Label>
            <select
              id="cmp-audience"
              value={audienceKey}
              onChange={(e) => {
                setAudienceKey(e.target.value);
                autoSelectCategory(e.target.value);
                setPreview(null);
              }}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              {audiences.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="text-md-text-muted text-xs">
              {audiences.find((a) => a.key === audienceKey)?.description}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-category">Catégorie de préférence (RGPD) *</Label>
            <select
              id="cmp-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as CampaignCategory);
                setPreview(null);
              }}
              className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className="text-md-text-muted text-xs">
              Les contacts avec <code>pref_{category}=false</code> seront exclus automatiquement
              (P8.1).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Pôles (CSV codes)</Label>
              <Input
                value={poles}
                onChange={(e) => setPoles(e.target.value)}
                placeholder="AUDIO,VIDEO"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Étapes (CSV)</Label>
              <Input
                value={etapes}
                onChange={(e) => setEtapes(e.target.value)}
                placeholder="paris,marseille"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Langue</Label>
              <select
                value={langue}
                onChange={(e) => setLangue(e.target.value as '' | 'FR' | 'EN')}
                className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
              >
                <option value="">— Toutes —</option>
                <option value="FR">FR</option>
                <option value="EN">EN</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={handlePreview} disabled={previewing}>
              {previewing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCcw className="size-4" aria-hidden />
              )}
              Calculer l&apos;audience
            </Button>
            {preview ? (
              <div className="bg-md-bg-soft rounded-md px-3 py-2 text-sm">
                <strong className="text-md-magenta">
                  {preview.total_eligible} destinataire{preview.total_eligible > 1 ? 's' : ''}
                </strong>{' '}
                ({preview.excluded_pref_off} excl. pref / {preview.excluded_unsubscribed} désinscrit
                / {preview.excluded_no_email} invalide)
              </div>
            ) : null}
          </div>
          {preview && preview.sample.length > 0 ? (
            <details className="text-md-text-muted text-xs">
              <summary className="cursor-pointer">Voir les 5 premiers destinataires</summary>
              <ul className="mt-2 space-y-0.5 pl-4">
                {preview.sample.map((s) => (
                  <li key={s.contact_id}>
                    {s.first_name} {s.last_name} &lt;{s.email}&gt; — {s.company_name ?? '—'}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep(2)} disabled={!preview}>
              Étape suivante →
            </Button>
          </div>
        </section>
      ) : null}

      {/* STEP 2 : Contenu */}
      {step === 2 ? (
        <section className="border-md-border bg-card space-y-4 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            2 · Contenu
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setContentMode('inline')}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm font-semibold',
                contentMode === 'inline'
                  ? 'bg-md-magenta border-md-magenta text-white'
                  : 'border-md-border text-md-text hover:bg-muted',
              )}
            >
              Rédiger inline
            </button>
            <button
              type="button"
              onClick={() => setContentMode('template')}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm font-semibold',
                contentMode === 'template'
                  ? 'bg-md-magenta border-md-magenta text-white'
                  : 'border-md-border text-md-text hover:bg-muted',
              )}
            >
              Utiliser un template Brevo
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-subject">Sujet *</Label>
            <Input
              id="cmp-subject"
              required
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex : Bonjour {prenom}, votre acompte est dû"
            />
            <p className="text-md-text-muted text-[11px]">
              Variables disponibles : <code>{'{prenom}'}</code> · <code>{'{societe}'}</code> ·{' '}
              <code>{'{etape}'}</code>
            </p>
          </div>
          {contentMode === 'inline' ? (
            <div className="space-y-1.5">
              <Label htmlFor="cmp-body">Corps HTML *</Label>
              <Textarea
                id="cmp-body"
                rows={10}
                className="font-mono text-xs"
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
              />
              <p className="text-md-text-muted text-[11px]">
                Un footer de désinscription RGPD sera ajouté automatiquement.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cmp-tpl">ID template Brevo *</Label>
              <Input
                id="cmp-tpl"
                type="number"
                min={1}
                value={brevoTemplateId}
                onChange={(e) => setBrevoTemplateId(e.target.value)}
                placeholder="Ex : 12"
              />
              <p className="text-md-text-muted text-[11px]">
                Le template Brevo recevra les params <code>firstName</code>, <code>company</code>,{' '}
                <code>preferencesUrl</code>.
              </p>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              ← Précédent
            </Button>
            <Button onClick={() => setStep(3)}>Étape suivante →</Button>
          </div>
        </section>
      ) : null}

      {/* STEP 3 : Programmation + create */}
      {step === 3 ? (
        <section className="border-md-border bg-card space-y-4 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            3 · Programmation
          </h2>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="schedule"
                checked={scheduleMode === 'now'}
                onChange={() => setScheduleMode('now')}
              />
              Créer un brouillon (envoi manuel ensuite)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="schedule"
                checked={scheduleMode === 'later'}
                onChange={() => setScheduleMode('later')}
              />
              Programmer un envoi
            </label>
            {scheduleMode === 'later' ? (
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="max-w-xs"
              />
            ) : null}
          </div>
          <div className="bg-md-bg-soft rounded-md p-3 text-xs">
            <p className="text-md-text font-semibold">Récapitulatif</p>
            <p className="text-md-text-muted">
              {name || '(sans nom)'} — {audienceKey} — catégorie {category}
              {preview ? ` · ${preview.total_eligible} destinataires` : ''}
            </p>
            <p className="text-md-text-muted mt-1">
              Mode : {contentMode === 'inline' ? 'Inline' : `Template Brevo #${brevoTemplateId}`}
              {scheduleMode === 'later' && scheduledAt ? ` · programmée à ${scheduledAt}` : ''}
            </p>
            <p className="text-md-warning mt-1 flex items-center gap-1">
              <Eye className="size-3" aria-hidden />
              L&apos;envoi de masse passera par la page détail (email test obligatoire +
              confirmation chiffrée).
            </p>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              ← Précédent
            </Button>
            <Button onClick={handleCreate} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              Créer la campagne (brouillon)
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

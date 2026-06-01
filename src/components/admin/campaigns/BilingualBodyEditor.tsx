'use client';

import { useState, useTransition } from 'react';
import {
  Languages,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CampaignBodyEditor } from './CampaignBodyEditor';
import { formatParisDateTime } from '@/lib/format/dates';
import {
  translateCampaignAction,
  markCampaignBodyManuallyEditedAction,
} from '@/lib/admin/campaigns/translate-action';
import { cn } from '@/lib/utils';

/**
 * P8.3-quater — éditeur bilingue avec onglets FR/EN + traduction IA.
 *
 * Wrappe deux <CampaignBodyEditor> (un par langue) avec :
 *   - Tabs en haut (🇫🇷 / 🇬🇧) qui swap la langue editee.
 *   - Bouton "🪄 Traduire avec IA" dans la langue vide (si campaignId
 *     present, le draft existe en DB).
 *   - Bandeau jaune "⚠ Traduit par IA — à relire" si flag positif.
 *   - Bandeau vert "✓ Vérifié manuellement" si rempli mais flag null.
 *
 * En mode "new" (pas de campaignId) : le bouton traduire est masque
 * — l'admin doit creer le draft FR d'abord, puis editer pour traduire.
 */

interface Props {
  campaignId?: string;
  subjectFr: string;
  bodyHtmlFr: string;
  subjectEn: string;
  bodyHtmlEn: string;
  enTranslatedByAiAt: string | null;
  frTranslatedByAiAt: string | null;
  onChangeFr: (subject: string, bodyHtml: string) => void;
  onChangeEn: (subject: string, bodyHtml: string) => void;
}

export function BilingualBodyEditor({
  campaignId,
  subjectFr,
  bodyHtmlFr,
  subjectEn,
  bodyHtmlEn,
  enTranslatedByAiAt,
  frTranslatedByAiAt,
  onChangeFr,
  onChangeEn,
}: Props) {
  const [activeLang, setActiveLang] = useState<'fr' | 'en'>('fr');
  const [translating, startTranslate] = useTransition();
  const [confirmReTranslate, setConfirmReTranslate] = useState<'fr' | 'en' | null>(null);
  // Local AI flags (mises a jour apres translateCampaignAction).
  const [localEnAi, setLocalEnAi] = useState<string | null>(enTranslatedByAiAt);
  const [localFrAi, setLocalFrAi] = useState<string | null>(frTranslatedByAiAt);

  const enIsEmpty = !subjectEn.trim() && !bodyHtmlEn.trim();
  const frIsEmpty = !subjectFr.trim() && !bodyHtmlFr.trim();

  function handleTranslate(target: 'fr' | 'en') {
    if (!campaignId) {
      toast.error("Créez d'abord le brouillon, puis revenez pour traduire.");
      return;
    }
    const source = target === 'en' ? 'fr' : 'en';
    startTranslate(async () => {
      const r = await translateCampaignAction({
        campaign_id: campaignId,
        source,
        target,
      });
      setConfirmReTranslate(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (target === 'en') {
        onChangeEn(r.subject, r.body_html);
        setLocalEnAi(r.translated_at);
        setActiveLang('en');
      } else {
        onChangeFr(r.subject, r.body_html);
        setLocalFrAi(r.translated_at);
        setActiveLang('fr');
      }
      toast.success(
        target === 'en'
          ? 'Version EN générée par Claude Haiku'
          : 'Version FR générée par Claude Haiku',
      );
    });
  }

  function handleManualEdit(lang: 'fr' | 'en', subject: string, body: string) {
    if (lang === 'fr') {
      onChangeFr(subject, body);
      // Si flag IA etait set, on le reset cote local et appel best-effort.
      if (localFrAi) {
        setLocalFrAi(null);
        if (campaignId) {
          void markCampaignBodyManuallyEditedAction({ campaign_id: campaignId, lang: 'fr' });
        }
      }
    } else {
      onChangeEn(subject, body);
      if (localEnAi) {
        setLocalEnAi(null);
        if (campaignId) {
          void markCampaignBodyManuallyEditedAction({ campaign_id: campaignId, lang: 'en' });
        }
      }
    }
  }

  const currentSubject = activeLang === 'fr' ? subjectFr : subjectEn;
  const currentBody = activeLang === 'fr' ? bodyHtmlFr : bodyHtmlEn;
  const otherIsEmpty = activeLang === 'fr' ? enIsEmpty : frIsEmpty;
  const otherLang = activeLang === 'fr' ? 'en' : 'fr';
  const currentAiFlag = activeLang === 'fr' ? localFrAi : localEnAi;
  const currentIsEmpty = activeLang === 'fr' ? frIsEmpty : enIsEmpty;

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="border-md-border bg-md-bg-soft flex items-center gap-1 rounded-md border p-1">
        <Tab
          active={activeLang === 'fr'}
          onClick={() => setActiveLang('fr')}
          flag="🇫🇷"
          label="Français"
          status={frIsEmpty ? 'empty' : localFrAi ? 'ai' : 'verified'}
        />
        <Tab
          active={activeLang === 'en'}
          onClick={() => setActiveLang('en')}
          flag="🇬🇧"
          label="English"
          status={enIsEmpty ? 'empty' : localEnAi ? 'ai' : 'verified'}
        />
      </div>

      {/* Bandeaux selon etat */}
      {currentAiFlag && !currentIsEmpty ? (
        <div className="border-md-warning/40 bg-md-warning/10 flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
          <AlertTriangle className="text-md-warning size-4 shrink-0" aria-hidden />
          <p className="text-md-text flex-1">
            <strong>Traduit par IA</strong> le {formatParisDateTime(currentAiFlag)} — à relire avant
            l&apos;envoi.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReTranslate(activeLang)}
            disabled={translating}
          >
            <RefreshCcw className="size-3.5" aria-hidden />
            Re-traduire
          </Button>
        </div>
      ) : !currentIsEmpty ? (
        <div className="border-md-success/40 bg-md-success/10 flex items-center gap-2 rounded-md border p-2 text-xs">
          <CheckCircle2 className="text-md-success size-4" aria-hidden />
          <span className="text-md-text">Vérifié manuellement</span>
        </div>
      ) : otherIsEmpty ? null : (
        // Langue active vide mais l'autre rempli -> proposer traduction.
        <div className="border-md-blue/30 bg-md-blue/10 flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
          <Languages className="text-md-blue size-4 shrink-0" aria-hidden />
          <p className="text-md-text flex-1">
            La version {activeLang === 'fr' ? 'FR' : 'EN'} est vide.{' '}
            {campaignId
              ? `Générez-la depuis le ${otherLang === 'fr' ? 'FR' : 'EN'} avec Claude Haiku.`
              : "Créez d'abord le brouillon puis revenez pour traduire."}
          </p>
          <Button
            size="sm"
            onClick={() => handleTranslate(activeLang)}
            disabled={!campaignId || translating}
            className="bg-md-magenta text-white"
          >
            {translating ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-3.5" aria-hidden />
            )}
            🪄 Traduire avec IA
          </Button>
        </div>
      )}

      {translating ? (
        <p className="text-md-text-muted text-xs italic">Claude Haiku traduit votre campagne…</p>
      ) : null}

      {/* Subject + Body de la langue active */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`cmp-subject-${activeLang}`}>
            Sujet {activeLang === 'fr' ? '🇫🇷' : '🇬🇧'}
          </Label>
          <Input
            id={`cmp-subject-${activeLang}`}
            required
            maxLength={200}
            value={currentSubject}
            onChange={(e) => handleManualEdit(activeLang, e.target.value, currentBody)}
            placeholder={
              activeLang === 'fr'
                ? 'Bonjour {prenom}, votre acompte est dû'
                : 'Hello {prenom}, your deposit is due'
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Corps {activeLang === 'fr' ? '🇫🇷' : '🇬🇧'}</Label>
          <CampaignBodyEditor
            key={activeLang}
            value={currentBody}
            onChange={(html) => handleManualEdit(activeLang, currentSubject, html)}
            placeholder={
              activeLang === 'fr'
                ? 'Bonjour {prenom}, votre message ici...'
                : 'Hello {prenom}, your message here...'
            }
          />
        </div>
      </div>

      {/* Confirmation re-translate */}
      {confirmReTranslate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card max-w-md space-y-4 rounded-lg p-6 shadow-xl">
            <h3 className="text-md-blue-dark text-lg font-bold">Re-traduire ?</h3>
            <p className="text-md-text-muted text-sm">
              La version actuelle ({confirmReTranslate === 'fr' ? 'FR' : 'EN'}) sera écrasée par une
              nouvelle traduction Claude Haiku. Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmReTranslate(null)}
                disabled={translating}
              >
                Annuler
              </Button>
              <Button
                onClick={() => handleTranslate(confirmReTranslate)}
                disabled={translating}
                className="bg-md-magenta text-white"
              >
                {translating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Confirmer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tab({
  active,
  onClick,
  flag,
  label,
  status,
}: {
  active: boolean;
  onClick: () => void;
  flag: string;
  label: string;
  status: 'empty' | 'ai' | 'verified';
}) {
  const statusBadge = status === 'empty' ? '(vide)' : status === 'ai' ? '(IA)' : '(vérifié)';
  const statusColor =
    status === 'empty'
      ? 'text-md-text-muted'
      : status === 'ai'
        ? 'text-md-warning'
        : 'text-md-success';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition',
        active ? 'bg-md-magenta text-white shadow-sm' : 'text-md-text hover:bg-muted',
      )}
    >
      <span className="mr-1.5" aria-hidden>
        {flag}
      </span>
      {label}{' '}
      <span className={cn('ml-1 text-[10px] font-normal', active ? 'text-white/80' : statusColor)}>
        {statusBadge}
      </span>
    </button>
  );
}

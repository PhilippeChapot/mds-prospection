'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Mail, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  sendTestEmailAction,
  sendCampaignAction,
  cancelCampaignAction,
} from '@/lib/admin/campaigns/actions';
import { cn } from '@/lib/utils';

interface CampaignSummary {
  id: string;
  name: string;
  category: string | null;
  audience_key: string | null;
  status: string;
  subject: string | null;
  body_html: string | null;
  content_mode: string | null;
  brevo_template_id: number | null;
  test_email_sent_at: string | null;
  recipient_count: number;
  sent_count: number;
  error_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
}

interface Props {
  campaign: CampaignSummary;
  previewCount: number;
  canSend: boolean;
}

/**
 * P8.3 — page detail campagne + actions :
 *   - Email test (obligatoire avant envoi).
 *   - Envoi de masse avec confirmation chiffree (taper le nb destinataires).
 *   - Annulation (draft/scheduled).
 *
 * RBAC : seul admin/super_admin voit le bouton "Envoyer". Sales voit
 * seulement "Envoyer un test" + "Annuler le brouillon".
 */
export function CampaignDetailClient({ campaign, previewCount, canSend }: Props) {
  const router = useRouter();
  const [testEmail, setTestEmail] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [pending, startTransition] = useTransition();
  const [testSent, setTestSent] = useState(Boolean(campaign.test_email_sent_at));

  const isDraft = campaign.status === 'draft' || campaign.status === 'scheduled';
  const isSent = campaign.status === 'sent';
  const isSending = campaign.status === 'sending';

  function handleSendTest() {
    if (!testEmail.trim()) {
      toast.error('Email test requis.');
      return;
    }
    startTransition(async () => {
      const r = await sendTestEmailAction({
        campaign_id: campaign.id,
        test_email: testEmail.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Test envoyé à ${testEmail}`);
      setTestSent(true);
    });
  }

  function handleSendCampaign() {
    const n = Number(confirmInput);
    if (!Number.isFinite(n) || n !== previewCount) {
      toast.error(`Tapez exactement ${previewCount} pour confirmer.`);
      return;
    }
    startTransition(async () => {
      const r = await sendCampaignAction({
        campaign_id: campaign.id,
        confirmation_count: previewCount,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Campagne envoyée — ${r.sent} envois, ${r.errors} erreurs, ${r.skipped} skipped.`,
      );
      router.refresh();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const r = await cancelCampaignAction({ campaign_id: campaign.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Campagne annulée');
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          ✉️ {campaign.name}
        </h1>
        <p className="text-md-text-muted text-sm">
          Catégorie : <strong>{campaign.category}</strong> · Audience :{' '}
          <strong>{campaign.audience_key}</strong>
        </p>
      </header>

      {/* Stats */}
      <section className="border-md-border bg-card grid grid-cols-2 gap-3 rounded-xl border p-4 shadow-sm sm:grid-cols-4">
        <Stat label="Statut" value={campaign.status} />
        <Stat label="Audience" value={`${previewCount} contacts`} />
        <Stat label="Envoyés" value={`${campaign.sent_count} / ${campaign.recipient_count}`} />
        <Stat
          label="Erreurs"
          value={campaign.error_count.toString()}
          highlight={campaign.error_count > 0}
        />
      </section>

      {/* Contenu */}
      <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">Contenu</h2>
        <p className="text-md-text-muted text-xs">
          Sujet : <strong className="text-md-text">{campaign.subject}</strong>
        </p>
        {campaign.content_mode === 'inline' && campaign.body_html ? (
          <div
            className="border-md-border max-h-96 overflow-y-auto rounded-md border bg-white p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: campaign.body_html }}
          />
        ) : campaign.content_mode === 'template' ? (
          <p className="text-md-text-muted text-xs">
            Template Brevo #{campaign.brevo_template_id} (aperçu disponible dans Brevo).
          </p>
        ) : (
          <p className="text-md-text-muted text-xs">Contenu non défini.</p>
        )}
      </section>

      {/* Test + Envoi */}
      {isDraft ? (
        <section className="border-md-border bg-card space-y-4 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            Envoi (test obligatoire avant la masse)
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-test">Adresse email pour le test</Label>
            <div className="flex gap-2">
              <Input
                id="cmp-test"
                type="email"
                placeholder="philippe@mediadays.solutions"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <Button onClick={handleSendTest} disabled={pending} variant="outline">
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Mail className="size-4" aria-hidden />
                )}
                Envoyer un test
              </Button>
            </div>
            {testSent ? (
              <p className="text-md-success text-xs">
                ✓ Test envoyé. Vous pouvez maintenant procéder à l&apos;envoi de masse.
              </p>
            ) : (
              <p className="text-md-warning text-xs">
                ⚠ Envoyez d&apos;abord un test pour vérifier le rendu.
              </p>
            )}
          </div>

          {canSend ? (
            <div className="border-md-danger/40 bg-md-danger/5 space-y-2 rounded-md border p-3">
              <p className="text-md-text text-sm font-semibold">
                Envoi de masse : {previewCount} destinataires
              </p>
              <p className="text-md-text-muted text-xs">
                Tapez exactement <code className="text-md-magenta">{previewCount}</code> pour
                confirmer l&apos;envoi à TOUS les destinataires éligibles. Les contacts avec
                préférence désactivée pour la catégorie sont automatiquement exclus (RGPD).
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder={String(previewCount)}
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="max-w-32"
                />
                <Button
                  onClick={handleSendCampaign}
                  disabled={pending || !testSent}
                  className="bg-md-danger hover:bg-md-danger/90 text-white"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="size-4" aria-hidden />
                  )}
                  Envoyer la campagne
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-md-text-muted text-xs italic">
              Seul un admin ou super_admin peut déclencher l&apos;envoi de masse. Vous pouvez
              uniquement envoyer un test ou annuler le brouillon.
            </p>
          )}

          <Button variant="outline" onClick={handleCancel} disabled={pending}>
            <Ban className="size-4" aria-hidden />
            Annuler le brouillon
          </Button>
        </section>
      ) : null}

      {isSending ? (
        <section className="border-md-border bg-md-bg-soft rounded-xl border p-5">
          <p className="text-md-text text-sm">Envoi en cours… rechargez dans quelques secondes.</p>
        </section>
      ) : null}

      {isSent ? (
        <section className="border-md-border bg-md-success/10 rounded-xl border p-5">
          <p className="text-md-text text-sm">
            ✅ Campagne envoyée le{' '}
            {campaign.sent_at ? new Date(campaign.sent_at).toLocaleString('fr-FR') : '—'} —{' '}
            {campaign.sent_count} envois réussis, {campaign.error_count} erreurs.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-md-text-muted text-[10px] font-bold tracking-wider uppercase">{label}</p>
      <p
        className={cn(
          'text-md-text font-mono text-sm font-semibold',
          highlight && 'text-md-danger',
        )}
      >
        {value}
      </p>
    </div>
  );
}

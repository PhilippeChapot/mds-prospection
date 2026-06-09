'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { XCircle, Mail, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { rejectSignup, resendDoi, reclassifySignup } from './actions';
import { SignupConvertActions } from './SignupConvertActions';
import type { SignupStatus } from '../types';

interface Props {
  signupId: string;
  status: SignupStatus;
  tokenExpired: boolean;
  hasProspect: boolean;
}

export function AdminActionsBar({ signupId, status, tokenExpired, hasProspect }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canReject = status !== 'converted' && status !== 'rejected';
  const canResend = status === 'awaiting_verification' || status === 'verified' || tokenExpired;

  function handleReject() {
    startTransition(async () => {
      const result = await rejectSignup(signupId, rejectReason.trim() || undefined);
      if (result.success) {
        toast.success('Inscription rejetée.');
        setRejectMode(false);
        setRejectReason('');
        router.refresh();
      } else {
        toast.error(`Échec : ${'error' in result ? result.error : 'unknown'}`);
      }
    });
  }

  function handleResend() {
    startTransition(async () => {
      const result = await resendDoi(signupId);
      if (result.success) {
        toast.success('Email DOI renvoyé.');
        router.refresh();
      } else {
        toast.error(`Échec : ${'error' in result ? result.error : 'unknown'}`);
      }
    });
  }

  function handleReclassify() {
    startTransition(async () => {
      const result = await reclassifySignup(signupId);
      if (result.success) {
        toast.success('Classification IA mise à jour.');
        router.refresh();
      } else {
        toast.error(`Échec : ${'error' in result ? result.error : 'unknown'}`);
      }
    });
  }

  return (
    <Card className="border-md-border space-y-3 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <SignupConvertActions
          signupId={signupId}
          status={status}
          hasProspect={hasProspect}
          globalPending={pending}
        />

        {canResend && (
          <Button type="button" variant="outline" onClick={handleResend} disabled={pending}>
            <Mail className="size-4" aria-hidden /> Renvoyer le DOI
          </Button>
        )}

        <Button type="button" variant="outline" onClick={handleReclassify} disabled={pending}>
          <Sparkles className="size-4" aria-hidden /> Re-classifier IA
        </Button>

        {canReject && !rejectMode && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setRejectMode(true)}
            disabled={pending}
            className="text-md-danger hover:bg-md-danger/5 border-md-danger/40 ml-auto"
          >
            <XCircle className="size-4" aria-hidden /> Rejeter
          </Button>
        )}
      </div>

      {rejectMode && (
        <div className="border-md-danger/30 bg-md-danger/5 space-y-2 rounded-md border p-3">
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Raison du rejet (facultatif, mais recommandé pour audit)"
            rows={2}
            maxLength={500}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleReject}
              disabled={pending}
              className="bg-md-danger hover:bg-md-danger/90"
            >
              {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Confirmer le rejet
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setRejectMode(false);
                setRejectReason('');
              }}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

'use client';

/**
 * P15.2 — étape "détails visiteur" du Smart Add (après création contact+société).
 * Affiche la bannière Big Co si la société enrichie Apollo dépasse le seuil.
 */
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { POLE_CODES } from '@/lib/design-tokens';
import {
  VISITOR_TYPES,
  VISITOR_TYPE_LABEL,
  VISITOR_LANGUAGES,
  VISITOR_LANGUAGE_LABEL,
  BIG_CO_EMPLOYEE_THRESHOLD,
  type VisitorType,
  type VisitorLanguage,
} from '@/lib/visitors/constants';
import { createVisitorAction } from '@/lib/admin/visitors/create-actions';
import {
  getCompanyApolloSummaryAction,
  type CompanyApolloSummary,
} from '@/lib/admin/visitors/company-summary';

const selectCls = 'border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm';

export function VisitorFieldsStep({
  contactId,
  companyId,
  contactName,
}: {
  contactId: string;
  companyId: string | null;
  contactName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pole, setPole] = useState('');
  const [visitorType, setVisitorType] = useState<VisitorType>('professional');
  const [isVip, setIsVip] = useState(false);
  const [language, setLanguage] = useState<VisitorLanguage>('fr');
  const [notes, setNotes] = useState('');
  const [company, setCompany] = useState<CompanyApolloSummary | null>(null);

  useEffect(() => {
    if (!companyId) return;
    getCompanyApolloSummaryAction(companyId)
      .then(setCompany)
      .catch(() => setCompany(null));
  }, [companyId]);

  const isBigCo = (company?.employee_count ?? 0) > BIG_CO_EMPLOYEE_THRESHOLD;

  function handleSubmit() {
    startTransition(async () => {
      try {
        const res = await createVisitorAction({
          contact_id: contactId,
          pole: pole ? (pole as (typeof POLE_CODES)[number]) : null,
          visitor_type: visitorType,
          is_vip: isVip,
          language,
          notes: notes.trim() || undefined,
          source: 'apollo_smart_add',
        });
        toast.success('Visiteur créé.');
        router.push(`/admin/visitors/${res.visitor_id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur création visiteur.');
      }
    });
  }

  return (
    <section className="bg-card border-md-border space-y-4 rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
        👥 Détails visiteur — {contactName}
      </h2>

      {isBigCo && (
        <div className="border-md-blue/30 bg-md-blue/5 rounded-md border p-3 text-sm">
          🐳 <strong>Big Company détectée</strong> — {company?.name} a {company?.employee_count}+
          employés. Le visiteur sera marqué « Big Co » et les super_admin seront notifiés.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Pôle</Label>
          <select value={pole} onChange={(e) => setPole(e.target.value)} className={selectCls}>
            <option value="">—</option>
            {POLE_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <select
            value={visitorType}
            onChange={(e) => setVisitorType(e.target.value as VisitorType)}
            className={selectCls}
          >
            {VISITOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {VISITOR_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Langue</Label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as VisitorLanguage)}
            className={selectCls}
          >
            {VISITOR_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {VISITOR_LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>VIP</Label>
          <label className="border-md-border inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm">
            <input
              type="checkbox"
              checked={isVip}
              onChange={(e) => setIsVip(e.target.checked)}
              className="size-4"
            />
            Marquer VIP 🌟
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <Button onClick={handleSubmit} disabled={pending} className="w-full">
        {pending ? 'Création…' : 'Créer le visiteur'}
      </Button>
    </section>
  );
}

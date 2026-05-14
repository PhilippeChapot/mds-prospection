'use client';

import { useState, useTransition } from 'react';
import { Loader2, Sparkles, Check, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ParsedSmartAdd } from '@/lib/smart-add/parse-with-ai';
import type { FuzzyMatchedCompany } from '@/lib/smart-add/orchestrator';
import type { AutoMatchResult, SireneEtablissement } from '@/lib/insee/sirene';

type ParseResponse =
  | {
      ok: true;
      parsed: ParsedSmartAdd | null;
      fuzzyMatches: FuzzyMatchedCompany[];
      sirenMatch: AutoMatchResult;
    }
  | { ok: false; error: string };

const POLE_OPTIONS = [
  'AUDIO_RADIO',
  'VIDEO_CTV',
  'REGIES_RETAIL_MEDIA',
  'DIFFUSION_INFRA',
  'DATA_ADTECH',
  'OUTDOOR_DOOH',
  'INCONNU',
] as const;

type CategoryTarif = 'standard' | 'prs_exhibitor' | 'non_eligible';

const CATEGORY_LABELS: Record<CategoryTarif, string> = {
  standard: 'Standard (MDS, tarif normal)',
  prs_exhibitor: 'PRS Exhibitor (tarif préférentiel ex-PRS)',
  non_eligible: 'Non éligible (hors cible MDS)',
};

interface FormState {
  // company
  companyMode: 'new' | 'existing';
  companyId: string;
  companyName: string;
  companyDomain: string;
  companyCountry: string;
  companyPole: (typeof POLE_OPTIONS)[number];
  companyCategory: CategoryTarif;
  // siren
  sirenChoice: 'auto' | 'manual' | 'none';
  sirenSelectedSiret: string; // SIRET when admin picks from ambiguous candidates
  // contact
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
  contactLanguage: 'FR' | 'EN';
  contactIsPrimary: boolean;
}

const emptyForm: FormState = {
  companyMode: 'new',
  companyId: '',
  companyName: '',
  companyDomain: '',
  companyCountry: 'FR',
  companyPole: 'INCONNU',
  companyCategory: 'standard',
  sirenChoice: 'none',
  sirenSelectedSiret: '',
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  contactPhone: '',
  contactRole: '',
  contactLanguage: 'FR',
  contactIsPrimary: true,
};

export function QuickAddWizard() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState('');
  const [parseResp, setParseResp] = useState<ParseResponse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [parsePending, startParse] = useTransition();
  const [confirmPending, startConfirm] = useTransition();

  function handleParse() {
    if (!rawInput.trim()) {
      toast.error("Colle un texte d'abord");
      return;
    }
    startParse(async () => {
      try {
        const res = await fetch('/api/admin/smart-add/parse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rawInput }),
        });
        const json = (await res.json()) as ParseResponse;
        if (!res.ok || !json.ok) {
          throw new Error('error' in json ? json.error : 'Parse échoué');
        }
        setParseResp(json);
        prefillForm(json);
        if (!json.parsed) {
          toast.warning("IA n'a rien extrait — saisis manuellement");
        } else {
          toast.success(
            `Analyse OK (confiance ${json.parsed.confidence}) — ${json.fuzzyMatches.length} société(s) similaires trouvées`,
          );
        }
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  function prefillForm(resp: ParseResponse) {
    if (!resp.ok) return;
    const p = resp.parsed;
    const fm = resp.fuzzyMatches[0];

    setForm({
      ...emptyForm,
      companyMode: fm && fm.similarity >= 0.5 ? 'existing' : 'new',
      companyId: fm?.id ?? '',
      companyName: p?.company.name ?? '',
      companyDomain: p?.company.primary_domain ?? '',
      companyCountry: p?.company.country ?? 'FR',
      companyPole: p?.company.suggested_pole ?? 'INCONNU',
      companyCategory: 'standard',
      sirenChoice:
        resp.sirenMatch?.auto === true ? 'auto' : resp.sirenMatch?.ambiguous ? 'manual' : 'none',
      sirenSelectedSiret: resp.sirenMatch?.auto === true ? resp.sirenMatch.siret : '',
      contactFirstName: p?.person.first_name ?? '',
      contactLastName: p?.person.last_name ?? '',
      contactEmail: p?.person.email ?? '',
      contactPhone: p?.person.phone ?? '',
      contactRole: p?.person.role ?? '',
      contactLanguage: 'FR',
      contactIsPrimary: true,
    });
  }

  function handleConfirm() {
    if (!form.contactEmail) {
      toast.error('Email du contact requis');
      return;
    }
    if (form.companyMode === 'new' && !form.companyName) {
      toast.error('Nom de société requis');
      return;
    }
    if (form.companyMode === 'existing' && !form.companyId) {
      toast.error('Sélectionner une société existante');
      return;
    }

    // Résoudre SIREN/SIRET selon le choix
    let siren: string | null = null;
    let siret: string | null = null;
    let sirenSource: 'insee_auto' | 'insee_manual_select' | 'manual_entry' | null = null;
    if (parseResp?.ok && form.sirenChoice === 'auto' && parseResp.sirenMatch?.auto === true) {
      siren = parseResp.sirenMatch.siren;
      siret = parseResp.sirenMatch.siret;
      sirenSource = 'insee_auto';
    } else if (
      parseResp?.ok &&
      form.sirenChoice === 'manual' &&
      parseResp.sirenMatch?.ambiguous &&
      form.sirenSelectedSiret
    ) {
      const picked = parseResp.sirenMatch.candidates.find(
        (c) => c.siret === form.sirenSelectedSiret,
      );
      if (picked) {
        siren = picked.siren;
        siret = picked.siret;
        sirenSource = 'insee_manual_select';
      }
    }

    const payload = {
      raw_input: rawInput,
      parsed_payload: parseResp?.ok ? parseResp.parsed : null,
      company_mode: form.companyMode,
      company_name: form.companyMode === 'new' ? form.companyName : null,
      company_primary_domain: form.companyMode === 'new' ? form.companyDomain || null : null,
      company_country: form.companyMode === 'new' ? form.companyCountry || null : null,
      company_pole_code: form.companyMode === 'new' ? form.companyPole : undefined,
      company_category: form.companyMode === 'new' ? form.companyCategory : undefined,
      company_id: form.companyMode === 'existing' ? form.companyId : null,
      siren,
      siret,
      siren_source: sirenSource,
      contact_email: form.contactEmail,
      contact_first_name: form.contactFirstName || null,
      contact_last_name: form.contactLastName || null,
      contact_phone: form.contactPhone || null,
      contact_role: form.contactRole || null,
      contact_language: form.contactLanguage,
      contact_is_primary: form.contactIsPrimary,
    };

    startConfirm(async () => {
      try {
        const res = await fetch('/api/admin/smart-add/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as {
          ok: boolean;
          companyId?: string;
          contactId?: string;
          brevoKind?: string;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? 'Confirm échoué');
        }
        toast.success(`Ajouté ! Brevo: ${json.brevoKind}. Redirection vers la fiche société…`);
        router.push(`/admin/companies/${json.companyId}`);
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Step 1 : input + parse */}
      <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          1. Texte source
        </h2>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          rows={8}
          placeholder={`Exemple :\nJean Dupont\nDirecteur Marketing\nStudio Audio Pro\njean.dupont@studio-audio-pro.fr\n+33 1 42 56 78 90`}
          className="border-md-border w-full rounded-md border bg-white p-3 font-mono text-sm"
        />
        <Button type="button" onClick={handleParse} disabled={parsePending || !rawInput.trim()}>
          {parsePending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3.5" aria-hidden />
          )}
          {parsePending ? 'Analyse en cours…' : "Analyser avec l'IA"}
        </Button>
      </section>

      {parseResp?.ok ? (
        <>
          {/* Step 2 : société */}
          <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
            <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
              2. Société
            </h2>

            {parseResp.fuzzyMatches.length > 0 ? (
              <div className="border-md-border bg-muted/30 rounded-md border p-3">
                <p className="text-md-text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
                  Sociétés existantes similaires
                </p>
                <div className="space-y-1.5">
                  {parseResp.fuzzyMatches.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="company-pick"
                        checked={form.companyMode === 'existing' && form.companyId === m.id}
                        onChange={() =>
                          setForm({ ...form, companyMode: 'existing', companyId: m.id })
                        }
                      />
                      <span className="text-md-text font-medium">{m.name}</span>
                      {m.primary_domain ? (
                        <span className="text-md-text-muted font-mono text-xs">
                          ({m.primary_domain})
                        </span>
                      ) : null}
                      {m.siren ? (
                        <span className="text-[10px] text-emerald-600">SIREN {m.siren}</span>
                      ) : null}
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="company-pick"
                      checked={form.companyMode === 'new'}
                      onChange={() => setForm({ ...form, companyMode: 'new' })}
                    />
                    <span className="text-md-text-muted italic">Créer nouvelle société</span>
                  </label>
                </div>
              </div>
            ) : null}

            {form.companyMode === 'new' ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Nom" required>
                  <Input
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  />
                </Field>
                <Field label="Domaine">
                  <Input
                    value={form.companyDomain}
                    onChange={(e) => setForm({ ...form, companyDomain: e.target.value })}
                    placeholder="acme.com"
                  />
                </Field>
                <Field label="Pays (ISO2)">
                  <Input
                    value={form.companyCountry}
                    onChange={(e) =>
                      setForm({ ...form, companyCountry: e.target.value.toUpperCase().slice(0, 2) })
                    }
                  />
                </Field>
                <Field label="Pôle">
                  <select
                    value={form.companyPole}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        companyPole: e.target.value as (typeof POLE_OPTIONS)[number],
                      })
                    }
                    className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                  >
                    {POLE_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Catégorie tarif">
                  <select
                    value={form.companyCategory}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        companyCategory: e.target.value as CategoryTarif,
                      })
                    }
                    className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                  >
                    {(['standard', 'prs_exhibitor', 'non_eligible'] as const).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
          </section>

          {/* SIREN INSEE */}
          {parseResp.sirenMatch ? (
            <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
              <h2 className="text-md-blue-dark flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
                <Search className="size-4" aria-hidden /> SIREN INSEE
              </h2>
              {parseResp.sirenMatch.auto ? (
                <div className="border-md-border space-y-2 rounded-md border bg-emerald-50/60 p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={form.sirenChoice === 'auto'}
                      onChange={() => setForm({ ...form, sirenChoice: 'auto' })}
                    />
                    <Check className="size-3.5 text-emerald-600" aria-hidden />
                    Match unique :{' '}
                    <strong className="font-mono">{parseResp.sirenMatch.siren}</strong> ·{' '}
                    {parseResp.sirenMatch.etablissement.uniteLegale.denominationUniteLegale ?? '—'}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={form.sirenChoice === 'none'}
                      onChange={() => setForm({ ...form, sirenChoice: 'none' })}
                    />
                    <span className="text-md-text-muted">Ne pas associer de SIREN</span>
                  </label>
                </div>
              ) : parseResp.sirenMatch.ambiguous ? (
                <div className="border-md-border space-y-2 rounded-md border bg-amber-50/60 p-3 text-sm">
                  <p className="text-md-text font-medium">
                    {parseResp.sirenMatch.candidates.length} candidats — choisir manuellement :
                  </p>
                  {parseResp.sirenMatch.candidates.map((c: SireneEtablissement) => (
                    <label key={c.siret} className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="siren-pick"
                        checked={
                          form.sirenChoice === 'manual' && form.sirenSelectedSiret === c.siret
                        }
                        onChange={() =>
                          setForm({
                            ...form,
                            sirenChoice: 'manual',
                            sirenSelectedSiret: c.siret,
                          })
                        }
                        className="mt-1"
                      />
                      <span>
                        <strong className="font-mono">{c.siren}</strong>
                        {c.etablissementSiege ? (
                          <span className="bg-md-blue/10 text-md-blue ml-1 rounded px-1 text-[10px]">
                            siège
                          </span>
                        ) : null}{' '}
                        — {c.uniteLegale.denominationUniteLegale ?? '—'}{' '}
                        <span className="text-md-text-muted text-xs">
                          ({c.adresseEtablissement.libelleCommuneEtablissement ?? '?'})
                        </span>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="siren-pick"
                      checked={form.sirenChoice === 'none'}
                      onChange={() => setForm({ ...form, sirenChoice: 'none' })}
                    />
                    <span className="text-md-text-muted">Aucun</span>
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Step 3 : contact */}
          <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
            <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
              3. Contact
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Email" required>
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </Field>
              <Field label="Téléphone">
                <Input
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </Field>
              <Field label="Prénom">
                <Input
                  value={form.contactFirstName}
                  onChange={(e) => setForm({ ...form, contactFirstName: e.target.value })}
                />
              </Field>
              <Field label="Nom">
                <Input
                  value={form.contactLastName}
                  onChange={(e) => setForm({ ...form, contactLastName: e.target.value })}
                />
              </Field>
              <Field label="Rôle">
                <Input
                  value={form.contactRole}
                  onChange={(e) => setForm({ ...form, contactRole: e.target.value })}
                />
              </Field>
              <Field label="Langue">
                <select
                  value={form.contactLanguage}
                  onChange={(e) =>
                    setForm({ ...form, contactLanguage: e.target.value as 'FR' | 'EN' })
                  }
                  className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
                >
                  <option value="FR">FR</option>
                  <option value="EN">EN</option>
                </select>
              </Field>
            </div>
            <label className="text-md-text inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.contactIsPrimary}
                onChange={(e) => setForm({ ...form, contactIsPrimary: e.target.checked })}
              />
              Marquer comme contact primary
            </label>
          </section>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={confirmPending}
              className="bg-md-blue hover:bg-md-blue-dark"
            >
              {confirmPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              Ajouter et synchroniser Brevo
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-md-text-muted mb-1 block text-[10px] font-semibold tracking-wider uppercase">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

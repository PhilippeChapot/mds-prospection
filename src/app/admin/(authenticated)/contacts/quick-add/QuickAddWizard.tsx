'use client';

import { useState, useTransition } from 'react';
import { Loader2, Sparkles, Check, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DomainTagsInput } from '@/components/ui/DomainTagsInput';
import { extractEmailDomain } from '@/lib/utils/domain';
import type { ParsedSmartAdd } from '@/lib/smart-add/parse-with-ai';
import type { FuzzyMatchedCompany, ExistingContactMatch } from '@/lib/smart-add/orchestrator';
import type { AutoMatchResult, SireneEtablissement } from '@/lib/insee/sirene';
import { VisitorFieldsStep } from './_components/VisitorFieldsStep';
import { SpeakerFieldsStep } from './_components/SpeakerFieldsStep';

/** P15.2 — Smart Add 3-way : ce qu'on crée au bout du flow. */
type Audience = 'prospect' | 'visitor' | 'speaker';

const AUDIENCE_OPTIONS: { value: Audience; icon: string; title: string; desc: string }[] = [
  {
    value: 'prospect',
    icon: '🏢',
    title: 'Prospect partenaire',
    desc: 'Exposant potentiel (pack, owner…)',
  },
  {
    value: 'visitor',
    icon: '👥',
    title: 'Visiteur MDS',
    desc: 'Visiteur du salon (pro/presse/VIP…)',
  },
  { value: 'speaker', icon: '🎤', title: 'Speaker MDS', desc: 'Intervenant (SHELL, fiche P16)' },
];

type ParseResponse =
  | {
      ok: true;
      parsed: ParsedSmartAdd | null;
      fuzzyMatches: FuzzyMatchedCompany[];
      sirenMatch: AutoMatchResult;
      existingContacts: ExistingContactMatch[];
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
  prs_exhibitor: 'PRS Partner (tarif préférentiel ex-PRS)',
  non_eligible: 'Non éligible (hors cible MDS)',
};

interface FormState {
  // company
  companyMode: 'new' | 'existing';
  companyId: string;
  companyName: string;
  companyDomain: string;
  companyAlternateDomains: string[];
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
  /** P5.x.23-ter : 'new' = créer, sinon UUID = UPSERT sur ce contact */
  contactMode: 'new' | string;
  /** P5.x.23-quinquies : checkbox auto-suggestion alternate_domain. */
  addAlternateDomain: boolean;
}

const emptyForm: FormState = {
  companyMode: 'new',
  companyId: '',
  companyName: '',
  companyDomain: '',
  companyAlternateDomains: [],
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
  contactMode: 'new',
  addAlternateDomain: true,
};

export function QuickAddWizard() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState('');
  const [parseResp, setParseResp] = useState<ParseResponse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [parsePending, startParse] = useTransition();
  const [confirmPending, startConfirm] = useTransition();

  // P15.2 — audience choisie (étape 0) + résultat de la création contact/société.
  const [audience, setAudience] = useState<Audience>('prospect');
  const [created, setCreated] = useState<{
    companyId: string | null;
    contactId: string;
    contactName: string;
  } | null>(null);

  // P5.x.23-quinquies : détection auto-suggestion alternate_domain.
  //   1. mode='existing' (sinon le primary du nouveau est saisi à la main)
  //   2. domaine email extractible
  //   3. domaine != primary_domain de la société sélectionnée
  //   4. domaine ∉ alternate_domains actuels
  const emailDomain = extractEmailDomain(form.contactEmail);
  const selectedCompany =
    parseResp?.ok && form.companyMode === 'existing' && form.companyId
      ? (parseResp.fuzzyMatches.find((m) => m.id === form.companyId) ?? null)
      : null;
  const showAddAlternateDomainSuggestion =
    form.companyMode === 'existing' &&
    selectedCompany !== null &&
    emailDomain !== null &&
    selectedCompany.primary_domain?.toLowerCase() !== emailDomain &&
    !selectedCompany.alternate_domains.map((d) => d.toLowerCase()).includes(emailDomain);

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
      companyAlternateDomains: p?.company.alternate_domains ?? [],
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
      contactMode: resp.existingContacts.length > 0 ? resp.existingContacts[0].id : 'new',
      addAlternateDomain: true,
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
      company_alternate_domains:
        form.companyMode === 'new' ? form.companyAlternateDomains : undefined,
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
      contact_existing_id: form.contactMode === 'new' ? null : form.contactMode,
      add_alternate_domain: showAddAlternateDomainSuggestion && form.addAlternateDomain,
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
        // P15.2 — branche selon l'audience choisie à l'étape 0.
        const contactName =
          [form.contactFirstName, form.contactLastName].filter(Boolean).join(' ').trim() ||
          form.contactEmail;
        if (audience === 'prospect') {
          toast.success(`Contact prêt (Brevo: ${json.brevoKind}). Finalise le prospect…`);
          const qp = new URLSearchParams();
          if (json.contactId) qp.set('contact_id', json.contactId);
          else if (json.companyId) qp.set('company_id', json.companyId);
          router.push(`/admin/prospects/new?${qp.toString()}`);
        } else if (json.contactId) {
          toast.success(`Contact créé (Brevo: ${json.brevoKind}). Complète les infos.`);
          setCreated({
            companyId: json.companyId ?? null,
            contactId: json.contactId,
            contactName,
          });
        } else {
          throw new Error('Contact non créé (id manquant).');
        }
      } catch (err) {
        toast.error(`Échec : ${(err as Error).message}`);
      }
    });
  }

  // P15.2 — une fois le contact créé pour un visiteur/speaker, on affiche
  // l'étape de champs spécifiques (le prospect, lui, redirige vers son form).
  if (created && audience === 'visitor') {
    return (
      <VisitorFieldsStep
        contactId={created.contactId}
        companyId={created.companyId}
        contactName={created.contactName}
      />
    );
  }
  if (created && audience === 'speaker') {
    return <SpeakerFieldsStep contactId={created.contactId} contactName={created.contactName} />;
  }

  return (
    <div className="space-y-5">
      {/* Step 0 : audience (P15.2) */}
      <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          0. Que veux-tu ajouter ?
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAudience(opt.value)}
              className={`rounded-lg border p-3 text-left transition ${
                audience === opt.value
                  ? 'border-md-blue ring-md-blue/30 border-2 ring-2'
                  : 'border-md-border hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <span className="text-lg">{opt.icon}</span>
                {opt.title}
              </div>
              <p className="text-md-text-muted mt-1 text-xs">{opt.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-md-text-muted text-xs">
          L&apos;enrichissement et la création contact/société sont communs. La fin du flow crée la
          row{' '}
          {audience === 'prospect' ? 'prospect' : audience === 'visitor' ? 'visiteur' : 'speaker'}.
        </p>
      </section>

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
                <Field label="Domaine principal">
                  <Input
                    value={form.companyDomain}
                    onChange={(e) => setForm({ ...form, companyDomain: e.target.value })}
                    placeholder="acme.com"
                  />
                </Field>
                <Field label="Domaines alternatifs">
                  <DomainTagsInput
                    value={form.companyAlternateDomains}
                    onChange={(domains) => setForm({ ...form, companyAlternateDomains: domains })}
                    excludeDomains={form.companyDomain ? [form.companyDomain] : []}
                    placeholder="Ex: francetelevisions.fr (Entrée)"
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

            {parseResp.existingContacts.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm">
                <p className="text-md-text mb-2 flex items-center gap-1 text-xs font-semibold tracking-wider uppercase">
                  ⚠ Contact(s) existant(s) avec cet email
                </p>
                <div className="space-y-1.5">
                  {parseResp.existingContacts.map((c) => (
                    <label key={c.id} className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="contact-mode"
                        checked={form.contactMode === c.id}
                        onChange={() => setForm({ ...form, contactMode: c.id })}
                        className="mt-1"
                      />
                      <span>
                        <strong>
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}
                        </strong>{' '}
                        — <span className="font-mono text-xs">{c.email}</span>
                        <div className="text-md-text-muted text-[11px]">
                          {c.role ? `${c.role} · ` : ''}Société : {c.company_name}
                          {c.is_primary ? ' · ★ primary' : ''}
                        </div>
                      </span>
                    </label>
                  ))}
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="contact-mode"
                      checked={form.contactMode === 'new'}
                      onChange={() => setForm({ ...form, contactMode: 'new' })}
                      className="mt-1"
                    />
                    <span className="text-md-text-muted italic">Créer un nouveau contact</span>
                  </label>
                </div>
                <p className="text-md-text-muted mt-2 text-[11px]">
                  Si tu lies à un contact existant, les champs vides (prénom, nom, rôle, téléphone)
                  seront enrichis avec les valeurs ci-dessous (les valeurs DB existantes sont
                  préservées).
                </p>
              </div>
            ) : null}

            {showAddAlternateDomainSuggestion && selectedCompany && emailDomain ? (
              <div className="border-md-blue/30 bg-md-blue/5 rounded-md border p-3 text-sm">
                <p className="text-md-blue-dark mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
                  💡 Le domaine de l&apos;email ne correspond pas à la société
                </p>
                <div className="text-md-text mb-3 space-y-0.5">
                  <div>
                    <strong>Email :</strong> <span className="font-mono">{form.contactEmail}</span>{' '}
                    <span className="text-md-text-muted text-xs">
                      (domaine :{' '}
                      <code className="bg-md-blue/10 rounded px-1 font-mono">{emailDomain}</code>)
                    </span>
                  </div>
                  <div>
                    <strong>Société :</strong> {selectedCompany.name}{' '}
                    <span className="text-md-text-muted text-xs">
                      (primary :{' '}
                      <code className="bg-md-blue/10 rounded px-1 font-mono">
                        {selectedCompany.primary_domain ?? '—'}
                      </code>
                      )
                    </span>
                  </div>
                </div>
                <label className="text-md-text flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.addAlternateDomain}
                    onChange={(e) => setForm({ ...form, addAlternateDomain: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    Ajouter{' '}
                    <code className="bg-md-blue/10 rounded px-1 font-mono">{emailDomain}</code> aux
                    domaines alternatifs de {selectedCompany.name}
                  </span>
                </label>
                <p className="text-md-text-muted mt-2 ml-6 text-[11px]">
                  Les futurs contacts avec un email <code>@{emailDomain}</code> seront alors
                  automatiquement matchés à cette société.
                </p>
              </div>
            ) : null}

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
              {audience === 'prospect'
                ? 'Ajouter → finaliser le prospect'
                : audience === 'visitor'
                  ? 'Ajouter → détails visiteur'
                  : 'Ajouter → détails speaker'}
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

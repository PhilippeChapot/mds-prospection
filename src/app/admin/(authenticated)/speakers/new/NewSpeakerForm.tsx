'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ContactCombobox, type ContactOption } from '@/components/admin/ContactCombobox';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import {
  SPEAKER_TYPES,
  SPEAKER_TYPE_LABEL,
  SPEAKER_STATUSES,
  SPEAKER_STATUS_LABEL,
} from '@/lib/speakers/constants';
import { VISITOR_LANGUAGES, VISITOR_LANGUAGE_LABEL } from '@/lib/visitors/constants';
import {
  createSpeakerFullAction,
  type CreateSpeakerFullInput,
} from '@/lib/admin/speakers/admin-create-actions';

type Owner = { id: string; label: string };
const selectCls = 'border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm';

export function NewSpeakerForm({
  owners,
  currentUser,
}: {
  owners: Owner[];
  currentUser: {
    id: string;
    full_name: string | null;
    email: string;
    role: 'admin' | 'sales' | 'super_admin';
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [contactMode, setContactMode] = useState<'existing' | 'new'>('existing');
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');

  const [speakerType, setSpeakerType] = useState('panel');
  const [status, setStatus] = useState('proposed');
  const [language, setLanguage] = useState('fr');
  const [bioShort, setBioShort] = useState('');
  const [bioLong, setBioLong] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [twitter, setTwitter] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [ownerId, setOwnerId] = useState(currentUser.id);

  const usingExisting = contactMode === 'existing' && selectedContact;

  function addTopic() {
    const t = topicInput.trim();
    if (t && !topics.includes(t) && topics.length < 20) setTopics([...topics, t]);
    setTopicInput('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const base = {
      speaker_type: speakerType ? (speakerType as CreateSpeakerFullInput['speaker_type']) : null,
      status: status as CreateSpeakerFullInput['status'],
      topics: topics.length ? topics : undefined,
      bio_short: bioShort.trim() || undefined,
      bio_long: bioLong.trim() || undefined,
      photo_url: photoUrl.trim() || undefined,
      linkedin_url: linkedin.trim() || undefined,
      twitter_handle: twitter.trim() || undefined,
      language: language as CreateSpeakerFullInput['language'],
      owner_user_id: hasAdminAccess(currentUser.role) ? ownerId : currentUser.id,
    };

    let input: CreateSpeakerFullInput;
    if (contactMode === 'existing' && selectedContact) {
      input = { ...base, contact_id: selectedContact.id };
    } else {
      if (!email.trim() || !firstName.trim() || !lastName.trim()) {
        setError('Prénom, nom et email sont requis pour un nouveau contact.');
        return;
      }
      input = {
        ...base,
        new_contact: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone_mobile: phone.trim() || undefined,
          new_company_name: companyName.trim() || undefined,
        },
      };
    }

    startTransition(async () => {
      try {
        const res = await createSpeakerFullAction(input);
        toast.success('Speaker créé.');
        router.push(`/admin/speakers/${res.speaker_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur création speaker.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Contact">
        <Field label="Sélectionner un contact existant">
          <ContactCombobox
            onSelect={(c) => setSelectedContact(c)}
            onCreateNew={() => {
              setSelectedContact(null);
              setContactMode('new');
            }}
            onModeChange={setContactMode}
            emitHiddenInputs={false}
          />
        </Field>

        {!usingExisting ? (
          <div className="bg-muted/30 border-md-border space-y-3 rounded-md border border-dashed p-3">
            <p className="text-md-text-muted text-xs">
              Nouveau contact : si l&apos;email existe déjà, il sera réutilisé.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Prénom" required>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Nom" required>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Téléphone mobile">
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Société (créée si inexistante)">
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="RTL Group"
                />
              </Field>
            </div>
          </div>
        ) : (
          <div className="bg-md-blue/5 border-md-blue/30 space-y-1 rounded-md border p-3 text-sm">
            <p className="text-md-text font-semibold">
              {[selectedContact.first_name, selectedContact.last_name]
                .filter(Boolean)
                .join(' ')
                .trim() || selectedContact.email}
            </p>
            <p className="text-md-text-muted text-xs">
              <span className="font-mono">{selectedContact.email}</span> ·{' '}
              {selectedContact.company_name}
            </p>
          </div>
        )}
      </Section>

      <Section title="Speaker">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Type">
            <select
              value={speakerType}
              onChange={(e) => setSpeakerType(e.target.value)}
              className={selectCls}
            >
              {SPEAKER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SPEAKER_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut initial">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectCls}
            >
              {SPEAKER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SPEAKER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Langue">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={selectCls}
            >
              {VISITOR_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {VISITOR_LANGUAGE_LABEL[l]}
                </option>
              ))}
            </select>
          </Field>
          {hasAdminAccess(currentUser.role) ? (
            <Field label="Owner">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={selectCls}
              >
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        <Field label="Sujets (topics)">
          {topics.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {topics.map((t) => (
                <Badge
                  key={t}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => setTopics(topics.filter((x) => x !== t))}
                >
                  {t} ✕
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="Ex: IA générative, monétisation…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTopic();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addTopic}>
              + Ajouter
            </Button>
          </div>
        </Field>

        <Field label="Bio courte (max 500)">
          <Textarea
            value={bioShort}
            onChange={(e) => setBioShort(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </Field>
        <Field label="Bio longue (optionnelle)">
          <Textarea value={bioLong} onChange={(e) => setBioLong(e.target.value)} rows={4} />
        </Field>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Photo URL">
            <Input
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="LinkedIn URL">
            <Input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Twitter / X">
            <Input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@handle"
            />
          </Field>
        </div>
      </Section>

      {error ? (
        <p
          role="alert"
          className="border-md-danger/40 bg-md-danger/15 text-md-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button asChild variant="ghost" type="button">
          <Link href="/admin/speakers">Annuler</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Création…' : 'Créer le speaker'}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
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
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-md-magenta ml-0.5">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

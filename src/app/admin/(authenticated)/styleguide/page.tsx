import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { HeaderLogo } from '@/components/brand/HeaderLogo';
import { StatusPill } from '@/components/admin/StatusPill';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { SyncBadges } from '@/components/admin/SyncBadges';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import { ComboboxDemo, DialogDemo, SelectDemo, TabsDemo, ToastDemo } from './InteractiveDemos';

export const metadata = { title: 'Styleguide' };

const BRAND_COLORS = [
  { hex: '#294294', name: 'md-blue' },
  { hex: '#0B3FA8', name: 'md-blue-bright' },
  { hex: '#031A56', name: 'md-blue-dark' },
  { hex: '#00124A', name: 'md-blue-deep' },
  { hex: '#E6007E', name: 'md-magenta' },
  { hex: '#FF4DA0', name: 'md-magenta-soft' },
  { hex: '#1FBF7A', name: 'md-success' },
  { hex: '#F5A524', name: 'md-warning' },
  { hex: '#E5484D', name: 'md-danger' },
  { hex: '#F2F4FB', name: 'md-bg', textDark: true },
  { hex: '#0E1A3C', name: 'md-text' },
  { hex: '#5C6A8A', name: 'md-text-muted' },
];

const PROSPECT_STATUSES = [
  'lead',
  'contact',
  'devis_envoye',
  'acompte_paye',
  'signe',
  'perdu',
] as const;

const LOGO_FILES = [
  {
    src: '/brand/MDSLogo_final_blanc_ligne.svg',
    label: 'MDSLogo_final_blanc_ligne.svg',
    dark: true,
  },
  {
    src: '/brand/MDSLogo_final_bleu_ligne.svg',
    label: 'MDSLogo_final_bleu_ligne.svg',
    dark: false,
  },
  { src: '/brand/PRS-LogoBlanc2026.svg', label: 'PRS-LogoBlanc2026.svg', dark: true },
  { src: '/brand/PRS-LogoBleu2026.svg', label: 'PRS-LogoBleu2026.svg', dark: false },
];

export default async function StyleguidePage() {
  // P5.x.1-quater (bug #2) — defense in depth : admin+ only.
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }
  return (
    <div className="mx-auto max-w-6xl space-y-12">
      <header className="space-y-3">
        <span className="text-md-magenta text-xs font-bold tracking-[0.2em] uppercase">
          Console admin · charte
        </span>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight">
          Styleguide MDS Prospection
        </h1>
        <p className="text-md-text-muted max-w-2xl text-sm">
          Source de verite visuelle pour toute la console admin. Tokens : voir
          <code className="text-xs"> docs/DESIGN-TOKENS.md </code>
          et <code className="text-xs">src/app/globals.css</code>.
        </p>
      </header>

      {/* ------------------------- Couleurs ------------------------- */}
      <Section title="Couleurs">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {BRAND_COLORS.map((c) => (
            <Swatch key={c.name} {...c} />
          ))}
        </div>

        <h3 className="text-md-text-muted mt-6 text-xs font-bold tracking-widest uppercase">
          Couleurs des poles (SPEC §3.1)
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {POLE_CODES.map((code) => (
            <PoleSwatch key={code} code={code} />
          ))}
        </div>
      </Section>

      {/* ------------------------- Typographie ---------------------- */}
      <Section title="Typographie">
        <div className="space-y-4">
          <div>
            <p className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
              Display · Montserrat 800 · 36px
            </p>
            <h1 className="font-[family-name:var(--font-montserrat)] text-4xl font-extrabold tracking-tight">
              Le rendez-vous des partenaires des medias
            </h1>
          </div>
          <div>
            <p className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
              Page title · Montserrat 700 · 24px
            </p>
            <h2 className="font-[family-name:var(--font-montserrat)] text-2xl font-bold">
              Pipeline MDS 2026
            </h2>
          </div>
          <div>
            <p className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
              Section · Montserrat 700 · 18px
            </p>
            <h3 className="font-[family-name:var(--font-montserrat)] text-lg font-bold">
              Repartition par pole
            </h3>
          </div>
          <div>
            <p className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
              Body · Inter 400 · 14px
            </p>
            <p className="text-sm">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris vel ligula nec libero
              porta efficitur sit amet eu velit.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FontWeightSample weight={400} sample="Inter Regular" />
            <FontWeightSample weight={500} sample="Inter Medium" />
            <FontWeightSample weight={600} sample="Inter Semibold" />
            <FontWeightSample weight={700} sample="Inter Bold" />
          </div>
        </div>
      </Section>

      {/* ------------------------- Boutons -------------------------- */}
      <Section title="Boutons">
        <div className="space-y-4">
          <Row label="Variants">
            <Button>Primary (magenta)</Button>
            <Button variant="secondary">Secondary (bleu)</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </Row>
          <Row label="Tailles">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
          </Row>
          <Row label="States">
            <Button disabled>Disabled</Button>
            <Button disabled>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading…
            </Button>
          </Row>
        </div>
      </Section>

      {/* ------------------------- Poles ---------------------------- */}
      <Section title="Poles thematiques">
        <p className="text-md-text-muted mb-3 text-sm">
          7 valeurs (les 6 + INCONNU) — taxonomie figee v2.1, alignee avec l&apos;enum Postgres
          <code className="ml-1 text-xs">pole_code</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          {POLE_CODES.map((code) => (
            <PoleBadge key={code} code={code} />
          ))}
        </div>
      </Section>

      {/* ------------------------- Statuts -------------------------- */}
      <Section title="Statuts prospect">
        <p className="text-md-text-muted mb-3 text-sm">
          Workflow : lead → contact → devis_envoye → acompte_paye → signe (perdu a toute etape).
        </p>
        <div className="flex flex-wrap gap-2">
          {PROSPECT_STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </Section>

      {/* ------------------------- Sync badges ---------------------- */}
      <Section title="Synchronisations (badges compacts)">
        <div className="flex flex-col gap-3">
          <Row label="Tout synchronise">
            <SyncBadges
              syncs={[
                { target: 'sellsy', state: 'synced' },
                { target: 'brevo', state: 'synced' },
                { target: 'stripe', state: 'synced' },
              ]}
            />
          </Row>
          <Row label="Mixte (en cours / idle)">
            <SyncBadges
              syncs={[
                { target: 'sellsy', state: 'synced' },
                { target: 'brevo', state: 'pending' },
                { target: 'stripe', state: 'idle' },
              ]}
            />
          </Row>
        </div>
      </Section>

      {/* ------------------------- shadcn --------------------------- */}
      <Section title="Composants shadcn customises">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Carte</CardTitle>
              <CardDescription>Stand ACCESS · Salle Le Notre rangee A</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge>PRS partner</Badge>
                <span className="text-md-magenta text-2xl font-extrabold">1 980 €</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Form Input + Label</CardTitle>
              <CardDescription>Pattern utilise dans le login admin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sg-email">Email professionnel</Label>
                <Input id="sg-email" type="email" placeholder="contact@radiofrance.com" />
              </div>
              <Button className="w-full">Continuer</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dialog</CardTitle>
              <CardDescription>Confirmation d&apos;action destructive</CardDescription>
            </CardHeader>
            <CardContent>
              <DialogDemo />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Toast (Sonner)</CardTitle>
              <CardDescription>Feedback transient en haut a droite</CardDescription>
            </CardHeader>
            <CardContent>
              <ToastDemo />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select</CardTitle>
              <CardDescription>Dropdown radix sur charte MD</CardDescription>
            </CardHeader>
            <CardContent>
              <SelectDemo />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tabs</CardTitle>
              <CardDescription>Navigation interne fiche prospect</CardDescription>
            </CardHeader>
            <CardContent>
              <TabsDemo />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Combobox (cmdk)</CardTitle>
              <CardDescription>Auto-complete societe — utilise en P3</CardDescription>
            </CardHeader>
            <CardContent>
              <ComboboxDemo />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skeleton</CardTitle>
              <CardDescription>Loading placeholder</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ------------------------- Logos ---------------------------- */}
      <Section title="Logos · SPEC §3.31">
        <h3 className="text-md-text-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Fichiers SVG bruts
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {LOGO_FILES.map((f) => (
            <LogoFile key={f.src} {...f} />
          ))}
        </div>

        <h3 className="text-md-text-muted mt-8 mb-3 text-xs font-bold tracking-widest uppercase">
          {'<HeaderLogo />'} contextuel
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <LogoVariant label="category=admin (les deux, theme=dark)" dark>
            <HeaderLogo category="admin" theme="dark" size={32} />
          </LogoVariant>
          <LogoVariant label="category=prs_exhibitor (PRS seul, theme=dark)" dark>
            <HeaderLogo category="prs_exhibitor" theme="dark" size={32} />
          </LogoVariant>
          <LogoVariant label="category=standard (MDS seul, theme=light)">
            <HeaderLogo category="standard" theme="light" size={32} />
          </LogoVariant>
          <LogoVariant label="category=non_eligible (les deux, theme=light)">
            <HeaderLogo category="non_eligible" theme="light" size={32} />
          </LogoVariant>
        </div>
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Helper components                             */
/* -------------------------------------------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-lg font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-md-text-muted w-28 shrink-0 text-[10px] font-bold tracking-widest uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Swatch({ hex, name, textDark }: { hex: string; name: string; textDark?: boolean }) {
  return (
    <div
      className="border-md-border flex h-24 flex-col justify-end rounded-lg border p-3"
      style={{ background: hex, color: textDark ? '#0E1A3C' : '#fff' }}
    >
      <span className="font-mono text-xs">{name}</span>
      <span className="font-mono text-[10px] opacity-80">{hex}</span>
    </div>
  );
}

function PoleSwatch({ code }: { code: PoleCode }) {
  return (
    <div className="border-md-border flex items-center gap-3 rounded-lg border p-3">
      <PoleBadge code={code} withLabel={false} />
      <div className="min-w-0">
        <div className="text-md-text truncate font-mono text-xs">{code}</div>
      </div>
    </div>
  );
}

function FontWeightSample({ weight, sample }: { weight: number; sample: string }) {
  return (
    <div className="border-md-border rounded-lg border p-3 text-sm" style={{ fontWeight: weight }}>
      <div className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
        {weight}
      </div>
      <div className="mt-1">{sample}</div>
    </div>
  );
}

function LogoFile({ src, label, dark }: { src: string; label: string; dark: boolean }) {
  return (
    <div
      className={
        dark
          ? 'bg-md-blue-deep flex h-28 items-center justify-center rounded-lg p-4'
          : 'bg-card border-md-border flex h-28 items-center justify-center rounded-lg border p-4'
      }
    >
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG raw demo */}
        <img src={src} alt={label} style={{ height: 32, width: 'auto' }} />
        <code className={`text-[10px] ${dark ? 'text-white/60' : 'text-md-text-muted'}`}>
          {label}
        </code>
      </div>
    </div>
  );
}

function LogoVariant({
  label,
  children,
  dark = false,
}: {
  label: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={
        dark
          ? 'bg-md-blue-deep flex flex-col gap-3 rounded-lg p-4'
          : 'bg-card border-md-border flex flex-col gap-3 rounded-lg border p-4'
      }
    >
      {children}
      <p className={`font-mono text-[10px] ${dark ? 'text-white/60' : 'text-md-text-muted'}`}>
        {label}
      </p>
    </div>
  );
}

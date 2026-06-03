import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wordmark } from '@/components/brand/Wordmark';
import { HeaderLogo } from '@/components/brand/HeaderLogo';
import { POLE_CODES, poleColor, poleEmoji } from '@/lib/design-tokens';

export const metadata = { title: 'Styleguide MD' };

export default async function StyleguidePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('styleguide');

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
      <header className="space-y-3">
        <HeaderLogo theme="light" size={36} />
        <h1 className="text-md-text text-3xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-md-text-muted max-w-2xl">{t('intro')}</p>
      </header>

      {/* ----------------------------------- COULEURS DE MARQUE ---------------------------------- */}
      <Section title={t('sectionColors')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Swatch hex="#294294" label="md-blue" />
          <Swatch hex="#031A56" label="md-blue-dark" />
          <Swatch hex="#E6007E" label="md-magenta" />
          <Swatch hex="#FF4DA0" label="md-magenta-soft" />
          <Swatch hex="#1FBF7A" label="md-success" />
          <Swatch hex="#F5A524" label="md-warning" />
          <Swatch hex="#E5484D" label="md-danger" />
          <Swatch hex="#F2F4FB" label="md-bg" textDark />
        </div>
      </Section>

      {/* -------------------------------------- POLES THEMATIQUES -------------------------------- */}
      <Section title={t('sectionPoles')}>
        <p className="text-md-text-muted mb-4 text-sm">Taxonomie officielle v2.1 — SPEC §3.1.</p>
        <div className="flex flex-wrap gap-2">
          {POLE_CODES.map((code) => (
            <span
              key={code}
              className="border-md-border text-md-text inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
              style={{ background: poleColor[code] }}
            >
              <span aria-hidden>{poleEmoji[code]}</span>
              <span className="font-mono text-xs">{code}</span>
            </span>
          ))}
        </div>
      </Section>

      {/* ------------------------------------ STATUTS PIPELINE ----------------------------------- */}
      <Section title={t('sectionStatus')}>
        <p className="text-md-text-muted mb-4 text-sm">
          Workflow prospect : lead → contact → devis_envoye → acompte_paye → signe (perdu à toute
          étape).
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusPill label="lead" bg="bg-slate-100" text="text-slate-700" />
          <StatusPill label="contact" bg="bg-md-blue/10" text="text-md-blue" />
          <StatusPill label="devis_envoye" bg="bg-md-warning/15" text="text-md-warning" />
          <StatusPill label="acompte_paye" bg="bg-md-blue/15" text="text-md-blue-dark" />
          <StatusPill label="signe" bg="bg-md-success/15" text="text-md-success" />
          <StatusPill label="perdu" bg="bg-md-danger/15" text="text-md-danger" />
        </div>
      </Section>

      {/* -------------------------------------- TYPOGRAPHIE -------------------------------------- */}
      <Section title={t('sectionTypography')}>
        <div className="space-y-3">
          <p className="text-md-text-muted text-xs font-semibold tracking-widest uppercase">
            Caption / label uppercase 11px
          </p>
          <p className="text-md-text text-sm">
            Body 14px — Inter — Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </p>
          <h3 className="text-md-text text-lg font-bold">Section h3 18px Montserrat</h3>
          <h2 className="text-md-text text-2xl font-bold">Page h1 26px Montserrat</h2>
          <h1 className="text-md-text text-4xl font-extrabold tracking-tight uppercase">
            Hero h1 36px / 800
          </h1>
          <Wordmark className="text-md-blue text-3xl" />
        </div>
      </Section>

      {/* ---------------------------------------- BOUTONS ---------------------------------------- */}
      <Section title={t('sectionButtons')}>
        <div className="flex flex-wrap gap-3">
          <Button>Default (magenta)</Button>
          <Button variant="secondary">Secondary (bleu MD)</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      {/* ----------------------------------- CARDS + INPUTS -------------------------------------- */}
      <Section title="Cards + Form (preview shadcn)">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Carte exemple</CardTitle>
              <CardDescription>Stand ACCESS — Salle Le Nôtre rangée A</CardDescription>
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
              <CardTitle>Inscription rapide</CardTitle>
              <CardDescription>Rendu Input + Label</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email professionnel</Label>
                <Input id="email" type="email" placeholder="contact@radiofrance.com" />
              </div>
              <Button className="w-full">Continuer</Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* --------------------------------------- LOGOS ------------------------------------------- */}
      <Section title="Logo contextuel — SPEC §3.31">
        <div className="grid gap-4 md:grid-cols-2">
          <LogoDemo label="Anonyme / admin (les deux)">
            <HeaderLogo theme="light" size={36} />
          </LogoDemo>
          <LogoDemo label="standard (MDS seul)">
            <HeaderLogo category="standard" theme="light" size={36} />
          </LogoDemo>
          <LogoDemo label="prs_exhibitor (PRS seul)">
            <HeaderLogo category="prs_exhibitor" theme="light" size={36} />
          </LogoDemo>
          <LogoDemo label="Sur fond bleu (theme=dark)" className="bg-md-blue-dark rounded-lg p-6">
            <HeaderLogo theme="dark" size={36} />
          </LogoDemo>
        </div>
      </Section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Helper components                              */
/* -------------------------------------------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-md-text-muted text-xs font-bold tracking-widest uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({
  hex,
  label,
  textDark = false,
}: {
  hex: string;
  label: string;
  textDark?: boolean;
}) {
  return (
    <div
      className="border-md-border flex h-24 flex-col justify-end rounded-lg border p-3"
      style={{ background: hex, color: textDark ? '#0E1A3C' : '#fff' }}
    >
      <span className="font-mono text-xs">{label}</span>
      <span className="font-mono text-[10px] opacity-80">{hex}</span>
    </div>
  );
}

function StatusPill({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${bg} ${text}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}

function LogoDemo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className ? '' : undefined}>
      <CardContent className={className ?? 'p-6'}>
        {children}
        <p className="text-md-text-muted mt-4 text-xs">{label}</p>
      </CardContent>
    </Card>
  );
}

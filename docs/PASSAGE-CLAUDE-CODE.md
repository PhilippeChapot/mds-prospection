# Passage de Cowork à Claude Code — pas à pas

Date : 2026-04-30
Pré-requis : SPEC v2.11 + Mockup v2.11 finalisés dans Cowork. Repo `~/Code/mds-prospection` existe avec Next.js bootstrappé.

---

## Vue d'ensemble en 6 étapes

1. **Préparer le repo** : copier SPEC + mockup + logos depuis Drive
2. **Configurer `.env.local`** avec un template (clés à remplir au fur et à mesure)
3. **Premier commit** complet
4. **Ouvrir Ghostty**, naviguer dans le repo, lancer Claude Code
5. **Donner le premier prompt** (planification de la P0)
6. **Itérer en mode `/plan-eng-review` → `/ship`**

Compte 5-10 minutes pour arriver à l'étape 5.

---

## Étape 1 — Préparer le repo (Ghostty)

Ouvre Ghostty. Tape ces commandes une par une :

```bash
cd ~/Code/mds-prospection
```

```bash
# Pull pour récupérer ce qu'on a déjà poussé
git pull
```

```bash
# Créer la structure docs/ et public/brand/
mkdir -p docs public/brand public/video
```

```bash
# Variable pour raccourcir
SRC="/Users/mbprophilippechapot/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS/COWORK"
```

```bash
# Copier le SPEC + mockup + design tokens dans docs/
cp "$SRC/MDS-Prospection-SPEC.md" docs/SPEC.md
cp "$SRC/MDS-Prospection-Mockup-v2.11.html" docs/Mockup.html
cp "$SRC/MDS-Design-Tokens.md" docs/DESIGN-TOKENS.md
cp "$SRC/MDS-Prospection-PLANNING-BUDGET.md" docs/PLANNING.md
cp "$SRC/MDS-Prospection-AUDIT-FINAL.md" docs/AUDIT.md
cp "$SRC/MDS-Prospection-FEATURES-MANQUANTES.md" docs/FEATURES-FUTURE.md
```

```bash
# Copier les 4 logos officiels dans public/brand/
cp "$SRC/_brand/"*.svg public/brand/
```

```bash
# Vérifier que tout est en place
ls docs/ public/brand/
```

Tu dois voir :
- `docs/` : SPEC.md, Mockup.html, DESIGN-TOKENS.md, PLANNING.md, AUDIT.md, FEATURES-FUTURE.md
- `public/brand/` : 4 SVG (PRS-LogoBlanc2026.svg, PRS-LogoBleu2026.svg, MDS-LogoBlanc2026.svg, MDS-LogoBleu2026.svg)

---

## Étape 2 — Créer le `.env.local` template

Tape :

```bash
cat > .env.local.example << 'EOF'
# ============================================================
# MDS Prospection — Variables d'environnement
# Copier ce fichier en .env.local et remplir au fur et à mesure
# ============================================================

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic (classification IA + assistant chat)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5

# Sentry
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# Stripe (à remplir après KYC)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Sellsy (déjà chez toi)
SELLSY_CLIENT_ID=
SELLSY_CLIENT_SECRET=
SELLSY_API_KEY=
SELLSY_WEBHOOK_SECRET=

# Brevo (déjà chez toi - 150K envois/mois)
BREVO_API_KEY=
BREVO_LIST_ID_AWAITING=
BREVO_LIST_ID_VERIFIED=
BREVO_LIST_ID_PRS_ELIGIBLE=
BREVO_LIST_ID_SIGNED=

# Connectonair (en read-only par email, à compléter quand doc dispo)
CONNECTONAIR_API_BASE_URL=
CONNECTONAIR_API_KEY=

# NeverBounce (vérification deliverability)
NEVERBOUNCE_API_KEY=
NEVERBOUNCE_SANDBOX=true

# hCaptcha (anti-spam)
HCAPTCHA_SITE_KEY=
HCAPTCHA_SECRET_KEY=

# Canva
NEXT_PUBLIC_CANVA_PLAN_URL=https://canva.link/md26plan

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=fr
NEXT_PUBLIC_SUPPORTED_LOCALES=fr,en

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

```bash
# S'assurer que .env.local est ignoré par git (sécurité)
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore
```

---

## Étape 3 — Premier commit complet

```bash
git add docs/ public/brand/ .env.local.example .gitignore
git status
```

Vérifie que tu vois bien tous les fichiers attendus, puis :

```bash
git commit -m "docs: SPEC v2.11 finale + mockup v2.11 + logos officiels + planning + audit"
git push
```

Va sur `https://github.com/PhilippeChapot/mds-prospection` dans ton navigateur — tu dois voir tous les fichiers dans le dossier `docs/` et `public/brand/`.

---

## Étape 4 — Lancer Claude Code dans Ghostty

Tape simplement dans Ghostty (depuis `~/Code/mds-prospection`) :

```bash
claude
```

Au premier lancement, Claude Code peut te demander de te connecter (browser auth). Suis les instructions.

Quand tu vois le prompt `>` de Claude Code, tu es dedans.

---

## Étape 5 — Premier prompt à coller

Copie-colle ce prompt entier dans Claude Code :

```
Lis intégralement les documents suivants pour avoir le contexte du projet MDS Prospection :

1. docs/SPEC.md (le cahier des charges complet v2.11 — fais bien attention au numéro de version, c'est la finale)
2. docs/Mockup.html (la maquette de référence avec 18 écrans desktop + 5 vues mobile)
3. docs/DESIGN-TOKENS.md (la charte couleurs/typo MD)
4. docs/PLANNING.md (le retro-planning par sprint)
5. README.md (s'il existe) et package.json pour comprendre l'état actuel du repo

Compare ce contexte avec l'état actuel du repo. Puis produis-moi un PLAN DÉTAILLÉ pour la PHASE 0 UNIQUEMENT, en français, avec :

- Liste exhaustive des fichiers à créer (chemins complets)
- Liste des dépendances npm à ajouter
- Migrations SQL Supabase à écrire (avec les noms des tables et leur ordre de création)
- Seeds initiaux (données à insérer : 6 pôles, 6 pricing_tiers, 17 addon_options, 47 PRS exhibitors, saison MDS_2026)
- Setup Sentry, Vercel Analytics, shadcn/ui avec thème MD
- Configuration next-intl (routes localisées /fr et /en)
- CI GitHub Actions (lint + typecheck + build)
- Variables d'environnement requises (référence-toi à .env.local.example)

NE GÉNÈRE PAS DE CODE pour l'instant. Je veux d'abord valider le plan. Présente-le comme une checklist numérotée que je peux cocher au fur et à mesure.

Si tu vois des ambiguïtés ou des choix à faire, signale-les en fin de plan dans une section "Questions à trancher avant exécution".
```

---

## Étape 6 — Workflow d'exécution avec Gstack

Une fois que tu as validé le plan que Claude Code te propose :

### Si tout est OK, lance le workflow Gstack

```
/plan-eng-review
```

Ça va faire passer le plan en revue technique (Claude Code joue le rôle d'un eng senior). Puis :

```
/ship
```

Ça démarre l'exécution morceau par morceau, avec validation entre chaque step.

### Si tu veux discuter ou modifier le plan

Dis simplement à Claude Code en langage naturel. Exemples :
- *"Le plan est bon mais commence par la migration SQL avant le seed"*
- *"Ajoute Tailwind v4 au lieu de v3"*
- *"Pour Sentry, on le branche seulement à la fin de la phase 0"*

Claude Code adapte le plan.

### Si tu bloques sur une décision produit

Reviens dans Cowork (cette interface). Dis-moi :
- *"Claude Code me demande X — qu'est-ce qu'on fait ?"*
- *"Le plan propose Y mais je préfère Z, mets à jour le SPEC en conséquence"*

Je mets à jour le SPEC dans Drive, tu re-copies dans `docs/SPEC.md` du repo, et tu reprends Claude Code.

---

## Workflow récurrent entre sessions

```
Cowork (planification, contenus, décisions produit)
       │
       │ tu mets à jour le SPEC
       ▼
docs/SPEC.md dans repo (synchronisé manuellement par cp)
       │
       ▼
Claude Code (exécution code)
       │
       │ commits + push
       ▼
GitHub (synchro entre tes 2 machines)
       │
       ▼
Vercel (déploiement auto sur push main)
       │
       ▼
Production accessible (https://mds-prospection.vercel.app)
```

**Règle d'or** : si tu changes une décision produit, **TOUJOURS** la mettre à jour dans le SPEC d'abord (Cowork), puis re-copier dans le repo, puis dire à Claude Code "le SPEC a été mis à jour, prends en compte la nouvelle section X.Y".

Sinon les décisions se perdent et le SPEC devient obsolète.

---

## Commandes Gstack utiles

D'après ce que tu m'as dit, tu as installé Gstack qui ajoute ces commandes :

| Commande | Quoi |
|---|---|
| `/plan-ceo-review` | Revue stratégique business |
| `/plan-eng-review` | Revue technique senior |
| `/plan-design-review` | Revue UX/design |
| `/design-consultation` | Discussion design |
| `/ship` | Exécution avec validation par étape |
| `/land-and-deploy` | Push + déploiement |
| `/canary` | Déploiement progressif |
| `/benchmark` | Comparaison avant/après |
| `/browse` | Recherche web (remplace mcp Chrome) |
| `/review` | Revue de code |
| `/qa` | Tests + qualité |
| `/qa-only` | QA sans modifications |
| `/design-review` | Revue visuelle |
| `/document-release` | Génère un changelog |
| `/codex` | Mode brainstorm code |
| `/cso` | Chief security officer |
| `/autoplan` | Plan automatique |
| `/careful` | Mode prudent (max validations) |
| `/freeze` / `/unfreeze` | Gel modifs |
| `/guard` | Garde-fous |
| `/gstack-upgrade` | Mise à jour Gstack |

Pour la P0, je te recommande l'enchaînement :
1. `/plan-eng-review` après ton premier prompt
2. `/ship` morceau par morceau
3. `/qa` à la fin de la P0
4. `/document-release` pour le changelog
5. `/land-and-deploy` pour pousser en prod

---

## Ce que tu fais sur l'iMac plus tard

Une fois le code en route, sur ton iMac :

```bash
mkdir -p ~/Code && cd ~/Code
git clone https://github.com/PhilippeChapot/mds-prospection.git
cd mds-prospection
pnpm install
cp .env.local.example .env.local
# Remplir .env.local avec les mêmes clés que sur le MacBook
claude
```

Et tu peux travailler des deux côtés via `git pull` / `git push`.

---

## Si tu veux me solliciter pendant que Claude Code bosse

Garde Cowork ouvert dans une autre fenêtre. Tu peux me dire à tout moment :
- *"Claude Code propose ça — qu'est-ce que tu en penses ?"*
- *"Donne-moi le contenu du template Brevo de bienvenue PRS"*
- *"Génère-moi les CGV B2B pour MediaDays"*
- *"Trouve-moi les SIRET de ces 5 prospects dans la base xlsx"*

Je peux opérer en parallèle — Cowork garde le contexte projet via la mémoire que j'ai sauvegardée.

---

## Récap : tu es prêt

1. ✅ Repo GitHub `mds-prospection` existe
2. ✅ Bootstrap Next.js + TS + Tailwind fait
3. ✅ Logos officiels à copier
4. ✅ SPEC v2.11 + mockup v2.11 prêts
5. ✅ Planning + budget validés (1 200-1 450€ sur 8 mois, 6-9 semaines de dev)
6. ⬜ Compte Anthropic (à créer + 50€ de crédit)
7. ⬜ Compte Supabase (à créer en région EU)
8. ⬜ Compte Sentry (à créer)
9. ⬜ KYC Stripe (à lancer maintenant pour gagner 1-2 sem)
10. ⬜ Activer sync banque Sellsy via Powens (parallèle)

Les points 6-10 peuvent se faire EN PARALLÈLE de Claude Code qui bosse sur le code. Ne bloque pas tout le code en attendant les comptes — Claude Code peut écrire les migrations Supabase sans avoir le compte (juste le schéma SQL).

**Va !**

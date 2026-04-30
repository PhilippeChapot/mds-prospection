# MDS Prospection — Design Tokens

À déposer dans le repo Gstack (`/styles/tokens.css` ou `/lib/design-tokens.ts`). Source : pitch deck "MediaDays Solutions 2026" + doc "Tarifs Visibilité" (avril 2026).

## Couleurs

> **Source de vérité** : les couleurs officielles `#294294` (bleu) et `#E6007E` (magenta) sont **directement extraites des SVG officiels** des logos MD et PRS 2026 (déposés dans `public/brand/`). Tout écart avec d'autres docs (mockup v1, etc.) doit s'aligner sur ces valeurs.

| Token | Hex | Usage |
|---|---|---|
| `--md-blue` | `#294294` | **Bleu officiel MD** (extrait des SVG) — fond, header |
| `--md-blue-bright` | `#0B3FA8` | Variante claire pour gradients |
| `--md-blue-dark` | `#031A56` | Gradients, contraste profond |
| `--md-blue-deep` | `#00124A` | Accent ultra sombre |
| `--md-magenta` | `#E6007E` | **Magenta officiel MD** (extrait des SVG) — accent signature, CTA principal |
| `--md-magenta-soft` | `#FF4DA0` | Hover sur CTA magenta |
| `--md-white` | `#FFFFFF` | Texte sur fond bleu, surfaces |
| `--md-bg` | `#F2F4FB` | Fond app (gris bleuté) |
| `--md-text` | `#0E1A3C` | Texte principal sur fond clair |
| `--md-text-muted` | `#5C6A8A` | Texte secondaire |
| `--md-border` | `#DCE2F0` | Bordures cartes / inputs |
| `--md-success` | `#1FBF7A` | Statut "signé" |
| `--md-warning` | `#F5A524` | Statut "devis" |
| `--md-danger` | `#E5484D` | Statut "perdu" |

## Typographie

- **Titres** : Montserrat (700/800), uppercase, letter-spacing -0.01em à -0.02em
- **Texte** : Inter (400/500/600)
- **Tailles** :
  - Hero h1 : 36px (mobile 26px) / 800
  - Page h1 : 26px / 700
  - Section h2 : 18px / 700
  - Body : 14px / 400
  - Caption / label uppercase : 11–12px / 600–700, letter-spacing 0.06–0.18em

## Wordmark "mediadays"

Recréation HTML/CSS (en attendant le SVG officiel) :
```html
<span class="wordmark">mediada<span class="y">y</span>s</span>
```
Le `y` est en `var(--md-magenta)` et translaté de `-3px` vers le haut, en italique. C'est l'élément de signature à conserver partout.

## Composants

- **Boutons primaires** : magenta plein, blanc, radius 8px, padding 10/18
- **Boutons secondaires** : `--md-blue-dark` plein
- **Boutons ghost** : transparent, bordure `--md-border`
- **Cartes** : blanc, bordure 1px `--md-border`, radius 12px, shadow `0 1px 3px rgba(11,63,168,0.08)`
- **Pills statut** : pastille colorée + fond pâle assorti, radius 999px
- **KPI cards** : barre verticale de 4px à gauche dans la couleur de la métrique

## Hero / fond bleu

Pour reproduire l'ambiance "scène MD" du deck :
```css
background:
  linear-gradient(135deg, rgba(3,26,86,0.92) 0%, rgba(11,63,168,0.85) 100%),
  radial-gradient(circle at 20% 80%, rgba(230,33,125,0.4), transparent 50%);
background-color: var(--md-blue-dark);
```

## Logos sources

À récupérer manuellement (Drive a refusé le streaming pendant la session) :
- `MEDIADAYS/MD 2026/PARIS/LOGO 2026/LOGO_MEDIADAYS.svg`
- `MEDIADAYS/MD 2026/PARIS/LOGO 2026/LOGO_MEDIADAYS_long.svg`
- `MEDIADAYS/MD 2026/PARIS/LOGO 2026/Arc_PRS.svg`

Action : copier ces 3 fichiers dans `public/brand/` du repo Gstack.

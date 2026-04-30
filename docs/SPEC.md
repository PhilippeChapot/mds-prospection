# MDS Prospection — Cahier des charges

**Version** : 2.11 — 2026-04-30
**Repo** : https://github.com/PhilippeChapot/mds-prospection
**Source de vérité** : ce document. Toute évolution se fait ici, puis est répliquée dans `docs/SPEC.md` du repo.

> Changelog v2.11 : **page d'accueil publique + société facturatrice + logo contextuel** — ajout d'une page d'accueil publique style mediadays.net (vidéo full-screen + 2 logos PRS+MDS + CTAs). La société facturatrice **Editions HF** est officialisée et apparaît dans toutes les mentions légales et documents Sellsy. Logo contextuel : une fois identifié, l'utilisateur voit uniquement le logo de SA catégorie (PRS exposants → logo PRS seul ; MDS standard → logo MDS seul ; non identifié → les deux logos).
> Changelog v2.10 : **virement SEPA par défaut + sync banque Sellsy** — le devis simple avec paiement par virement SEPA devient le parcours **mis en avant** (cohérent avec les habitudes B2B France). Sellsy détecte automatiquement les virements reçus via sa sync bancaire (Powens/Budget Insight) et émet le webhook `invoice.paid` que l'app écoute déjà. Stripe devient l'option "rapide" pour ceux qui veulent confirmer immédiatement. Budget Stripe drastiquement réduit. Brevo et Sellsy déjà couverts par les abonnements existants de Phil → coûts mensuels prod tombent de 130€ à ~80€.
> Changelog v2.9 : **passe finale avant push Claude Code** — ajout de 7 fonctionnalités issues de l'audit final : webhooks inverse Sellsy (synchro bidirectionnelle), notifications partenaire lifecycle (J-30, J-7, J-1), reporting analytique dédié, vérification deliverability email, récap PDF complet à la signature, mass email campaigns depuis l'admin, et vues mobile dédiées dans le mockup. SPEC considéré complet et prêt pour exécution P0.
> Changelog v2.8 : **MCP Server read-only** — l'app expose un serveur MCP (Model Context Protocol) en lecture seule pour que Cowork (et tout autre client MCP comme Claude Code) puisse interroger la base de données et consulter les ressources de l'app en temps réel. Phil obtient ainsi un point de pilotage unifié dans Cowork qui croise Drive, Gmail, Calendar et la base MDS Prospection. Auth par tokens personnels révocables.
> Changelog v2.7 : **Assistant IA conversationnel** — chat intégré dans l'admin et l'Espace Partenaire, propulsé par Anthropic Claude Haiku 4.5 (par défaut) avec escalation Sonnet pour tâches complexes (propositions commerciales, analyses de pipeline). L'assistant a accès à la DB via tool use (recherche prospects, création rappels, draft propositions, rappels échus, FAQ exposants). Tables `chat_conversations`, `chat_messages`, `reminders`. Logos officiels finaux 2026 (chargés depuis `_brand/`).
> Changelog v2.6 : **création de devis depuis le back-office (mode concierge)** — Phil et la commerciale peuvent émettre un devis Sellsy en direct pendant un rendez-vous ou un call client, avec envoi email automatique du devis (et Stripe Payment Link optionnel pour encaissement à distance). **Wording public partenaire confirmé**, internal admin reste "exposant" pour cohérence métier.
> Changelog v2.5 : intégration des 8 must-have issus de la revue multi-perspectives — **multi-saison/édition**, **audit log admin**, **notifications admin** sur événements clés, **RTBF + portabilité RGPD** opérationnels, **vérification VAT VIES + autoliquidation TVA** intracommunautaire, **CGV** comme page éditable, **idempotence webhook Stripe + verrou optimiste sur emplacements**, **mode test/sandbox**, **critères transverses** (WCAG AA, Sentry+Vercel Analytics dès P1, feature flags).
> Changelog v2.4 : **système d'affiliation/sourcing** (apporteurs d'affaires avec liens dédiés + QR codes + commission % + matching fuzzy 2 lettres près + dashboard affilié dans l'Espace Exposant si l'apporteur est lui-même exposant), **profil exposant complet** (logo, description, LinkedIn, réseaux sociaux, contacts) éditable depuis l'Espace Exposant et l'admin.
> Changelog v2.3 : **espace exposant** (backoffice client signé), **paiement intégral immédiat**, **réglages admin** (préférences modifiables : acompte, RGPD…), Connectonair en **lecture seule** (enrichissement par email), **synchronisation produits Sellsy ↔ plateforme**, pages **mentions légales + politique de confidentialité**.
> Changelog v2.2 : internationalisation FR / EN — site public bilingue, emails Brevo bilingues, contenus localisés en base, détection automatique de langue.
> Changelog v2.1 : intégration des **vraies données** depuis les sources officielles — pôles (taxonomie v2.1), tarifs ACCESS/CLASSIC/PREMIUM, options additionnelles parsées depuis les DDP, plan Canva embeddé, auto-complete société.
> Changelog v2.0 : pôles thématiques, double tarification, classification IA, double opt-in, validation email pro.

---

## 1. Vue d'ensemble produit

Application web responsive pour la gestion de la prospection commerciale **MediaDays Solutions 2026** (Paris, Marseille, Bruxelles).

**Pour qui** : Philippe Chapot (admin) et la commerciale en charge des MDS.

**Pour quoi** :
1. Centraliser le pipeline de prospects exposants/partenaires (pas les visiteurs).
2. Offrir un parcours d'inscription public **qualifié** (B2B strict, double opt-in, classification IA, validation email pro).
3. Servir d'interface de pilotage rapide (mobile-first).
4. Synchroniser automatiquement les données vers **Sellsy**, **Brevo** et **Connectonair**.
5. **Différencier** automatiquement les exposants Paris Radio Show 2026 (tarif préférentiel jusqu'à -84%) des autres (tarif MDS standard).
6. **Classifier** automatiquement chaque société dans l'un des 6 pôles thématiques officiels.

---

## 2. Stack technique

| Couche | Choix | Raison |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | UI + API sur le même domaine |
| Style | Tailwind + shadcn/ui | Design tokens MD portables |
| Base de données | Supabase (PostgreSQL) | Auth, RLS, REST + Realtime |
| Auth | Supabase Auth | Email/password + magic link |
| Emailing | Brevo via API | Déjà utilisé par Phil |
| CRM | Sellsy via API | Source de vérité commerciale |
| CMS exposants | Connectonair API (à doc) | Source de vérité salon |
| **IA classification** | Anthropic Claude API | Catégorisation auto en pôles |
| **Plan d'implantation** | iframe Canva embed | Visualisation des espaces dispo |
| **i18n** | `next-intl` | Bilingue FR / EN sur le site public |
| **Monitoring** | Sentry + Vercel Analytics | Suivi erreurs + performance dès la P1 |
| **VAT validation** | API VIES (gratuite, UE) | Vérification numéros TVA intracommunautaires |
| **QR code** | `qrcode` (npm) | Génération côté serveur pour affiliés |
| Hébergement | Vercel | Déploiement git-push |
| Package manager | pnpm | Plus rapide |

---

## 3. Concepts métier

### 3.1 Pôles thématiques (taxonomie officielle v2.1)

Source : `COWORK/MDS2026-Reference-Maitre.xlsx` — onglet "Taxonomie officielle".

| Code | Nom complet | Couleur | Salle(s) | Cibles |
|---|---|---|---|---|
| `REGIES_RETAIL_MEDIA` | 🏛️ RÉGIES & RETAIL MEDIA | `#FFCDD2` | Delorme + Gabriel | 73 exposants — régies, éditeurs, retailers, agences créa, annonceurs, UDECAM |
| `AUDIO_RADIO` | 🎙️ AUDIO & RADIO | `#F8BBD0` | Le Nôtre rangées A-B-C + scène PRS | 148 exposants — solutions audio pour radios, plateformes, régies audio. Cœur du Paris Radio Show |
| `DIFFUSION_INFRA` | 📡 DIFFUSION & INFRA ⭐ | `#E1BEE7` | Le Nôtre rangées D-E | 61 exposants — cloud, distribution, transport contenu, opérateurs FM/DAB+ |
| `VIDEO_CTV` | 🎥 VIDÉO & CTV | `#BBDEFB` | Le Nôtre rangées F-G-H + scène MDS | 88 exposants — distribution, monétisation, analytics vidéo, production vidéo pro |
| `OUTDOOR_DOOH` | 📢 OUTDOOR & DOOH | `#FFE0B2` | Le Nôtre colonne droite + Foyer (overflow) | 33 exposants — tech DOOH, programmatique outdoor, affichage |
| `DATA_ADTECH` | 📊 DATA & ADTECH 🔥 | `#C8E6C9` | Delorme + Le Nôtre + Foyer (overflow) | 81 exposants — adtech, data, mesure, IA marketing, retail media tech. Cœur business MDS |
| `INCONNU` | Non classé | `#E5E7EB` | — | Société dont le pôle n'a pu être identifié → pas d'accès aux tarifs |

### 3.2 Salles du Carrousel du Louvre (Paris)

Source : `COWORK/MDS2026-Reference-Maitre.xlsx` — onglet "Plan des salles".

| Salle | Surface | Vocation | Pôle(s) | Capacité |
|---|---|---|---|---|
| **Salle Delorme** | 1 600 m² | MediaDays — offre média | 🏛️ RÉGIES + 📊 DATA | ~60 stands |
| **Salle Gabriel** | 750 m² | Conférences SAGAS + extension Delorme | 🏛️ RÉGIES (extension) | ~14 stands |
| **Salle Le Nôtre** | 1 900 m² | Paris Radio Show + MediaDays Solutions | 🎙️ AUDIO + 📡 DIFFUSION + 🎥 VIDÉO + 📢 OUTDOOR + 📊 DATA | ~69 stands (dont 15 à 6m²) |
| **Foyer** | 1 200 m² | Overflow + studio SoMedia | 📢 OUTDOOR + 📊 DATA (overflow) + studio SoMedia 56m² | ~41 stands 9m² |
| Mezzanine | 600 m² | Réserve (non allouée 2026) | — | ~20 stands |
| Salle Soufflot | 925 m² | Restaurant VIP / Casino-dîner | — | ~30 stands |

### 3.3 Catégorie tarifaire

Chaque société a une catégorie tarifaire dérivée :

| Catégorie | Condition | Effet |
|---|---|---|
| `prs_exhibitor` | Société dans la liste des exposants Paris Radio Show 2026 | **Tarifs préférentiels PRS** + options DDP-PRS |
| `standard` | Société classée dans un pôle MDS, hors PRS | **Tarifs MDS standards** + options DDP-MDS |
| `non_eligible` | Société non classifiable (pôle = `INCONNU`) | Pas de tarifs visibles, formulaire de prise de contact uniquement |

### 3.4 Tarifs des packs principaux (extraits des DDP)

Source : `MD 2026/DEMANDE DE PARTICIPATION/DDP-MDS26-FR-B-PART.pdf` et `DDP-MDPRS26-27-FR-B-PART.pdf`.

| Pack | Tarif MDS standard | Tarif exposant PRS | Description |
|---|---:|---:|---|
| `ACCESS` | **12 500 €** HT | **1 980 €** HT | Stand de base, espace privatif |
| `CLASSIC` | **14 800 €** HT | **2 475 €** HT | Stand + 5 places déjeuner Paris (ou 2 PRS) |
| `PREMIUM` | **20 500 €** HT | **8 700 €** HT | Stand + temps de parole + workshop/masterclass |

Suppléments d'extension :
- **Stand 2×2m supplémentaire** : +800 €
- **Impression personnalisée** : +3 000 €
- **Place déjeuner supplémentaire Paris** : +100 €/place
- **Temps de parole** : +3 500 € (ACCESS et CLASSIC)
- **Workshop / Masterclass** : +2 500 € MDS / +1 000 € PRS (CLASSIC et PREMIUM)
- **Extension Marseille** : MDS +4 500 € à +5 000 € selon pack ; PRS +1 450 € à +2 450 €

### 3.5 Options supplémentaires

Source : sections "Options supplémentaires" des deux DDP.

> Le scope (`prs` / `mds` / `both`) indique dans quel(s) DDP l'option apparaît.

| Catégorie | Option | Prix HT | Scope |
|---|---|---:|---|
| **Logistique stand** | Branchement électrique +6 kW intermittent | 900 € | both |
| | Accueil marque co-exposante | 600 € / marque | both |
| **Audiovisuel** | Écran sur pied 43" — 1 jour | 500 € | both |
| | Écran sur pied 55" — 1 jour | 600 € | both |
| **Connectivité** | WiFi Expert (1 accès, 8 Mbps, 5 GHz) | 200 € | both |
| | Accès internet filaire 2 Mbps | 600 € | both |
| | Accès internet filaire 6 Mbps | 900 € | both |
| | **Sponsor WiFi** (visibilité globale) | 5 000 € | both |
| **Espaces & événements** | Salle privatisable 1h (exclusif) | 2 000 € | both |
| | 4 kakémonos + nom sur plan + annonces | 2 500 € | both |
| **Visibilité partenaire** | Logo partenaire **Gold** | 3 000 € | both |
| | Logo partenaire **Silver** | 1 700 € | both |
| | Participant VIP fournisseur | 500 € | both |
| **Communication** | Emailing dédié (base ConnectOnAir 20 000 contacts) | 500 € | both |
| | Publirédactionnel LaLettre.pro + MAG Hebdo | 400 € | prs |
| **Goodies & impressions** | Tours de cou personnalisés (1 000 ex.) | 2 000 € | both |
| | Panneau autoporté 1 m × 2 m | 500 € | both |
| | Panneau autoporté 2 m × 2 m | 1 000 € | both |

### 3.6 Validation des emails professionnels

Refus stricts :
- Domaines grand public (gmail.com, yahoo.*, hotmail.*, outlook.*, live.*, free.fr, orange.fr, sfr.fr, wanadoo.fr, laposte.net, icloud.com, etc.) — utiliser le package npm [`free-email-domains`](https://www.npmjs.com/package/free-email-domains).
- Domaines jetables — package [`disposable-email-domains`](https://www.npmjs.com/package/disposable-email-domains).

Si l'utilisateur saisit un email perso : *"Cet événement est strictement B2B. Merci d'utiliser votre adresse email professionnelle."*

Si la société est déjà connue en base et que `email_domain` ne match pas `companies.primary_domain` (ni `alternate_domains`) : *"Pour vous rattacher à [Nom Société], merci d'utiliser une adresse email du domaine @[domaine.officiel]."*

### 3.7 Auto-complétion société

Sur les champs "Société" des **deux** étapes du formulaire (et côté admin), un composant Combobox shadcn/ui propose des suggestions dès **2 caractères saisis**.

- API : `GET /api/companies/search?q=ab&limit=10`
- Recherche : Postgres ILIKE + extension `pg_trgm` (similarity score) sur `companies.name` ; tri par pertinence.
- Debounce : 200 ms côté client.
- Affichage : nom + pôle (badge couleur) + indicateur "exposant PRS" si applicable.
- Si l'utilisateur clique une suggestion : on préremplit l'ID interne (`matched_company_id`) ; sinon, l'app traite comme nouvelle société à classifier.

### 3.8 Plan Canva intégré

Lien public : `https://canva.link/md26plan`

**Affichage côté admin** (`/booths/plan`) : iframe pleine largeur :

```html
<iframe
  src="https://canva.link/md26plan?embed"
  loading="lazy"
  allowfullscreen
  style="width:100%; aspect-ratio:16/9; border:0;">
</iframe>
```

> Si le shortlink Canva ne supporte pas `?embed` directement, faire une résolution serveur (`fetch()` qui suit la redirection 301 vers l'URL `canva.com/design/...`) et stocker l'URL longue dans la table `app_settings`. À tester en P3.

**Affichage côté formulaire public (étape 2)** : un onglet/modal "Voir le plan" qui ouvre l'iframe en grand. Les emplacements disponibles dans le pôle de la société sont par ailleurs listés textuellement (depuis `booth_inventory`) pour permettre la sélection sans avoir à interpréter le visuel.

### 3.9 Internationalisation (FR / EN)

L'événement attire des sociétés internationales (le fichier prospection identifie déjà 853 sociétés avec un champ `Langue d'échange` = FR ou EN). Toute la **partie publique** doit donc être bilingue.

**Périmètre bilingue obligatoire** :
- Pages publiques : `/inscription-exposant` (étape 1), `/inscription-exposant/[token]` (étape 2A et 2B), `/inscription-exposant/merci`.
- Tous les messages d'erreur et de validation côté formulaire.
- Emails Brevo : DOI, bienvenue Cas A (avec tarifs), bienvenue Cas B (prise de contact), notification post-signature.
- Contenus stockés en base qui apparaissent sur les pages publiques : noms et descriptions des **pôles**, libellés des **packs** et **options additionnelles**, libellés des **emplacements** (`booth_inventory.label`).

**Périmètre français uniquement (MVP)** :
- L'interface admin (Phil + commerciale travaillent en FR). Internationalisable plus tard si besoin.

**Détection et persistance de la langue** :
1. À l'arrivée sur le site public : détection via `Accept-Language` du navigateur.
2. Routes localisées avec préfixe : `/fr/inscription-exposant` et `/en/inscription-exposant`. Racine `/` redirige vers `/fr/` par défaut.
3. Toggle FR / EN visible dans le header public à tout moment.
4. La langue choisie est persistée dans `public_signup_attempts.language` puis répliquée dans `contacts.language` (champ déjà prévu).
5. Les emails Brevo sont envoyés dans la langue persistée du contact.

**Stack i18n** :
- Bibliothèque : `next-intl` (standard Next.js App Router).
- Fichiers de traduction : `messages/fr.json` et `messages/en.json` à la racine du projet.
- Contenus dynamiques (DB) : colonnes bilingues `_fr` / `_en` (voir 4.1).
- Clés de traduction structurées par feature : `signup.step1.email_label`, `signup.errors.free_provider`, `email.doi.subject`, etc.

**Côté classification IA** : le prompt de classification fonctionne en français (les pôles sont des codes neutres), mais l'IA accepte des noms de société et descriptions dans n'importe quelle langue.

### 3.10 Modes de paiement et sortie commerciale

Au moment de la soumission du formulaire détaillé (étape 2A), l'utilisateur choisit **un des quatre parcours** suivants. **Recommandation UX : mettre en avant le parcours `devis_sepa` comme option par défaut** (cohérent avec les habitudes B2B France où le virement bancaire est la norme), les autres options sont présentées comme "alternatives rapides".

| Parcours | Code | Description | Effet immédiat |
|---|---|---|---|
| **🌟 Devis avec virement SEPA** *(par défaut)* | `devis_sepa` | Reçoit un devis Sellsy avec RIB MediaDays en pied de page + référence client. Règle par virement bancaire à son rythme (généralement 7-15 jours). **Sellsy détecte automatiquement** le virement reçu via sa sync banque (Powens) et marque le devis comme payé. | `prospect.status = 'devis_envoye'` ; émission devis Sellsy avec RIB ; envoi par email |
| **💳 Devis + acompte immédiat carte/SEPA** | `devis_acompte_stripe` | Reçoit le devis + paye l'acompte tout de suite via Stripe (CB ou SEPA Direct Debit). Pour ceux qui veulent confirmer leur stand immédiatement. | Idem ci-dessus + redirection Stripe Checkout. Webhook : `acompte_status = 'paid'`, `prospect.status = 'acompte_paye'`. |
| **📑 Facture pro-forma + acompte** | `proforma_acompte` | Reçoit une facture pro-forma + paye l'acompte tout de suite. Pratique pour les sociétés étrangères (UE non-FR) ou B2G qui ont besoin d'une pro-forma comptable. | Émission pro-forma Sellsy + Stripe Checkout. Au succès : `acompte_paye`. Facture définitive émise plus tard. |
| **⚡ Paiement intégral immédiat** | `facture_integrale` | Paye 100% du montant tout de suite via Stripe. Reçoit la facture définitive Sellsy. Statut passe directement à `signe`. | Stripe Checkout 100% du total. Au succès : émission facture finale Sellsy, `prospect.status = 'signe'`, accès Espace Partenaire ouvert. |

**Distribution attendue (estimation B2B France)** :
- ~70-80 % via `devis_sepa` (virement classique, gratuit)
- ~10-15 % via `devis_acompte_stripe` (CB) pour ceux qui veulent bloquer leur stand le jour même
- ~5 % via `proforma_acompte` (clients UE étrangers ou B2G)
- ~5 % via `facture_integrale` (clients pressés ou petits montants)

**Détail technique du flux SEPA virement classique** :

1. Le devis Sellsy émis inclut le RIB MediaDays (configuré dans Sellsy) et la référence du devis (utilisée par le client comme libellé du virement).
2. Le client effectue le virement depuis sa banque (peut prendre 1-3 jours ouvrés selon banques).
3. La synchro bancaire Sellsy (à activer dans le compte Sellsy de Phil — connexion Powens à la banque MediaDays) détecte le virement entrant.
4. Sellsy fait le **rapprochement automatique** entre le virement et le devis grâce au libellé/montant.
5. Sellsy émet un webhook `invoice.paid` (ou `quote.accepted` selon le statut) → l'app reçoit la notification (cf. 3.24).
6. Le `prospect.status` bascule automatiquement à `signe` (ou `acompte_paye` si paiement partiel) → email de confirmation au partenaire + accès Espace Partenaire activé.

**Configuration Sellsy requise** (côté Phil, à faire avant le sprint 4) :
- Activer la **sync bancaire Sellsy** sur le compte MediaDays (paramètres Sellsy → Banque → Connecter via Powens)
- Vérifier que le RIB MediaDays apparaît bien sur les modèles PDF de devis
- Configurer le rapprochement automatique avec règles de matching libellé/montant

**Montant de l'acompte** :
- Configurable via `app_settings.deposit_percentage` (par défaut **30 %** du total HT, à valider avec Phil).
- Calculé automatiquement : `acompte_amount_eur = (estimated_amount × deposit_percentage / 100)`.
- Affiché clairement à l'utilisateur avant la redirection Stripe.

**Statuts du prospect — workflow étendu** :

```
lead → contact → devis_envoye → (acompte_paye) → signe → perdu
                                       ↑                    ↑
                          (uniquement si acompte payé)  (perdu à toute étape)
```

- `devis_envoye` : devis ou pro-forma émis (parcours 1, 2 ou 3).
- `acompte_paye` : acompte effectivement encaissé via Stripe (uniquement parcours 2 ou 3).
- `signe` : facture définitive payée intégralement, exposant confirmé. Déclenche le push Connectonair.

**Architecture facturation / paiement — séparation des rôles** :

> **Sellsy = source de vérité comptable et facturation**. Tous les documents financiers (devis, factures pro-forma, factures définitives) sont émis et stockés dans **Sellsy**. C'est aussi Sellsy qui détient l'historique client, les numéros de pièces et la TVA.
>
> **Stripe = simple moyen d'encaissement**. Stripe ne fait que collecter l'argent (carte / SEPA). Aucune facture n'est émise par Stripe. Une fois l'acompte encaissé, on notifie Sellsy pour qu'il enregistre le paiement contre le devis ou la pro-forma correspondante.

Schéma de bout en bout :

```
[Soumission étape 2A]
        │
        ▼
[POST /api/signup/finalize]
        │
        ├──► Créer prospect en DB Supabase
        │
        ├──► Créer devis ou pro-forma dans Sellsy
        │      (POST /opportunities/{id}/quotes  OU  POST /invoices avec status=proforma)
        │      Récupère sellsy_devis_id ou sellsy_proforma_id
        │
        ├──► Si parcours = devis_differe :
        │      ► Sellsy envoie le devis par email au prospect
        │      ► Réponse à l'utilisateur : "Devis envoyé à {email}"
        │      ► Statut prospect = devis_envoye, fin du parcours web
        │
        └──► Si parcours = devis_acompte ou proforma_acompte :
               ► Créer Stripe Checkout Session (montant = acompte)
                 metadata: { prospect_id, sellsy_devis_id ou sellsy_proforma_id }
               ► Redirection vers Stripe Checkout
                          │
                          ▼
                   [Utilisateur paye sur Stripe]
                          │
                          ▼
               [Webhook Stripe : checkout.session.completed]
                  POST /api/webhooks/stripe
                          │
                          ├──► Vérifier signature Stripe
                          │
                          ├──► acompte_status = 'paid'
                          │    prospect.status = 'acompte_paye'
                          │
                          ├──► Notifier Sellsy : enregistrer le paiement
                          │      contre le devis ou la pro-forma
                          │      (POST /payments avec ref Sellsy)
                          │
                          ├──► Sellsy envoie le devis/pro-forma marqué payé
                          │
                          └──► Email confirmation à l'utilisateur (Brevo)

[Plus tard, à la signature finale (admin marque prospect.status = signe)]
        │
        ├──► Sellsy : émettre la facture définitive du solde
        ├──► Connectonair : push de l'exposant
        └──► Brevo : reclassement dans liste "Signés"
```

**Stack paiement** :
- **Stripe Checkout** (page hébergée — pas de complexité PCI côté nous) avec moyens de paiement : carte + SEPA Direct Debit (idéal B2B en France).
- **Webhook Stripe** `/api/webhooks/stripe` qui écoute `checkout.session.completed` et met à jour `acompte_status` + `prospect.status` + notifie Sellsy.
- Mode "test" et mode "live" séparés via env vars.
- **Idempotence webhook obligatoire** : à chaque réception, on insère `event.id` dans la table `stripe_events_processed` (PK unique). Si déjà présent → on retourne 200 sans rejouer l'action. Cela protège contre les retries Stripe en cas de timeout côté nous.

**Verrou optimiste sur emplacement** :
- Quand un prospect sélectionne un emplacement à l'étape 2A, on passe `booth_inventory.status = 'option'` et `option_expires_at = now() + 30 minutes`.
- Pendant ces 30 minutes, l'emplacement est invisible pour les autres visiteurs.
- Si le prospect ne finalise pas (paiement non abouti, abandon), un cron repasse l'emplacement en `available` à expiration.
- Si le paiement aboutit ou si le devis est généré (`devis_envoye`) avant expiration, l'emplacement passe en `reserved` sans expiration.
- À la signature finale (`signe`), l'emplacement passe en `signed`.

**Documents Sellsy émis selon parcours** :

| Parcours | Document Sellsy initial | Document à la signature finale |
|---|---|---|
| `devis_sepa` *(par défaut)* | Devis avec RIB MediaDays | Facture (émise auto à réception virement via sync banque Sellsy) |
| `devis_acompte_stripe` | Devis | Facture finale (solde après acompte Stripe encaissé) |
| `proforma_acompte` | Facture pro-forma | Facture définitive (montant total, acompte déjà encaissé) |
| `facture_integrale` | Facture définitive (immédiate) | — (déjà émise) |

**UX du choix** (4 parcours, devis SEPA par défaut) :

À la fin du formulaire détaillé (étape 2A), un bloc affiche le total et les 4 options. **Le `devis_sepa` est pré-sélectionné** et visuellement distingué (fond magenta clair + badge "🌟 Recommandé"). Les 3 autres options sont présentées comme alternatives :

```
┌───────────────────────────────────────────┐
│  Total à payer : 14 800 € HT              │
│  Acompte (30%) : 4 440 € HT               │
└───────────────────────────────────────────┘

  ● Devis avec virement SEPA  🌟 RECOMMANDÉ
     Devis avec RIB pour règlement par virement bancaire
     Le plus simple — comme avec vos autres fournisseurs
     ✓ Aucun frais bancaire   ✓ 0% de commission

  ─── ou alternatives rapides ───

  ⚪ Devis + acompte immédiat (carte/SEPA)
     Confirmation immédiate de votre stand

  ⚪ Facture pro-forma + acompte
     Pour comptabilité internationale / B2G

  ⚪ Paiement intégral + facture
     Réservation directement validée
```

L'argument "aucun frais bancaire" + "le plus simple — comme avec vos autres fournisseurs" pousse naturellement le client B2B vers le SEPA, qui est aussi avantageux pour MediaDays (pas de frais Stripe).

### 3.11 Espace Exposant (backoffice client)

À partir du moment où un prospect a payé (acompte ou intégral), il bascule en **Exposant** et accède à un **Espace Exposant** privé.

**Authentification Espace Exposant** :
- Pas d'inscription auto avec mot de passe — on utilise des **magic links** (Brevo) envoyés à `contacts.email`.
- Token Supabase Auth de type `email_otp` ou lien magique single-use.
- Session 30 jours.
- Rattachement : un contact peut accéder à toutes les **opportunities** (devis/factures) de sa `company`.

**Routes** :

| Route | Description |
|---|---|
| `/{locale}/espace-exposant/connexion` | Saisie email → reçoit un magic link Brevo |
| `/{locale}/espace-exposant` | Tableau de bord exposant (résumé de la commande, état acompte/facture, accès aux ressources) |
| `/{locale}/espace-exposant/commande` | Détail de ce qui a été réservé : pack, emplacement, options, total, factures Sellsy téléchargeables |
| `/{locale}/espace-exposant/ressources` | Guide exposant, infos pratiques (horaires, accès, badges, plan), documents techniques |
| `/{locale}/espace-exposant/options-supplementaires` | Catalogue des options additionnelles encore commandables (réservé aux exposants signés) — déclenche un nouveau devis Sellsy |
| `/{locale}/espace-exposant/contact` | Formulaire de contact direct avec l'équipe MDS (Phil + commerciale) |

**Contenu pour MVP** :
- **Récap commande** : société, contacts, pack, salons sélectionnés, emplacement (avec code et statut), options additionnelles, montant total, statut paiement (acompte payé X, solde dû Y, ou intégral payé), liens téléchargement PDF Sellsy (devis, facture, factures pro-forma) — tous récupérés via API Sellsy à la volée.
- **Guide exposant** : page Markdown statique éditable depuis l'admin (`/admin/exhibitor-resources`), bilingue.
- **Infos pratiques** : horaires, accès Carrousel du Louvre, plan, contacts logistiques — page Markdown statique bilingue.
- **Options supplémentaires** : liste des `addon_options` encore active. L'exposant clique → confirmation → on émet un nouveau devis Sellsy attaché à la même opportunity.
- **Espace de fichiers** : contrats, attestations, badges téléchargeables (à fournir manuellement par admin pour MVP — V2 : auto-génération).

**Branding** : la même charte MD (bleu royal + magenta) avec en plus le badge "EXPOSANT 2026" pour rappel d'identité.

**Données** : tout est lu en quasi-temps réel depuis Supabase + Sellsy. Pas de duplication.

### 3.12 Réglages admin (préférences modifiables)

Page admin `/admin/preferences` permettant à Phil d'ajuster les paramètres opérationnels sans intervention dev.

Stockés dans la table `app_settings` (key/value JSONB), groupés par catégorie :

**Finances** :
- `deposit_percentage` — % de l'acompte (par défaut **30**)
- `vat_rate_percent` — taux TVA appliqué (par défaut **20**, France)
- `default_currency` — par défaut **EUR**

**RGPD / contenus légaux** :
- `legal_mentions_fr` / `legal_mentions_en` — texte des mentions légales (Markdown)
- `privacy_policy_fr` / `privacy_policy_en` — politique de confidentialité (Markdown)
- `cookies_consent_text_fr` / `cookies_consent_text_en` — bandeau cookies
- `data_retention_days` — durée de conservation des `public_signup_attempts` non convertis (par défaut **365**)

**Intégrations** :
- `canva_plan_url` — URL résolue du plan Canva
- `free_email_blocklist_extra` — domaines additionnels à bloquer (au-delà du package npm)
- `sellsy_pipeline_id` — pipeline Sellsy cible
- `sellsy_pole_tag_map` — `{ 'AUDIO_RADIO': 'tag_id', ... }` mapping pôle → tag Sellsy

**Email & communication** :
- `notification_email_admin` — destinataire des notifications internes (nouveau signup, etc.)
- `signup_token_ttl_hours` — TTL du token de double opt-in (par défaut **48**)

**General** :
- `salon_dates` — `{ paris: '2026-12-15', marseille: '2026-12-10', bruxelles: '2026-11-26' }`
- `salon_addresses` — adresses postales et lien Google Maps de chaque salon
- `early_bird_deadline` — date limite tarif preferencé (si applicable)

L'UI admin présente ces réglages sous forme d'onglets par catégorie, avec validation, sauvegarde inline, et historique des modifications (`updated_by_user_id`, `updated_at`).

### 3.13 Système d'affiliation / sourcing (apporteurs d'affaires)

**Objectif** : tracer qui a apporté quel prospect et calculer un pourcentage d'apport d'affaires (commission), sans faire de remise au client final.

> ⚠️ **Important** : ce n'est **pas** un système de remise pour le client. Le tarif affiché reste identique. C'est un mécanisme **interne** pour rémunérer les apporteurs d'affaires.

#### 3.13.1 Champ public sur le formulaire

À l'étape 1 du formulaire d'inscription, un champ optionnel :

> *"Venez-vous de la part de quelqu'un ?"* (placeholder : *"Nom de la personne ou de la société qui vous a recommandé"*)

- **Auto-complete** dès 2 lettres (similaire à l'auto-complete société) sur les `affiliates.display_name`.
- **Matching tolérant** : on accepte les coquilles à 2 lettres près (Levenshtein ≤ 2 ou similarity pg_trgm > 0.7). Ex. : "broadcast associes" matche "Broadcast Associés".
- Si le visiteur arrive sur un **lien d'affiliation** (`?ref=TOKEN`) :
  - Le champ est **pré-rempli** automatiquement avec le nom de l'affilié.
  - Le champ est **verrouillé** (lecture seule) pour éviter le détournement.
  - Le `token` est stocké dans le cookie session (TTL 30 jours) pour persister à travers la navigation.
- Si match trouvé : on lie au `affiliate_id` existant.
- Si pas de match : on **crée automatiquement** un nouvel `affiliate` avec `commission_percent = 0` et un token généré. Phil peut ensuite l'éditer dans `/admin/affiliates`.

#### 3.13.2 Lien d'affiliation et QR code

Chaque affilié a un **lien dédié** :

```
https://mds-prospection.vercel.app/{locale}/inscription-exposant?ref=AB12CD34
```

- Le `token` est une chaîne aléatoire courte (8-10 caractères, ex. nanoid).
- "Si possible invisible" : on peut prévoir un mode "lien rebrandé" sous un sous-domaine court (ex. `https://mds.link/AB12CD34` → redirection 302), à activer en P5+.
- **QR code généré côté admin** : librairie `qrcode` (npm), génération à la volée en SVG ou PNG, téléchargeable depuis `/admin/affiliates/[id]`.
- Tracking des clics : table `affiliate_clicks` (IP, UA, referrer, timestamp) pour mesurer la performance.

#### 3.13.3 Pourcentage d'apport d'affaires

- Champ `commission_percent` sur la table `affiliates` (numeric, 0–100, défaut 0).
- Modifiable depuis `/admin/affiliates/[id]`.
- Appliqué uniquement quand un prospect lié à cet affilié atteint `prospect.status = 'signe'` (paiement définitif).
- **Calcul** : `commission_due_eur = prospect.estimated_amount × affiliate.commission_percent / 100` (HT).
- Affichage agrégé sur la fiche affilié et dans le dashboard exposant-affilié.

#### 3.13.4 Affilié = exposant : dashboard intégré à l'Espace Exposant

Si un affilié est aussi **exposant signé** (sa `companies.id` est lié à un prospect en statut `signe` ou `acompte_paye`), il voit dans son Espace Exposant un onglet supplémentaire :

> `/{locale}/espace-exposant/affiliation`

Contenu :
- Son lien d'affiliation personnel + QR code téléchargeable.
- Liste des prospects qu'il a apportés (anonymisée si non signés : "Société X — en cours") avec statut.
- Total CA généré par ses apports + commission cumulée due.
- Historique des paiements de commission (champ `affiliate_payouts` à prévoir, V2).

Pour les affiliés non-exposants, Phil les contacte directement (hors plateforme) pour leur communiquer le lien et payer la commission.

#### 3.13.5 Dashboard admin

Page `/admin/affiliates` :
- Table : nom, lien, QR code (icône télécharger), commission %, # clics, # signups, # signés, CA généré, commission due, statut.
- Filtres : actifs/inactifs, par % de commission.
- CRUD : créer / éditer / désactiver un affilié.
- Export CSV pour comptabilité.

### 3.14 Profil exposant (informations à fournir)

Chaque exposant fournit (depuis son Espace Exposant) ou se voit fournir (par l'admin) un profil enrichi qui sert :
- Au guide exposant officiel des MDS (livret distribué sur place).
- Au site des MediaDays Solutions (page exposants).
- Aux supports communication (LaLettre.pro, MAG Hebdo, réseaux sociaux MDS).

**Champs du profil** (table `company_profiles`, voir 4.1) :

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `logo_url` | URL Supabase Storage | Oui | PNG/SVG transparent recommandé, max 2 Mo |
| `description_fr` | Markdown | Oui | 200-500 caractères, présentation grand public |
| `description_en` | Markdown | Oui (si international) | idem en anglais |
| `linkedin_url` | URL | Non | Page société LinkedIn |
| `social_networks` | JSONB array | Non | Format : `[{ platform: 'twitter', url: '...' }, { platform: 'instagram', url: '...' }]` — extensible (twitter/X, instagram, facebook, youtube, tiktok, threads, bluesky, mastodon, etc.) |
| `website` | URL | Oui | Site officiel (peut hériter de `companies.website`) |
| `tagline_fr` / `tagline_en` | text court | Non | Slogan d'une ligne |
| `keywords` | array text | Non | 3-5 mots-clés pour recherche/filtres |
| `public_contacts` | JSONB array | Non | Format : `[{ first_name, last_name, role, email_public, phone_public }, ...]` — contacts diffusés publiquement (peuvent différer des `contacts` internes) |
| `attachments` | JSONB array | Non | Format : `[{ type: 'plaquette', url: '...', filename: '...' }]` pour brochures, kits de presse, etc. |

**Stockage des fichiers** : Supabase Storage, bucket `exhibitor-media/{company_id}/`, RLS pour que chaque exposant ne voit que ses propres fichiers, lecture publique pour les fichiers exposés sur le site MDS.

**UI exposant** (`/{locale}/espace-exposant/profil`) :
- Formulaire structuré section par section.
- Drag-and-drop pour upload logo et fichiers.
- Bouton "Ajouter un réseau social" qui ajoute une ligne `{ platform, url }` au tableau `social_networks`.
- Aperçu en temps réel ("voici comment vos infos apparaîtront sur le guide exposant").
- Validation : exigences minimales pour passer en statut `profil_complet` (logo + description FR + website).

**UI admin** (`/admin/exhibitors/[company_id]/profil`) :
- Même formulaire en mode édition admin.
- Vue "État de complétude des profils exposants" sur le dashboard admin pour relancer ceux qui n'ont rien rempli.

### 3.15 Multi-saison / multi-édition

**Objectif** : permettre l'édition 2027, 2028, etc., sans dupliquer la base ni casser l'historique.

**Modèle** : table `seasons` au-dessus des entités opérationnelles. Chaque entité "événementielle" (`prospects`, `booth_inventory`, `pricing_tiers`, `addon_options`, exposants PRS éligibles) porte une FK `season_id`.

**Règles** :
- Une seule **saison active** à la fois (`seasons.is_active = true`), définie via `app_settings.active_season_id`. C'est elle que l'app publique affiche.
- Les saisons archivées restent consultables côté admin (lecture seule par défaut).
- Les `companies` et `contacts` sont **transverses** (pas de FK saison) : la même société peut exposer en 2026, 2027, etc., avec des `prospects` différents.
- Lors du seed initial : on crée la saison `MDS_2026` et on rattache toutes les données seedées.
- Pour préparer 2027 : Phil clique "Dupliquer la saison" → copie les `pricing_tiers` + `addon_options` + `booth_inventory` (templates) vers une nouvelle saison `MDS_2027` éditable.

**Reporting** : tous les écrans de KPI ont un sélecteur de saison.

### 3.16 Audit log + RGPD opérationnel (RTBF + portabilité)

#### 3.16.1 Audit log

Toutes les actions admin sensibles sont tracées dans la table `audit_log` (cf. 4.1) :
- Modifications de `prospects.status`, `companies`, `contacts`, `pricing_tiers`, `app_settings`
- Créations / suppressions
- Synchros API déclenchées manuellement
- Connexions admin
- Actions RGPD (RTBF, export portabilité)

Implémentation : triggers Postgres sur `UPDATE` / `DELETE` capturant `before` / `after` en JSONB, ou middleware Next.js qui logge avant `revalidatePath`.

UI : `/admin/audit-log` consultable, filtres par utilisateur / entité / date / action.

#### 3.16.2 Droit à l'oubli (RTBF)

Action admin sur fiche contact ou société : **"Supprimer définitivement (RGPD)"**.
- Confirmation explicite (texte à taper).
- Cascade : suppression du contact + ses activities + ses signups + anonymisation dans les sync_logs (on garde la trace de l'événement mais pas l'email/nom).
- Log automatique dans `audit_log`.
- Notification à Sellsy/Brevo via API pour suppression côté CRM (méthode "anonymize" si l'API ne permet pas la suppression dure).

Email support `rgpd@mediadays.fr` mentionné dans la politique de confidentialité, qui crée un ticket interne pour Phil.

#### 3.16.3 Droit à la portabilité

Action admin : **"Exporter données contact"** → JSON structuré téléchargeable contenant tout ce que la plateforme détient sur cet email (contacts + prospects + activities + signups + clics affiliés).

### 3.17 TVA & autoliquidation B2B intracommunautaire

**Problème** : facturer la TVA française à un client allemand qui a un numéro de TVA intracommunautaire valide est une erreur fiscale (c'est l'autoliquidation qui s'applique).

**Solution** :
1. Au formulaire étape 2A, si `companies.country != 'FR'` (déduit du domaine email ou demandé), un champ optionnel **"Numéro de TVA intracommunautaire"** apparaît.
2. À la soumission, vérification via l'API publique [VIES](https://ec.europa.eu/taxation_customs/vies/) (gratuite, UE) :
   - Si valide → `companies.vat_verified = true`, TVA appliquée = 0 % (autoliquidation), mention obligatoire ajoutée à la facture Sellsy.
   - Si invalide → bloquer avec message *"Le numéro de TVA n'a pu être validé. Vérifiez la saisie."*.
   - Si l'API VIES est down → soft pass, marquer `vat_verified = pending`, signaler à l'admin pour vérif manuelle.
3. Sellsy gère ensuite la facturation avec autoliquidation correcte (à configurer côté Sellsy : modèle "TVA autoliquidation art. 196 directive 2006/112/CE").

### 3.18 Notifications admin

Sur événements clés, envoi automatique d'un email au destinataire configuré dans `app_settings.notification_email_admin` (par défaut : Phil) :

| Événement | Notif |
|---|---|
| Nouveau signup vérifié (étape 2 atteinte) | Email avec lien vers fiche `/signups/[id]` |
| Nouveau prospect signé (paiement complet ou acompte) | Email + résumé |
| Échec sync API critique (Sellsy down, Stripe webhook timeout) | Email d'alerte avec détails du sync_log |
| Prospect inactif depuis 14 jours en `devis_envoye` | Email de relance interne |
| Profil exposant complété par un exposant | Notification |
| Nouvel affilié auto-créé (depuis le formulaire) | Notification (Phil doit décider du commission %) |

Optionnel (P5+) : webhook Slack si Phil l'utilise. Côté MVP : email Brevo suffit.

Configurable depuis `/admin/preferences` (qui reçoit quoi).

### 3.19 Mode test / sandbox commercial

**Objectif** : permettre à Phil et à la commerciale de tester le parcours public sans polluer la base réelle (utile pour démos, formation, recettage).

**Mécanisme** :
- Flag `test_mode_enabled` dans `app_settings`.
- Quand activé : tout signup créé entre `test_mode_enabled = true` et désactivation a `prospects.is_test = true`.
- Toutes les vues admin filtrent par défaut `is_test = false`. Un toggle en haut permet de basculer pour voir uniquement les tests.
- Les sync API (Sellsy, Brevo, Stripe) sont **désactivées** sur les prospects test (pas de pollution externe). Stripe utilise les clés `sk_test_*` au lieu de `sk_live_*`.
- Bouton "Vider la base de test" dans `/admin/preferences` pour purger en un clic tous les `is_test = true`.

### 3.20 Feature flags (déploiement progressif)

Pour pousser les fonctionnalités progressivement et désactiver en cas de bug en prod, un système simple de flags stockés dans `app_settings.feature_flags` (jsonb) :

```json
{
  "espace_exposant": true,
  "affiliation": true,
  "facture_integrale": true,
  "vat_vies": true,
  "exhibitor_profile_public_directory": false
}
```

Le middleware ou les composants UI lisent les flags et masquent/bloquent les routes correspondantes. Éditable depuis `/admin/preferences` onglet "Feature flags".

### 3.21 Création de devis depuis le back-office (mode concierge)

**Cas d'usage** : Phil ou la commerciale est en rendez-vous physique ou en call avec un prospect. Plutôt que de demander au client de remplir le formulaire web (avec double opt-in, etc.), ils émettent **directement un devis Sellsy** depuis le back-office et l'envoient par email après l'échange. Cas typique : closing à chaud, négociation finalisée verbalement, prospect rencontré sur un autre salon.

**Flux** :

1. Admin clique **"+ Nouveau devis"** depuis sidebar admin (CTA primary visible) ou depuis fiche société existante.
2. **Étape 1 — Société** :
   - Auto-complete sur les `companies` existantes (matching fuzzy 2 lettres près, comme partout).
   - Si match : sélection en un clic.
   - Si nouveau : "+ Créer une nouvelle société" → mini-formulaire (nom, domaine, pôle suggéré par classification IA, catégorie PRS/standard, pays, optionnel VAT VIES auto-vérifié).
3. **Étape 2 — Contact** :
   - Liste des `contacts` rattachés à la société sélectionnée.
   - "+ Nouveau contact" → mini-formulaire (prénom, nom, fonction, email, tel, langue FR/EN).
   - Sélectionner le contact destinataire du devis.
4. **Étape 3 — Configuration de l'offre** :
   - Même UI que l'étape 2A publique mais avec les **tarifs visibles d'emblée** (admin a toute confiance).
   - Pack + Salons + Booth (avec verrou optimiste 30 min comme côté public) + Options additionnelles.
   - Calcul total HT en temps réel avec ligne acompte.
   - **Note interne** optionnelle (visible admin uniquement, jamais envoyée au client).
   - **Source du prospect** sélectionnable : `direct` | `salon` | `reference` | `campagne`.
5. **Étape 4 — Émission & envoi** :
   - Choix du parcours :
     - **Devis Sellsy + envoi email automatique** (le plus fréquent — paiement différé)
     - **Devis Sellsy + Stripe Payment Link** (acompte ou intégral encaissable à distance)
     - **Pro-forma + Stripe Payment Link** (B2G ou international)
     - **Brouillon** (ne pas envoyer maintenant — Phil affine puis envoie plus tard)
   - **Personnalisation du message email** : un éditeur simple avec un message par défaut basé sur la `contacts.language`, modifiable. Phil peut ajouter une touche personnelle après le call.
   - Aperçu de l'email avant envoi.
   - Bouton **"Émettre & envoyer"** (ou "Enregistrer en brouillon").

**Différences vs flux public** :

| Critère | Flux public | Flux concierge admin |
|---|---|---|
| Double opt-in email | Obligatoire | **Pas requis** (admin engage la confiance) |
| Vérification VAT VIES | Auto si pays ≠ FR | Auto, mais admin peut bypasser et marquer manuellement |
| CGV checkbox | Obligatoire | Implicite (le client accepte en signant le devis) |
| Anti-spam (rate limit, hCaptcha) | Actif | Désactivé pour admins authentifiés |
| `prospects.source` | `'inscription_web'` forcé | Sélectionnable |
| `prospects.owner_id` | Auto (à qualifier ensuite) | L'admin qui crée le devis |

**Stripe Payment Link** : alternative à Stripe Checkout pour les paiements offline.
- Génération côté serveur via [Stripe API Payment Links](https://stripe.com/docs/payments/payment-links).
- Le lien est intégré dans l'email envoyé (bouton "Payer l'acompte" ou "Régler la totalité").
- Une fois cliqué et payé, le **même webhook** que pour Checkout est déclenché → idempotence garantie via `stripe_events_processed`.
- Le `Payment Link` reste actif jusqu'à utilisation ou expiration (configurable, par défaut 30 jours = TTL du devis).

**Email envoyé au client** (template Brevo `devis_concierge_fr` / `devis_concierge_en`) :

- **Sujet** : "Votre devis MediaDays Solutions 2026 — [Pack] [Société]"
- **Corps** :
  - Salutation personnalisée par l'admin
  - Récapitulatif (pack + emplacement + options + total HT)
  - Bouton **"Voir le devis (PDF)"** → lien vers le devis Sellsy
  - Bouton **"Régler [acompte/totalité]"** (si Payment Link) → redirige vers Stripe
  - Mention CGV + lien
- **Pièce jointe** : devis Sellsy PDF (récupéré via API Sellsy).
- Envoyé via **Brevo SMTP** dans la langue de `contacts.language`.

**Statut prospect créé** :
- Si "Brouillon" : `prospect.status = 'lead'` avec tag `[Brouillon admin]`
- Si devis envoyé sans Payment Link : `prospect.status = 'devis_envoye'`
- Si Payment Link cliqué et payé : webhook → `acompte_paye` ou `signe`
- L'événement est tracé dans `activities` avec `type = 'devis_admin_created'` et le contenu de la note interne.

**UI route** : `/admin/quotes/new` (raccourci dans sidebar : "+ Nouveau devis" en CTA primary).

**Cas d'usage secondaire — Modifier un devis existant** : depuis la fiche prospect, action "Émettre un nouveau devis" qui ouvre le même formulaire pré-rempli avec les choix précédents (pratique pour ajuster un devis après négociation).

### 3.22 Assistant IA conversationnel (admin + partenaire)

**Objectif** : intégrer un chat IA discret mais puissant dans les deux espaces protégés (admin et Espace Partenaire) pour accélérer les opérations courantes — sans remplacer Cowork (qui reste l'outil de pilotage hors-app), mais comme **assistant intra-application** avec accès direct à la base de données.

> ⚠️ **Distinction importante** : ce chat est un assistant *custom* propulsé par l'API Anthropic Claude (côté serveur Next.js). Il n'est **pas** Cowork. Il ne lit pas Drive, n'envoie pas de mails Gmail, ne touche pas au calendrier de Phil. Son périmètre : la base Supabase de l'app + les API métier (Sellsy, Brevo, Stripe via outils internes). Pour les tâches transverses inter-outils, Phil continue à utiliser Cowork.

#### 3.22.1 Choix du modèle (optimisation coût)

- **Modèle par défaut** : `claude-haiku-4-5` — ultra rapide, économique (~0,25 €/1M tokens input, ~1,25 €/1M output). Suffisant pour 95 % des requêtes (questions, recherches, créations rapides).
- **Escalation Sonnet** : `claude-sonnet-4-6` — déclenchée explicitement pour les tâches lourdes :
  - "Rédige-moi une proposition commerciale complète pour [société]"
  - "Analyse mon pipeline et fais-moi 3 recommandations stratégiques"
  - "Compare ces 5 prospects et dis-moi lesquels prioriser"
- **Bouton UI** : "💎 Mode approfondi (Sonnet)" cliquable explicitement par l'admin avant l'envoi d'une question. Bouton désactivé pour les partenaires (Haiku uniquement).
- **Prompt caching** activé pour le system prompt (~3-5K tokens) → ramène le coût input à 10 % du tarif normal sur les requêtes successives.
- **Streaming** des réponses pour ressenti instantané.
- **Budget par session** : limite douce de 50 messages / session admin et 20 / session partenaire (configurable dans `app_settings.ai_message_quota_*`). Au-delà : message "session longue, considérez démarrer une nouvelle conversation pour optimiser le contexte".

**Coût estimé** :
- Session admin moyenne (5-10 messages) : <0,01 € en Haiku
- Session "deep" Sonnet (proposition complète) : ~0,05 € par génération
- Sur 100 sessions/jour : <5 €/mois en Haiku, ~30 €/mois si 1/3 des sessions escaladent en Sonnet → coût négligeable face au temps gagné.

#### 3.22.2 Outils disponibles (tool use Claude)

L'assistant invoque des outils typés (Anthropic tool use) qui exposent la DB et les actions métier. Le modèle décide quel outil appeler selon la requête.

**Outils admin** (`role IN ('admin', 'sales')`) :

| Outil | Description | Exemple d'usage |
|---|---|---|
| `search_prospects(query, filters)` | Recherche prospects par nom/email/pôle/statut | "Trouve-moi les prospects radios qui n'ont pas reçu de devis" |
| `get_prospect_details(prospect_id)` | Fiche complète + contacts + activities | "Récap NRJ" |
| `create_prospect(data)` | Création rapide depuis le chat | "Ajoute Société X, contact Y, pôle audio" |
| `create_reminder(prospect_id, due_at, title)` | Crée un rappel | "Rappelle-moi de relancer NRJ vendredi 16h" |
| `list_reminders(filters)` | Mes rappels du jour / semaine | "Qu'est-ce qui m'attend cette semaine ?" |
| `draft_proposal(prospect_id, custom_brief)` | Génère un draft de propo commerciale (Sonnet) | "Rédige une proposition pour Lagardère sur PREMIUM Paris" |
| `draft_email(prospect_id, intent)` | Rédige un email de relance / suivi | "Email de relance gentle pour NRJ qui n'a pas répondu" |
| `update_prospect_status(id, new_status)` | Bascule de statut | "Marque RTL comme perdu" |
| `get_pipeline_summary(season_id?)` | Tableau de bord conversationnel | "Comment avance le pipeline cette semaine ?" |
| `find_similar_companies(name)` | Fuzzy match sur DB | "Y a-t-il une société qui ressemble à 'Web Radio AI' ?" |
| `summarize_recent_activity(hours)` | Quoi de neuf aujourd'hui | "Qu'est-ce qui s'est passé depuis hier ?" |
| `get_affiliate_performance(affiliate_id?)` | Perf des apporteurs | "Combien LaLettre.pro nous a apporté ?" |

#### 3.22.2bis Contextualisation côté prospect / partenaire

L'assistant côté public/partenaire est **strictement contextualisé** par le statut et la catégorie du prospect :

**Niveaux d'accès** :

| État utilisateur | Accès assistant | Contexte fourni au modèle |
|---|---|---|
| **Anonyme** (visiteur public) | ❌ Aucun assistant | — |
| **Signup vérifié, non converti** (a fait étape 1+2 mais pas encore signé) | ✅ Assistant léger (FAQ + tarifs de SA catégorie) | Catégorie dérivée (PRS / Standard / Non éligible) + DDP correspondante |
| **Prospect créé, en négociation** (devis envoyé, etc.) | ✅ Assistant standard | Tout ci-dessus + son devis + état paiement |
| **Partenaire signé** (acompte payé ou intégral) | ✅ Assistant complet | Tout ci-dessus + commande complète + profil + ressources salon |

**Tarifs contextualisés** : si le prospect demande "Combien coûte le pack PREMIUM ?", l'assistant calcule la réponse depuis `pricing_tiers` filtré par sa `derived_category` :
- **Catégorie `prs_exhibitor`** : retourne les tarifs préférentiels PRS (8 700 € HT pour PREMIUM, etc.) + mentionne explicitement "en tant qu'exposant Paris Radio Show 2026, vous bénéficiez du tarif préférentiel"
- **Catégorie `standard`** : retourne les tarifs MDS standards (20 500 € HT pour PREMIUM)
- **Catégorie `non_eligible`** : ne donne pas de tarifs, redirige vers contact équipe

L'assistant n'expose **jamais** les tarifs de l'autre catégorie. Un prospect MDS ne peut pas voir les tarifs PRS dans le chat.

**Documents contextualisés** : si le prospect demande la DDP, le système prompt précise quel PDF DDP est applicable (DDP-MDPRS26 pour PRS, DDP-MDS26 pour les autres) et fournit le lien de téléchargement correspondant.

**Outils partenaire** (auth magic link Espace Partenaire) :

| Outil | Description | Exemple |
|---|---|---|
| `get_my_order()` | Récap commande | "Où en est ma commande ?" |
| `get_my_payment_status()` | Acompte / solde / factures | "Combien ai-je encore à payer ?" |
| `get_event_info(event)` | Horaires, accès, plan, contacts logistiques | "À quelle heure j'arrive Paris ?" |
| `download_my_document(type)` | Lien téléchargement Sellsy | "Donne-moi mon devis signé" |
| `update_my_profile(field, value)` | Modifier le profil exposant | "Change mon LinkedIn" |
| `request_addon(addon_id)` | Lance la commande d'une option supplémentaire | "Je veux ajouter un emailing" |
| `contact_team(message, urgency)` | Email à l'équipe MDS | "Préviens Philippe que je suis bloqué" |
| `faq_search(question)` | Recherche dans `exhibitor_resources` | "Comment fonctionnent les badges équipe ?" |

#### 3.22.3 UX

**Présence sur les pages** : bouton flottant en bas à droite (icône chat magenta) sur toutes les pages de l'admin et de l'Espace Partenaire. Au clic, panneau latéral droit qui prend ~40 % de la largeur écran (full screen sur mobile).

**Première vue** :
- Salutation contextuelle ("Bonjour Phil 👋 Que voulez-vous faire ?")
- 3-4 **suggestions rapides** adaptées au rôle :
  - Admin : "📊 Résumé de la semaine" / "📞 Mes rappels du jour" / "✍️ Rédiger un email" / "+ Nouveau devis"
  - Partenaire : "📦 Voir ma commande" / "💳 Solde restant" / "📚 Guide exposant" / "💬 Contacter l'équipe"
- Bouton "💎 Mode approfondi (Sonnet)" (admin only)
- Champ de saisie avec placeholder personnalisé

**Pendant la conversation** :
- Streaming token par token
- Quand un outil est appelé, affichage discret : "🔍 Je cherche dans le pipeline..." puis résultat formaté
- Boutons d'action en ligne : "Créer ce rappel ?" → confirmation → exécution avec audit log
- Possibilité d'éditer le dernier message
- Pinning : épingler une réponse importante (sauvegardée dans la conversation)

**Conversations sauvegardées** :
- Une session par jour ouvert par défaut, ou nouvelle session sur demande
- Historique consultable dans `/admin/assistant/history` et `/espace-partenaire/assistant/history`
- Suppression possible (RGPD compliance, action tracée dans audit_log)

#### 3.22.4 Sécurité et garde-fous

- **Permissions strictes via RLS** : chaque outil applique le filtre `auth.uid()` côté Supabase. L'IA ne peut pas voir/modifier au-delà du périmètre de l'utilisateur connecté.
- **Pas d'écriture destructive sans confirmation** : créer un rappel = OK direct ; supprimer un prospect = nécessite un "OUI, supprimer" tapé par l'utilisateur (et reste hors RTBF qui reste manuelle admin).
- **Pas d'envoi d'email automatique** : l'IA peut **rédiger** un email mais pas l'envoyer. Phil le copie ou clique "Envoyer ce brouillon" qui passe par le flux normal Brevo (avec audit).
- **Sandboxing test mode** : si `app_settings.test_mode_enabled = true`, l'IA n'écrit que sur des prospects `is_test = true`.
- **Audit trail complet** : chaque tool call est logué dans `audit_log` avec `entity_type = 'ai_action'`.
- **Anti-prompt-injection** : sanitization des inputs utilisateur ; un système prompt clair empêche l'IA de divulguer des secrets DB ; les contenus tiers (descriptions de société dans la DB) sont marqués comme "données externes non fiables" dans le contexte.

#### 3.22.5 Connexion à Cowork

Bien que l'assistant in-app ne **soit pas** Cowork, il peut **complémenter** Cowork :
- L'admin peut copier-coller des résultats de l'assistant dans Cowork pour réutilisation (fichiers Drive, docs MDS, etc.).
- Inversement, Phil peut demander dans Cowork "fais-moi un export du pipeline depuis l'API MDS Prospection" via une route API dédiée.
- À terme (P6+), un MCP serveur dédié à l'app pourrait permettre à Cowork d'accéder à la DB en lecture seule.

#### 3.22.6 Personnalité et ton

- **Admin** : ton concis, factuel, orienté action. Pas de blabla. "Voici 3 prospects à relancer aujourd'hui : ..."
- **Partenaire** : ton chaleureux, serviable, professionnel. Bilingue (FR/EN selon `contacts.language`).
- **Pas d'emoji par défaut** sauf en confirmation d'action ("✅ Rappel créé").
- **Toujours signer la fin des réponses longues** par "Vous voulez que je fasse autre chose ?" pour fluidifier.

### 3.23 MCP Server — exposition lecture seule pour Cowork

**Objectif** : faire de l'app un **hub interrogeable** depuis Cowork (et tout autre client MCP — Claude Code, Claude Desktop, Atlas, etc.), pour que Phil puisse poser des questions sur le pipeline directement dans son outil de pilotage transverse, qui croise déjà Drive, Gmail, Calendar et autres sources.

**Use case typique** (dans Cowork, pas dans l'app) :
- *"Combien j'ai de prospects signés ce mois ?"* → Cowork interroge le MCP de l'app → réponse en 2 secondes
- *"Génère un récap mensuel avec : prospects ajoutés, signés, CA encaissé, rappels échus"* → Cowork croise MCP app + Calendar + Drive → produit un doc complet
- *"Quels exposants de mon pôle Audio attendent encore une réponse ?"* → MCP query → liste à relancer

#### 3.23.1 Architecture

- **Transport** : HTTP + SSE (Streamable HTTP MCP transport, le standard pour serveurs hébergés).
- **Endpoint** : `https://<app-domain>/api/mcp` (route Next.js intégrée à l'app).
- **Implémentation** : SDK officiel Anthropic `@modelcontextprotocol/sdk` côté serveur.
- **Auth** : Bearer token dans le header `Authorization: Bearer <token>`. Tokens générés depuis `/admin/mcp-tokens` (cf. 3.23.4).
- **Permissions** : **lecture seule absolue**. Le compte Postgres utilisé par le serveur MCP a uniquement le rôle `mcp_readonly` (CREATE ROLE en migration P6) qui autorise `SELECT` sur les tables visibles, mais **rien d'autre** (pas de INSERT/UPDATE/DELETE/TRUNCATE/EXECUTE). Même en cas de bug logique, l'écriture est bloquée par Postgres.

#### 3.23.2 Tools MCP exposés

| Tool | Description | Permission token requise |
|---|---|---|
| `search` | Recherche full-text sur prospects, sociétés, contacts | `mcp:read` |
| `get_prospect(id)` | Fiche prospect complète + timeline + synchros | `mcp:read` |
| `get_company(id)` | Société + contacts + historique prospects | `mcp:read` |
| `list_prospects(filters)` | Filtres : statut, pôle, catégorie, owner, source, saison, date | `mcp:read` |
| `pipeline_metrics(season_id?)` | KPIs agrégés (count par statut/pôle/source) | `mcp:read` |
| `revenue_summary(period)` | CA encaissé / facturé / signé / prévu | `mcp:read:finance` |
| `funnel_metrics(period)` | Conversion clics → signups → vérifiés → signés | `mcp:read` |
| `recent_activity(hours)` | Stream d'événements récents (signups, paiements, etc.) | `mcp:read` |
| `list_signups_pending` | File des inscriptions web à qualifier | `mcp:read` |
| `list_reminders(filters)` | Rappels échus / à venir | `mcp:read` |
| `affiliate_performance(id?)` | Stats des apporteurs d'affaires | `mcp:read` |
| `booth_availability(event, pole)` | Emplacements disponibles | `mcp:read` |
| `prospect_history(id)` | Activities détaillées d'un prospect | `mcp:read` |
| `find_similar_companies(name)` | Fuzzy match sur DB (pg_trgm) | `mcp:read` |

> ⚠️ **Pas de tools d'écriture**. Pour modifier la DB, Phil passe soit par l'UI admin web, soit par l'assistant in-app (cf. 3.22). Cowork est en lecture seule, by design.

#### 3.23.3 Resources MCP exposées

Les resources MCP sont des données accessibles par URI (équivalent à des "documents" qu'un client MCP peut lire) :

| Resource URI | Contenu | Format |
|---|---|---|
| `mcp://app/spec` | Le SPEC fonctionnel à jour | Markdown |
| `mcp://app/seasons/active` | Saison en cours (dates, pôles, salles) | JSON |
| `mcp://app/seasons/list` | Toutes les saisons (active + archivées) | JSON |
| `mcp://app/poles` | Les 6 pôles + descriptions + couleurs | JSON |
| `mcp://app/pricing/{season_id}` | Grille tarifaire complète (3 packs × 2 catégories) | JSON |
| `mcp://app/addons/{season_id}` | Catalogue options additionnelles | JSON |
| `mcp://app/exhibitor_resources/{slug}` | Guide partenaire, infos pratiques (FR + EN) | Markdown |
| `mcp://app/legal/cgv/{locale}` | CGV en vigueur | Markdown |
| `mcp://app/legal/privacy/{locale}` | Politique de confidentialité | Markdown |

#### 3.23.4 Tokens MCP

**Page admin `/admin/mcp-tokens`** : gestion des tokens d'accès.

- Créer un nouveau token avec :
  - Nom (ex. "Cowork Phil iMac")
  - Scopes : `mcp:read` (par défaut), optionnel `mcp:read:finance` pour les chiffres financiers
  - Expiration (par défaut 1 an, renouvelable)
- Révoquer un token (action immédiate, log audit_log)
- Voir l'historique d'usage (dernier appel, count, IP)

Stockage : nouvelle table `mcp_tokens` (cf. 4.1).

**Affichage du token** : affiché **une seule fois** à la création (UI : copier-coller). Stocké hashé (bcrypt) côté DB. Si Phil perd un token, il en crée un nouveau.

#### 3.23.5 Configuration côté Cowork

Phil ajoute le MCP dans Cowork via les paramètres → MCPs personnalisés :

```json
{
  "name": "MDS Prospection",
  "transport": "http",
  "url": "https://mds-prospection.vercel.app/api/mcp",
  "headers": {
    "Authorization": "Bearer mds_pat_aB3xY9kL2mN8pQ4..."
  }
}
```

À la connexion, Cowork reçoit la liste des tools/resources et peut les appeler dans n'importe quelle conversation.

#### 3.23.6 Sécurité

- **Rate limiting** : 100 req/min par token (configurable). Au-delà : 429.
- **Audit log** : chaque appel MCP est tracé dans `audit_log` avec `action = 'mcp_query'`, `entity_type = 'mcp_tool'`, et le nom du tool appelé.
- **Données sensibles** : par défaut, `mcp:read` ne retourne pas les emails personnels des contacts (uniquement les emails pro génériques de la société). `mcp:read:full_contacts` est un scope distinct à demander explicitement.
- **Logs des paiements** : les détails Stripe (numéros de carte hashés, etc.) ne sont **jamais** exposés via MCP. Seuls les statuts (paid/pending) et montants HT le sont.
- **Pas d'export massif** : `list_prospects` est paginé (max 100 par appel, cursor-based).
- **Test mode** : si `app_settings.test_mode_enabled = true`, le MCP retourne uniquement les `is_test = true` (sandbox isolé).

#### 3.23.7 Bénéfices pour Phil

1. **Pilote unifié dans Cowork** : croiser le pipeline MDS avec Drive, Calendar, Gmail dans une seule conversation.
2. **Reporting ad hoc** : "fais-moi un PDF mensuel des KPIs" → Cowork interroge MCP + génère doc.
3. **Briefing avant rendez-vous** : "récap NRJ avant mon call de 14h" → Cowork lit MCP + le calendrier + emails passés.
4. **Pas d'écran à ouvrir** pour des questions ponctuelles : tout se passe dans la conversation Cowork.
5. **Extensible** : tout autre client MCP (Claude Code, Atlas, scripts custom) peut consommer le serveur de la même façon.

### 3.24 Webhooks inverse Sellsy (synchro bidirectionnelle)

**Problème** : si Phil ou la commerciale modifie quelque chose **directement dans Sellsy** (ex. marque un devis comme refusé, modifie un montant, ajoute une note), l'app Prospection ne le saura pas et affichera un état faux. Désynchro silencieuse = bugs commerciaux.

**Solution** : abonnement aux webhooks Sellsy + handler côté app qui met à jour la DB Supabase.

**Webhooks à écouter** :

| Événement Sellsy | Action côté app |
|---|---|
| `quote.created` | Si le devis a été créé directement dans Sellsy, créer un `prospect` minimal côté app si pas existant |
| `quote.accepted` | Marque `prospect.status = 'acompte_paye'` ou `'signe'` selon contexte |
| `quote.refused` | Marque `prospect.status = 'perdu'` + notif admin |
| `invoice.created` | Met à jour `prospect.sellsy_invoice_id` |
| `invoice.paid` | Met à jour `prospect.status = 'signe'` + notif admin + déclenche emails lifecycle |
| `invoice.overdue` | Notif admin + ajoute un rappel auto |
| `company.updated` | Met à jour les champs synchronisés sur `companies` (mais pas le pôle qui est dérivé app-side) |
| `contact.updated` | Idem pour `contacts` |

**Endpoint** : `/api/webhooks/sellsy` avec vérification de signature HMAC (Sellsy fournit un secret partagé).

**Idempotence** : table `sellsy_events_processed` (event_id PK) sur le même pattern que `stripe_events_processed`. Évite les doubles traitements en cas de retry Sellsy.

**Audit log** : chaque webhook reçu est tracé dans `audit_log` avec `entity_type = 'sellsy_webhook'`.

**Variable env** : `SELLSY_WEBHOOK_SECRET`.

### 3.25 Notifications partenaire lifecycle (emails automatiques)

**Objectif** : accompagner chaque partenaire signé avec une série d'emails automatiques avant l'événement, pour qu'il soit prêt et que la prestation MDS soit irréprochable.

**Calendrier des emails** (déclenché par cron quotidien qui scanne les `prospects` signés et compare avec les dates de salon) :

| Trigger | Email | Contenu |
|---|---|---|
| Signature confirmée | **Bienvenue partenaire** | Récap commande + accès Espace Partenaire + lien guide |
| J-60 avant salon | **Préparez votre stand** | Checklist : logo HD, description, contacts publics, badges équipe |
| J-45 | **Rappel logo HD** | Si profil pas complété : "il vous reste X jours pour fournir vos visuels" |
| J-30 | **Logistique & accès** | Plan d'accès, parking, hôtels recommandés, agenda du salon |
| J-15 | **Rappel badges équipe** | Configurer la liste de votre équipe |
| J-7 | **Dernier brief avant le salon** | Horaires d'ouverture, contacts logistiques, procédure montage |
| J-1 | **À demain !** | Météo, dernier rappel, numéro d'urgence |
| J+1 | **Merci & feedback** | Sondage NPS court + photos du stand |
| J+7 | **Bilan & opportunités 2027** | Stats fréquentation salon, early bird 2027 si applicable |

**Personnalisation** :
- Langue selon `contacts.language` (FR/EN)
- Nom du salon (Paris, Marseille ou Bruxelles selon `events_interest`)
- Liens spécifiques (badges Espace Partenaire, etc.)
- Conditionnel : si profil déjà 100 % complété, on skip les rappels logo/badges

**Templates Brevo à créer** : 9 templates × 2 langues = **18 templates lifecycle**.

**Désinscription** : le partenaire peut suspendre les rappels lifecycle depuis `/espace-partenaire/preferences-emails` (case "Recevoir les rappels avant salon"). Les emails transactionnels (facture, paiement) restent envoyés.

**Table** : pas de nouvelle table. Logique dans un cron Vercel qui tourne quotidiennement à 8h UTC, scanne les prospects signés, calcule les jours jusqu'à l'événement, envoie les emails dus, et trace dans `activities` (`type = 'lifecycle_email_sent'`).

### 3.26 Reporting analytique dédié

**Page admin `/admin/reports`** avec 4 sections :

#### 3.26.1 Funnel de conversion

Visualisation type entonnoir :
- Clics sur liens d'affiliation
- Inscriptions étape 1 (visites formulaire)
- Emails vérifiés (étape 2 atteinte)
- Formulaires détaillés soumis
- Devis envoyés
- Acomptes payés
- Signés
- Avec **taux de conversion entre chaque étape**

Filtres : période (semaine / mois / saison), source, pôle, catégorie tarifaire, affilié.

#### 3.26.2 Performance commerciale

- CA encaissé vs prévu, par mois
- Pipeline value par stade (lead/contact/devis/acompte/signé)
- Top 5 prospects à fort potentiel (signature attendue prochainement)
- Top 5 affiliés (CA généré + conversion rate)
- Performance par pôle (CA, # signés, conversion)
- Performance par owner (Phil vs commerciale)

#### 3.26.3 Évolution temporelle

- Graphique en ligne des nouveaux prospects par jour/semaine
- Graphique en ligne des signatures cumulées
- Comparaison saison vs saison précédente (quand on aura 2027 vs 2026)

#### 3.26.4 Export PDF mensuel

Bouton "📥 Exporter le rapport du mois" qui génère un PDF brandé MDS avec :
- Résumé du mois (KPIs)
- Funnel
- Top affiliés
- Pipeline en cours (anonymisé)
- Insights IA (généré par Sonnet sur demande)

À envoyer chaque début de mois à Phil + commerciale. Cron mensuel optionnel.

### 3.27 Vérification deliverability email (anti-emails morts)

**Problème** : un email syntaxiquement valide n'existe pas forcément. Sur le B2B, ~10 % des emails saisis sont morts (turnover, rebrands, typos). Si on envoie un devis à un email mort, le prospect n'est jamais informé et on perd une conversion.

**Solution** : à l'étape 1 du formulaire public + dans le formulaire de création concierge admin, vérifier que l'email saisi est **deliverable** via une API tierce.

**Provider recommandé** : [NeverBounce](https://neverbounce.com/) (~0,008 €/check, fiable, bonne couverture B2B). Alternatives : Hunter, Kickbox, ZeroBounce.

**Statuts retournés** :
- `valid` — email actif, OK
- `invalid` — email n'existe pas, **bloquer** le signup avec message "cette adresse email ne semble pas valide, vérifiez votre saisie"
- `unknown` — vérification impossible (mailbox catch-all), **soft pass** mais flag pour suivi
- `disposable` — déjà géré par notre liste avant cet appel
- `accept_all` — domaine accepte tout, on laisse passer mais on note

**Stockage** : nouveau champ `email_deliverability_status` sur `contacts` + `public_signup_attempts`.

**Coût** : <50 €/an pour ~5000 vérifications. Largement rentable face à la perte d'un seul prospect à 5K€.

**Variable env** : `NEVERBOUNCE_API_KEY`.

**Mode test** : sandbox NeverBounce activable pour ne pas consommer de quota pendant les tests.

### 3.28 Récap PDF complet à la signature

**Objectif** : à chaque signature finale (`prospect.status = 'signe'`), générer automatiquement un PDF "carton de bienvenue" complet à part de la facture Sellsy. Renforce le sentiment "deal conclu", sert de référence pour l'équipe du partenaire, et améliore la perception qualité MDS.

**Contenu du PDF** (1-2 pages, charte MD, bilingue selon `contacts.language`) :

- En-tête : logo PRS + MDS, "Confirmation de partenariat MediaDays Solutions 2026"
- Société + contact principal
- Pack souscrit (CLASSIC, etc.) avec emplacement (code + photo si disponible) + surface
- Liste des options additionnelles
- Total HT et TTC, statut paiement
- Numéros de pièces Sellsy associés
- **Agenda condensé** du salon (horaires, dates clés)
- Contacts d'équipe MDS avec emails et téléphones
- Adresse + plan d'accès
- Lien direct vers l'Espace Partenaire avec QR code

**Génération** : librairie `@react-pdf/renderer` côté Node.js (équivalent React pour PDF, génère un Buffer Postscript). Stockage dans Supabase Storage `exhibitor-media/{company_id}/recap_signed.pdf`.

**Diffusion** : 
- Envoi automatique par email (template Brevo `recap_signed_{locale}`) avec PDF attaché
- Téléchargement permanent depuis l'Espace Partenaire (`/espace-partenaire/commande` → bouton "📋 Récapitulatif partenaire")
- Lien dans `prospects.recap_pdf_url` pour les admins

**Régénération** : si le pack ou les options changent (option supplémentaire commandée plus tard), le PDF est régénéré et le lien est mis à jour. Anciens PDFs archivés (un par version).

### 3.29 Mass email campaigns depuis l'admin

**Objectif** : composer et envoyer des emails à des groupes ciblés depuis l'app, sans avoir à passer par l'interface Brevo. Utile pour : annonces (date du salon, ouverture des inscriptions), relances en masse, communication exposants signés, newsletters partenaires.

**Page admin `/admin/campaigns`** :

**Liste des campagnes** : draft / programmé / envoyé / en cours / archivé.

**Création d'une campagne** :

1. **Étape 1 — Cible** : sélection du groupe destinataire :
   - Tous les prospects (par statut, pôle, catégorie, source, affilié, owner)
   - Tous les exposants signés (par pôle, par salon)
   - Toutes les inscriptions web vérifiées non converties
   - Une liste Brevo existante (importée par référence)
   - Une sélection manuelle (CSV upload)
   - Filtres combinables (ex. "exposants signés Pôle Audio + langue FR")
   - Aperçu du nombre de destinataires en temps réel

2. **Étape 2 — Composer** :
   - Sujet (avec personnalisations `{{first_name}}`, `{{company_name}}`)
   - Préheader
   - Corps (éditeur Markdown ou WYSIWYG simple)
   - Pièces jointes optionnelles (PDF Sellsy, brochures depuis `app_settings.attachments`)
   - Variantes FR / EN si la cible est mixte
   - **Aperçu** rendu pour 1-3 destinataires types

3. **Étape 3 — Test** :
   - Envoi d'un email de test à un destinataire arbitraire (Phil + commerciale en général)
   - Validation visuelle avant envoi en masse

4. **Étape 4 — Programmer / Envoyer** :
   - Envoi immédiat OU programmation (date + heure)
   - Confirmation finale avec rappel du nombre de destinataires
   - Envoi via API Brevo Campaigns

**Tracking** :
- Open rate, click rate, bounce rate (récupérés de Brevo)
- Désabonnements (respect strict des préférences emails partenaire)
- Conversions attribuées (un visiteur qui clique le lien + s'inscrit dans les 7 jours = attribué à la campagne)

**Table** : nouvelle table `email_campaigns` (cf. 4.1).

**Variable env** : utilise `BREVO_API_KEY` existant.

**Garde-fous** :
- Quota maximum par jour (configurable dans `app_settings.max_campaign_recipients_per_day`, par défaut 5000) pour éviter les erreurs catastrophiques
- Confirmation explicite si > 100 destinataires
- Audit log : qui a envoyé quoi à combien de destinataires

### 3.30 Page d'accueil publique (style mediadays.net)

**Objectif** : page d'accueil immersive `/{locale}` qui pose immédiatement la marque MDS + PRS et oriente vers les deux parcours principaux (devenir partenaire / accéder à l'espace partenaire).

**Inspiration** : design de [mediadays.net](https://mediadays.net) — vidéo plein écran avec ambiance salon live + logo en watermark + titre fort + CTAs nets.

**Ordre des logos** : **MediaDays Solutions à gauche** + **Paris Radio Show à droite** (à respecter partout — header public, page d'accueil, footer, emails). Cet ordre est aligné sur la communication MD historique (le salon "MDS" porte le branding parent, le PRS est le sub-event audio/radio).

**Structure** :

```
┌──────────────────────────────────────────────────────────────────┐
│ [MDS logo] [divider] [PRS logo]   Accueil  Editions  …  [Une? ]  │ ← header bleu marine étroit
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│       [vidéo full-screen — boucle, autoplay muet]                │
│       overlay sombre 30-40% pour lisibilité                      │
│                                                                  │
│            [MDS LOGO BLANC]    [PRS LOGO BLANC]                  │ ← deux logos centrés en grand (MDS gauche / PRS droite)
│                                                                  │
│              MDS PARTENAIRES 2026                                │ ← titre magenta énorme
│                                                                  │
│           PARIS · MARSEILLE · BRUXELLES                          │ ← sous-titre blanc
│                                                                  │
│   [✨ Devenir partenaire]   [🤝 Espace Partenaire]               │ ← 2 CTAs
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│              LES ÉTAPES DE L'ÉDITION 2026                        │ ← section bleue dessous
│   [Bruxelles 26 nov]  [Marseille 10 déc]  [Paris 15 déc]         │ ← 3 cartes salons
└──────────────────────────────────────────────────────────────────┘
```

**Spécifications techniques** :

- **Vidéo background** : `<video autoplay muted loop playsinline>` avec source MP4 H.264 (compatibilité large) en 1920×1080 max, ~10 Mo, durée 15-30 sec, boucle invisible. Stockée dans `public/video/hero-mds-2026.mp4`. Phil fournit la vidéo (montage rapide à partir des rushes des éditions précédentes ou Wmaker).
- **Fallback poster** : image statique `public/video/hero-mds-2026.jpg` en attendant le chargement de la vidéo (montrée aussi sur les connexions lentes / data saver activé).
- **Préchargement intelligent** : `<video preload="metadata">` pour ne pas saturer la bande passante.
- **Mobile** : remplace la vidéo par l'image statique `hero-mds-2026.jpg` (économie data + autoplay vidéo souvent bloqué sur iOS).
- **Overlay** : `linear-gradient(to bottom, rgba(3,26,86,0.4) 0%, rgba(41,66,148,0.5) 100%)` pour lisibilité du texte sur la vidéo.
- **Performance** : cible Core Web Vitals LCP < 2,5s, donc le poster image doit être inliné en base64 ou prioritaire.
- **Accessibilité** : `aria-label="Vidéo d'ambiance MediaDays Solutions 2026"` + bouton mute/unmute (la vidéo est par défaut muette mais offrir le contrôle).

**Sections sous le hero** (scroll vers le bas) :

1. **Les 3 étapes 2026** — cartes des salons (Bruxelles 26 nov, Marseille 10 déc, Paris 15 déc) avec photos venues + dates + bouton "S'inscrire à cet événement"
2. **Pourquoi devenir partenaire ?** — bullets : visibilité, networking, leads qualifiés, audience B2B…
3. **Les 6 pôles thématiques** — vignettes colorées des pôles (cohérent avec la taxonomie v2.1)
4. **Témoignages partenaires 2025** — citations de partenaires précédents (à fournir par Phil)
5. **Footer** — Editions HF + mentions légales + CGV + politique conf + RGPD + contact

**Pas de duplication avec mediadays.net** : cette page d'accueil est dédiée à l'**inscription partenaire**. Le site marketing mediadays.net reste le hub vitrine grand public/visiteurs. Lien réciproque entre les deux dans le footer.

### 3.31 Affichage contextuel du logo (PRS only / MDS only / les deux)

**Règle métier** : pour renforcer la cohérence de la relation commerciale, **une fois identifié**, le partenaire ne voit que le logo de SA catégorie.

| État utilisateur | Logo affiché dans header |
|---|---|
| Anonyme (page d'accueil, signup en cours) | 🟦 PRS + MDS Solutions (les deux) |
| Signup vérifié, catégorie `prs_exhibitor` | 🎙️ **PRS Logo seul** |
| Signup vérifié, catégorie `standard` (MDS) | 📺 **MDS Solutions Logo seul** |
| Signup vérifié, catégorie `non_eligible` | 🟦 PRS + MDS Solutions (les deux, fallback) |
| Admin (Phil + commerciale) | 🟦 PRS + MDS Solutions (toujours, vue éditoriale) |

**Implémentation** :
- Composant React `<HeaderLogo />` qui lit `useSession()` ou `useProspectContext()` et choisit le logo à afficher selon `companies.category` du partenaire connecté.
- Pour les emails Brevo : variable de template `{{logo_url}}` qui pointe sur la version blanche correspondante (PRS-LogoBlanc2026.svg ou MDS-LogoBlanc2026.svg ou un composite).
- Pour les PDFs Sellsy : Sellsy utilise un modèle PDF par catégorie (deux modèles maintenus — PRS et MDS — chacun avec son logo en en-tête).
- Pour le récap PDF post-signature (cf. 3.28) : le PDF affiche **uniquement le logo de la catégorie** (PRS ou MDS), pas les deux.

**Pourquoi** : pour l'exposant PRS, voir le logo PRS partout renforce le sentiment "je suis dans MA communauté audio/radio" ; pour l'exposant MDS standard, le logo MDS Solutions évite la confusion sur "ce salon est-il pour moi ?". Cohérent avec la stratégie tarifaire double catégorie.

**Variantes pour les logos** :
- Header dark (sur bleu marine) : version **blanche** des logos
- Footer / fond clair : version **bleue** des logos
- Email transactionnel (fond blanc) : version **bleue**
- Ces variantes sont déjà présentes dans `public/brand/` (4 fichiers : PRS-LogoBlanc, PRS-LogoBleu, MDS-LogoBlanc, MDS-LogoBleu)

### 3.32 Société facturatrice : Editions HF

**Entité juridique** : **Editions HF** est l'éditrice du Paris Radio Show ET des MediaDays Solutions. C'est elle qui :
- Émet les factures Sellsy (raison sociale, SIRET, RCS, capital social, TVA intracommunautaire, IBAN)
- Apparaît sur les CGV et mentions légales
- Reçoit les virements SEPA des partenaires
- Est responsable du traitement des données personnelles RGPD (data controller)

**Apparition dans l'app** :

1. **Footer public** — toutes les pages publiques affichent en footer : *"Une plateforme éditée par **Editions HF** — [Mentions légales](#) · [CGV](#) · [Politique de confidentialité](#)"*
2. **Mentions légales** (`/{locale}/mentions-legales`) — bloc identité complet : raison sociale, capital, RCS, SIRET, adresse siège, directeur de publication, email contact, hébergeur (Vercel), DPO (Phil)
3. **CGV** (`/{locale}/cgv`) — toutes les références "le Vendeur" / "l'Organisateur" pointent sur Editions HF
4. **Politique de confidentialité** — Editions HF identifiée comme responsable de traitement, email RGPD `rgpd@editions-hf.fr` (ou similaire)
5. **Modèles PDF Sellsy** (devis, facture, pro-forma, récap) — en-tête contient le logo de la catégorie + nom Editions HF + identité fiscale complète + IBAN
6. **Email transactionnels** (DOI, welcome, lifecycle, etc.) — signature pied de mail : *"Editions HF · Paris Radio Show & MediaDays Solutions"*
7. **Espace Partenaire** — footer partenaire avec mention Editions HF + lien CGV + bouton contact RGPD

**Données fiscales à fournir par Phil** (pour seed initial dans `app_settings`) :
- Raison sociale exacte
- Forme juridique (SARL, SAS, SA…)
- Capital social
- N° SIRET
- N° RCS + ville d'immatriculation
- N° TVA intracommunautaire (FR…)
- Adresse siège social
- IBAN MediaDays / Editions HF
- Directeur de publication (probablement Phil)
- Email RGPD officiel

**Stockage en base** : ces infos vont dans `app_settings` sous une clé dédiée :
```json
{
  "billing_entity": {
    "legal_name": "Editions HF",
    "legal_form": "SAS",
    "capital_eur": "...",
    "siret": "...",
    "rcs": "...",
    "vat_number": "FR...",
    "address": { "street": "...", "city": "...", "postal_code": "...", "country": "FR" },
    "iban": "FR76...",
    "publication_director": "Philippe Chapot",
    "rgpd_email": "rgpd@editions-hf.fr",
    "support_email": "support@mediadays.fr"
  }
}
```

L'éditeur peut modifier ces infos depuis `/admin/preferences` → onglet "Identité juridique".

**UX du choix** :
À la fin du formulaire détaillé (étape 2A), un bloc "Comment souhaitez-vous finaliser votre demande ?" présente les 3 options sous forme de cartes radio. Le total HT et l'acompte calculé sont affichés en clair :

```
┌───────────────────────────────────────────┐
│  Total à payer : 14 800 € HT              │
│  Acompte (30%) : 4 440 € HT               │
└───────────────────────────────────────────┘

  ⚪ Devis paiement différé
       Devis envoyé par email, réglez plus tard

  ⚪ Devis + acompte immédiat (carte / SEPA)
       Réservation confirmée dès paiement de l'acompte

  ⚪ Facture pro-forma + acompte immédiat
       Pratique pour comptabilité internationale / B2G
```

Pour le **Cas B (non éligible)** : pas de choix de paiement, juste l'envoi du message libre.

---

## 4. Modèle de données

### 4.1 Tables principales

```
seasons                             -- éditions du salon (cf. 3.15)
  id (uuid, pk)
  code                              -- 'MDS_2026', 'MDS_2027'
  name_fr / name_en                 -- 'MediaDays Solutions 2026'
  start_date / end_date
  is_active                         -- une seule à la fois
  status                            -- 'planning' | 'active' | 'archived'
  created_at

users                              -- admins de l'app
  id (uuid, fk auth.users)
  email
  full_name
  role                              -- 'admin' | 'sales'
  totp_enabled                      -- 2FA (cf. 9.1)
  created_at

poles                               -- 6 pôles + INCONNU
  id (uuid, pk)
  code                              -- enum strict, voir 3.1
  name_fr                           -- ex: '🎙️ AUDIO & RADIO'
  name_en                           -- ex: '🎙️ AUDIO & RADIO' (souvent identique pour les pôles, à traduire pour les libellés courts)
  short_name_fr                     -- ex: 'AUDIO & RADIO'
  short_name_en                     -- ex: 'AUDIO & RADIO'
  description_fr
  description_en
  color_hex                         -- ex: '#F8BBD0'
  emoji                             -- ex: '🎙️'
  display_order
  rooms                             -- array text, ex: ['Le Nôtre rangées A-B-C', 'scène PRS']
  is_active

companies                           -- transverses (pas de FK saison)
  id (uuid, pk)
  name
  name_normalized                   -- lowercase + sans accents pour recherche
  primary_domain                    -- ex: 'radiofrance.com'
  alternate_domains                 -- array text
  website
  country                           -- code ISO ('FR', 'DE', 'BE'…) — déduit du domaine ou demandé
  description
  pole_id                           -- fk poles
  pole_confidence                   -- 0..1, sortie classification IA
  pole_classified_by                -- 'ai' | 'manual'
  pole_classified_at
  category                          -- enum: 'prs_exhibitor' | 'standard' | 'non_eligible'
  was_prs_2026_exhibitor            -- bool (legacy v2.4)
  preferred_room                    -- ex: 'Salle Delorme', dérivé du pôle
  -- TVA intracommunautaire (cf. 3.17)
  vat_number                        -- ex: 'FR12345678901', nullable
  vat_country                       -- code ISO TVA (peut différer de country)
  vat_verified                      -- enum: 'unverified' | 'pending' | 'valid' | 'invalid'
  vat_verified_at
  -- Intégrations
  sellsy_id
  brevo_company_id
  connectonair_id
  created_at
  updated_at

prs_2026_exhibitors                 -- liste de référence (seed depuis xlsx) — renommée season_exhibitors_eligibility en v2.5
  id (uuid, pk)
  season_id (fk seasons)            -- cf. 3.15
  company_name                      -- nom officiel PRS
  company_name_normalized           -- pour matching fuzzy
  matched_company_id                -- fk companies, nullable
  source                            -- 'xlsx_seed' | 'manual_admin' | 'sellsy_export'
  imported_at

contacts
  id (uuid, pk)
  company_id (fk)
  first_name
  last_name
  email                             -- doit matcher domaine company
  phone
  role                              -- ex: 'Directeur partenariats'
  is_primary
  email_verified                    -- bool, true après double opt-in
  email_verified_at
  email_deliverability_status       -- enum: 'unchecked' | 'valid' | 'invalid' | 'unknown' | 'accept_all' (cf. 3.27)
  email_deliverability_checked_at
  language                          -- enum: 'FR' | 'EN'
  marketing_consent                 -- bool (cf. 3.16)
  lifecycle_emails_enabled          -- bool, défaut true (cf. 3.25)
  sellsy_contact_id
  brevo_contact_id
  created_at

prospects
  id (uuid, pk)
  season_id (fk seasons)            -- cf. 3.15
  company_id (fk)
  primary_contact_id (fk contacts)
  is_test                           -- bool (mode test/sandbox cf. 3.19)
  deposit_percentage_at_creation    -- snapshot du % à la création (versionnement)
  vat_rate_at_creation              -- snapshot du taux TVA à la création
  status                            -- enum: 'lead' | 'contact' | 'devis_envoye' | 'acompte_paye' | 'signe' | 'perdu'
  source                            -- enum: 'inscription_web' | 'direct' | 'salon' | 'reference' | 'campagne'
  source_detail
  events_interest                   -- array: ['paris', 'marseille', 'bruxelles']
  pack_code                         -- enum: 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR'
  selected_booth_id                 -- fk booth_inventory, nullable
  selected_addon_ids                -- array fk addon_options
  estimated_amount                  -- numeric (€ HT) — total pack + options
  -- Sortie commerciale (cf. 3.10)
  payment_path                      -- enum: 'devis_differe' | 'devis_acompte' | 'proforma_acompte' | null
  acompte_amount_eur                -- numeric, calculé selon DEPOSIT_PERCENTAGE
  acompte_status                    -- enum: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded'
  acompte_paid_at
  stripe_checkout_session_id
  stripe_payment_intent_id
  sellsy_devis_id                   -- id du devis créé (devis_envoye)
  sellsy_proforma_id                -- id de la facture pro-forma
  sellsy_invoice_id                 -- id de la facture finale (post-acompte)
  -- Affiliation (cf. 3.13)
  affiliate_id                      -- fk affiliates, nullable
  commission_eur_ht                 -- numeric, calculé à la signature : estimated_amount × commission_percent / 100
  commission_status                 -- enum: 'not_applicable' | 'due' | 'paid'
  commission_paid_at
  -- Récap PDF (cf. 3.28)
  recap_pdf_url                     -- chemin Supabase Storage du PDF de bienvenue, nullable jusqu'à signature
  recap_pdf_generated_at
  -- Suivi
  probability                       -- int (0-100)
  expected_close_date
  notes
  owner_id                          -- fk users
  sellsy_opportunity_id
  created_at
  updated_at
  last_activity_at

addon_options                       -- options des DDP (3.5)
  id (uuid, pk)
  season_id (fk seasons)            -- cf. 3.15
  code                              -- ex: 'electrical_6kw', 'wifi_sponsor', 'logo_gold'
  name_fr
  name_en
  description_fr
  description_en
  category                          -- 'logistique' | 'audiovisuel' | 'connectivite' | 'espaces' | 'visibilite' | 'communication' | 'goodies'
  scope                             -- enum: 'prs_only' | 'mds_only' | 'both'
  price_eur_ht                      -- numeric (le tarif est identique PRS/MDS pour la plupart des options)
  unit                              -- ex: 'unit', 'per_brand', 'per_1000'
  sellsy_sku                        -- ex: 'OPT_LOGO_GOLD' (cf. 8.1bis)
  is_active
  display_order

pricing_tiers                       -- 3 packs × 2 catégories × N saisons
  id (uuid, pk)
  season_id (fk seasons)            -- cf. 3.15
  pack_code                         -- enum: 'ACCESS' | 'CLASSIC' | 'PREMIUM'
  category                          -- enum: 'prs_exhibitor' | 'standard'
  price_eur_ht                      -- ex: ACCESS standard = 12500, ACCESS prs = 1980
  description_short_fr              -- pour affichage carte tarif
  description_short_en
  description_full_fr               -- contenu détaillé
  description_full_en
  pole_restrictions                 -- array fk poles, nullable (null = applicable à tous)
  sellsy_sku                        -- ex: 'PACK_ACCESS_MDS' (cf. 8.1bis)
  is_active

booth_inventory                     -- emplacements physiques (miroir Canva)
  id (uuid, pk)
  season_id (fk seasons)            -- cf. 3.15
  event                             -- enum: 'paris' | 'marseille' | 'bruxelles'
  pole_id                           -- fk poles
  room                              -- ex: 'Salle Le Nôtre'
  code                              -- ex: 'P-LN-A12'
  label
  surface_m2                        -- numeric
  pack_code                         -- enum: 'ACCESS' | 'CLASSIC' | 'PREMIUM'
  status                            -- enum: 'available' | 'option' | 'reserved' | 'signed'
  reserved_for_company_id           -- fk companies, nullable
  option_expires_at                 -- timestamp, nullable (verrou optimiste cf. 3.10)
  notes_internal
  created_at
  updated_at

activities                          -- timeline (audit trail)
  id (uuid, pk)
  prospect_id (fk)
  type                              -- enum (voir 4.5)
  title
  body
  metadata jsonb
  user_id                           -- nullable si automatique
  created_at

sync_logs                           -- traçabilité API
  id (uuid, pk)
  entity_type                       -- 'company' | 'contact' | 'prospect'
  entity_id (uuid)
  target                            -- enum: 'sellsy' | 'brevo' | 'connectonair'
  operation                         -- enum: 'create' | 'update' | 'pull' | 'check'
  status                            -- enum: 'success' | 'pending' | 'error'
  error_message
  payload jsonb
  created_at

public_signup_attempts              -- tentatives, avant double opt-in
  id (uuid, pk)
  email
  email_domain
  email_validation_status           -- enum: 'valid' | 'free_provider' | 'disposable' | 'domain_mismatch'
  company_name_input
  matched_company_id                -- nullable
  is_new_company                    -- bool
  ai_classification jsonb           -- { pole_code, confidence, reasoning } si nouvelle société
  derived_category                  -- enum: 'prs_exhibitor' | 'standard' | 'non_eligible'
  contact_first_name
  contact_last_name
  contact_role
  contact_phone
  affiliate_id                      -- fk affiliates, nullable (cf. 3.13)
  affiliate_input_raw               -- texte brut saisi par l'utilisateur (avant matching)
  language                          -- 'fr' | 'en' (langue choisie sur le formulaire — cf. 3.9)
  marketing_consent                 -- bool (case "newsletter" optionnelle — cf. 3.16 RGPD)
  cgv_accepted_at                   -- timestamp (acceptation CGV à la signature — cf. 3.16)
  cgv_version                       -- numéro de version des CGV au moment de l'acceptation
  verification_token                -- uuid pour le lien email
  verification_sent_at
  verified_at                       -- nullable
  ip_address
  user_agent
  utm_source / utm_medium / utm_campaign
  converted_to_prospect_id          -- fk prospects, nullable
  status                            -- enum: 'awaiting_verification' | 'verified' | 'expired' | 'rejected' | 'converted'
  created_at

app_settings                        -- key/value pour config dynamique (cf. section 3.12)
  key (text, pk)
  value jsonb
  description                       -- court texte pour l'UI admin
  category                          -- 'finance' | 'rgpd' | 'integrations' | 'general'
  updated_by_user_id                -- fk users
  updated_at

exhibitor_sessions                  -- sessions magic-link Espace Exposant (cf. 3.11)
  id (uuid, pk)
  contact_id (fk contacts)
  token                             -- uuid single-use pour magic link
  sent_to_email
  sent_at
  used_at                           -- nullable
  expires_at                        -- TTL 24h pour le lien, session 30j après usage
  user_agent
  ip_address
  created_at

exhibitor_resources                 -- contenu éditable du backoffice (guide, infos pratiques)
  id (uuid, pk)
  slug                              -- 'guide_exposant' | 'infos_pratiques' | 'logistique'
  title_fr
  title_en
  body_fr (text)                    -- Markdown
  body_en (text)
  is_published
  display_order
  updated_by_user_id
  updated_at

sellsy_products_mirror              -- miroir local du catalogue produit Sellsy (cf. 8.1)
  sellsy_product_id (text, pk)
  sku                               -- ex: 'PACK_ACCESS_MDS', 'OPT_LOGO_GOLD'
  internal_ref                      -- 'pricing_tier:<id>' | 'addon_option:<id>'
  name_fr
  name_en
  unit_price_eur_ht
  vat_rate_percent
  is_active
  last_synced_at

affiliates                          -- apporteurs d'affaires (cf. 3.13)
  id (uuid, pk)
  display_name                      -- ex: 'Broadcast Associés'
  display_name_normalized           -- pour matching fuzzy (lowercase + sans accents)
  contact_first_name
  contact_last_name
  contact_email
  contact_phone
  company_id                        -- fk companies, nullable (rempli si affilié = société exposante)
  token                             -- chaîne aléatoire courte (nanoid 10)
  commission_percent                -- numeric 0..100, défaut 0
  notes_internal
  is_active
  created_by_user_id                -- fk users, nullable (null si auto-créé via le formulaire)
  created_at
  updated_at

affiliate_clicks                    -- tracking des clics sur liens d'affiliation
  id (uuid, pk)
  affiliate_id (fk)
  ip_address
  user_agent
  referrer
  utm_source / utm_medium / utm_campaign
  resulted_in_signup_id             -- fk public_signup_attempts, nullable
  created_at

audit_log                           -- traçabilité actions admin (cf. 3.16.1)
  id (uuid, pk)
  user_id                           -- fk users
  action                            -- 'create' | 'update' | 'delete' | 'login' | 'rgpd_rtbf' | 'rgpd_export' | 'sync_manual'
  entity_type                       -- ex: 'prospect', 'company', 'app_settings'
  entity_id (uuid)
  before jsonb                      -- état avant
  after jsonb                       -- état après
  ip_address
  user_agent
  created_at

stripe_events_processed             -- idempotence webhooks Stripe (cf. 3.10)
  event_id (text, pk)               -- ex: 'evt_1Abc...'
  event_type                        -- 'checkout.session.completed', etc.
  prospect_id (fk prospects, nullable)
  payload jsonb                     -- snapshot du payload Stripe pour audit
  processed_at

chat_conversations                  -- sessions de chat IA (cf. 3.22)
  id (uuid, pk)
  user_id                           -- fk users (admin/sales) OU fk contacts (partenaire)
  user_type                         -- enum: 'admin' | 'sales' | 'partner'
  title                             -- résumé auto de la conversation (généré après 3+ messages)
  message_count
  total_tokens_used                 -- input + output cumulés
  estimated_cost_eur                -- coût total Anthropic
  started_at
  last_message_at
  archived

chat_messages
  id (uuid, pk)
  conversation_id (fk)
  role                              -- enum: 'user' | 'assistant' | 'tool_use' | 'tool_result'
  content jsonb                     -- texte ou outil (avec name, input, output)
  model_used                        -- 'claude-haiku-4-5' | 'claude-sonnet-4-6'
  tokens_input
  tokens_output
  created_at

reminders                           -- rappels créés via assistant ou manuellement
  id (uuid, pk)
  user_id (fk users)                -- propriétaire du rappel
  prospect_id (fk prospects, nullable)
  company_id (fk companies, nullable)
  title
  body
  due_at                            -- timestamp
  reminded_at                       -- timestamp où la notif a été envoyée
  completed_at
  type                              -- enum: 'call_back', 'send_email', 'follow_up', 'check_payment', 'meeting', 'other'
  source                            -- 'manual' | 'ai_assistant'
  created_at

sellsy_events_processed             -- idempotence webhooks Sellsy (cf. 3.24)
  event_id (text, pk)
  event_type                        -- 'quote.accepted', 'invoice.paid', etc.
  prospect_id (fk prospects, nullable)
  payload jsonb
  processed_at

email_campaigns                     -- mass email depuis l'admin (cf. 3.29)
  id (uuid, pk)
  created_by_user_id (fk users)
  name                              -- ex: 'Annonce dates salon J-180'
  subject_fr / subject_en
  body_fr / body_en (text)          -- Markdown
  attachments_urls                  -- array
  target_filter jsonb               -- ex: { status: ['signe'], pole: 'AUDIO_RADIO', language: 'fr' }
  recipient_count                   -- snapshot au moment de l'envoi
  brevo_campaign_id                 -- id côté Brevo après envoi
  status                            -- enum: 'draft' | 'scheduled' | 'sending' | 'sent' | 'archived' | 'cancelled'
  scheduled_at
  sent_at
  open_count
  click_count
  unsubscribe_count
  bounce_count
  created_at

mcp_tokens                          -- tokens d'accès au MCP server (cf. 3.23)
  id (uuid, pk)
  user_id (fk users)                -- propriétaire du token
  name                              -- ex: 'Cowork Phil iMac', 'Cowork MacBook'
  token_hash                        -- bcrypt hash (le token brut n'est jamais stocké)
  prefix                            -- 8 premiers caractères (pour identification UI : 'mds_pat_aB3x...')
  scopes                            -- array text : ['mcp:read', 'mcp:read:finance']
  expires_at                        -- timestamp, nullable (par défaut 1 an)
  last_used_at                      -- dernier appel reçu
  last_used_ip
  call_count                        -- compteur d'appels
  revoked_at
  created_at

company_profiles                    -- profil enrichi exposant (cf. 3.14)
  id (uuid, pk)
  company_id (fk, unique)
  logo_url                          -- chemin Supabase Storage
  description_fr (text)             -- Markdown
  description_en (text)
  tagline_fr
  tagline_en
  linkedin_url
  website                           -- peut différer de companies.website
  social_networks jsonb             -- [{ platform, url }, ...]
  keywords                          -- array text
  public_contacts jsonb             -- [{ first_name, last_name, role, email_public, phone_public }, ...]
  attachments jsonb                 -- [{ type, url, filename, size_bytes }, ...]
  completion_status                 -- enum: 'empty' | 'in_progress' | 'profil_complet'
  last_updated_by                   -- 'exhibitor' | 'admin'
  updated_at
```

### 4.2 Politiques d'accès (RLS)

- **Tables admin** (`prospects`, `companies`, `contacts`, `activities`, `sync_logs`, `prs_2026_exhibitors`, `addon_options`, `pricing_tiers`, `booth_inventory`, `app_settings`) : R/W pour `users.role IN ('admin', 'sales')`.
- **`public_signup_attempts`** : `INSERT` anonyme autorisé ; `UPDATE` partiel anonyme (vérification token) ; `SELECT/UPDATE` complet pour admins.
- **`poles`** : lecture publique anonyme, écriture admin.
- **`users`** : `SELECT` authentifiés, `UPDATE` sur sa propre ligne.

### 4.3 Codes pack (alignés DDP)

```typescript
type PackCode = 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR';
```

### 4.4 Types d'activité

```
'note', 'email_sent', 'email_received', 'call', 'meeting',
'devis_sent', 'devis_signed',
'web_signup_attempt', 'web_signup_verified',
'company_classified', 'category_assigned',
'sync_sellsy', 'sync_brevo', 'sync_connectonair',
'booth_reserved', 'booth_released'
```

---

## 5. Écrans

### 5.1 Espace admin (authentifié)

| Écran | Route | Description |
|---|---|---|
| Connexion | `/login` | Email + password ou magic link |
| Dashboard | `/` | KPIs globaux + table prospects |
| Liste prospects | `/prospects` | Filtres (statut, source, salon, pôle, catégorie, owner), recherche, tri, export CSV |
| Fiche prospect | `/prospects/[id]` | Détails + société + contacts + timeline + synchros + emplacement + options |
| Liste sociétés | `/companies` | Liste + filtre par pôle/catégorie + reclassement manuel |
| Fiche société | `/companies/[id]` | Détails + contacts liés + historique prospects + reclassement |
| Inscriptions web | `/signups` | File à qualifier (awaiting / verified / rejected) |
| **+ Nouveau devis (concierge)** | `/admin/quotes/new` | Création devis Sellsy en direct depuis rendez-vous client — cf. 3.21 |
| **🤖 Assistant IA** | `/admin/assistant` (+ widget flottant partout) | Chat avec accès DB + outils (rappels, propositions, recherche) — cf. 3.22 |
| **⏰ Rappels** | `/admin/reminders` | File des rappels en cours / échus / faits — cf. 3.22.2 |
| **🔌 Tokens MCP** | `/admin/mcp-tokens` | Gestion des tokens pour Cowork / clients MCP externes — cf. 3.23 |
| **📈 Reporting** | `/admin/reports` | Funnel + perf commerciale + évolution + export PDF mensuel — cf. 3.26 |
| **📨 Campagnes email** | `/admin/campaigns` | Composer + cibler + envoyer des campagnes Brevo depuis l'app — cf. 3.29 |
| Inventaire emplacements | `/booths` | Vue tableur du plan d'implantation par salon/pôle |
| Plan Canva | `/booths/plan` | iframe Canva embeddée |
| Pôles | `/admin/poles` | Lecture seule (les 6 pôles sont figés v2.1) |
| Tarifs | `/admin/pricing` | CRUD `pricing_tiers` et `addon_options` |
| Catalogue Sellsy | `/admin/sellsy-products` | Vue du miroir des produits Sellsy + bouton "synchroniser maintenant" |
| Exposants PRS | `/admin/prs-exhibitors` | Import CSV + édition manuelle |
| **Affiliés / sourcing** | `/admin/affiliates` | CRUD apporteurs d'affaires + génération lien + QR code + tracking conversions (cf. 3.13) |
| **Profils exposants** | `/admin/exhibitors-profiles` | Vue de complétude des profils + édition admin de chaque profil exposant (cf. 3.14) |
| Ressources exposant | `/admin/exhibitor-resources` | CRUD `exhibitor_resources` (guide exposant, infos pratiques, etc.) en FR + EN |
| **Préférences** | `/admin/preferences` | Réglages éditables (acompte %, RGPD, intégrations, feature flags, saison active, mode test, etc.) — cf. 3.12, 3.19, 3.20 |
| **Saisons** | `/admin/seasons` | Gestion des éditions (créer, archiver, dupliquer) — cf. 3.15 |
| Utilisateurs | `/admin/users` | Gestion comptes admin + commerciale (avec 2FA — cf. 9.1) |
| Logs sync | `/admin/sync-logs` | Historique des appels API (Sellsy, Brevo, Connectonair, Stripe) |
| **Audit log** | `/admin/audit-log` | Traçabilité actions admin sensibles — cf. 3.16.1 |

### 5.2 Espace public

| Écran | Route | Description |
|---|---|---|
| Accueil public | `/{locale}` | Page d'accueil minimaliste (logo MD + 2 CTA : "S'inscrire comme exposant" / "Espace Exposant") |
| Étape 1 — Pré-qualification | `/{locale}/inscription-exposant` | Email + société (auto-complete) + nom/prénom + fonction + téléphone. **Aucun tarif affiché.** |
| Email de confirmation | (envoyé) | Lien unique avec token |
| Étape 2A — Formulaire détaillé (catégorie OK) | `/{locale}/inscription-exposant/[token]` | Tarifs + emplacements + options + plan Canva + choix parcours paiement (4 options) |
| Étape 2B — Prise de contact (non éligible) | `/{locale}/inscription-exposant/[token]` | Pas de tarifs ; champ message libre |
| Stripe Checkout | (externe) | Page hébergée Stripe pour les parcours `*_acompte` ou `facture_integrale` |
| Confirmation finale | `/{locale}/inscription-exposant/merci` | Page de remerciement |
| Mentions légales | `/{locale}/mentions-legales` | Contenu depuis `app_settings.legal_mentions_*` |
| Politique de confidentialité | `/{locale}/politique-confidentialite` | Contenu depuis `app_settings.privacy_policy_*` |
| **CGV** | `/{locale}/cgv` | Contenu depuis `app_settings.cgv_*` — acceptation tracée à la signature (`public_signup_attempts.cgv_accepted_at`) |

### 5.3 Espace Exposant (auth magic link, cf. 3.11)

| Écran | Route | Description |
|---|---|---|
| Connexion | `/{locale}/espace-exposant/connexion` | Saisie email → magic link Brevo |
| Tableau de bord | `/{locale}/espace-exposant` | Résumé commande + état paiement + accès ressources |
| Détail commande | `/{locale}/espace-exposant/commande` | Pack + emplacement + options + factures Sellsy téléchargeables |
| **Profil exposant** | `/{locale}/espace-exposant/profil` | Logo, description, LinkedIn, réseaux sociaux, contacts publics (cf. 3.14) |
| Ressources | `/{locale}/espace-exposant/ressources` | Guide exposant, infos pratiques, logistique |
| Options supplémentaires | `/{locale}/espace-exposant/options-supplementaires` | Catalogue d'addons commandables (génère un nouveau devis Sellsy) |
| **Affiliation** *(si applicable)* | `/{locale}/espace-exposant/affiliation` | Lien d'affiliation perso + QR code + dashboard apports d'affaires (cf. 3.13.4) |
| **🤖 Assistant** | `/{locale}/espace-exposant/assistant` (+ widget flottant) | Chat IA contextualisé (PRS ou MDS selon catégorie) — cf. 3.22 |
| Contact équipe | `/{locale}/espace-exposant/contact` | Formulaire direct vers Phil + commerciale |

---

## 6. Flux d'inscription publique (détaillé)

### Étape 1 — Pré-qualification

1. Visiteur arrive sur `/inscription-exposant`.
2. Saisit : `email`, `nom_societe` (avec auto-complete dès 2 lettres), `prenom`, `nom`, `fonction`, `telephone` (optionnel), **`affiliate_input`** (optionnel — *"Venez-vous de la part de quelqu'un ?"* avec auto-complete sur `affiliates.display_name`, ou pré-rempli/verrouillé si arrivée via `?ref=TOKEN`).
3. Submit → `POST /api/signup/init` :

   **a. Validation email**
   - Format valide ?
   - Domaine non dans `free-email-domains` ?
   - Domaine non dans `disposable-email-domains` ?
   - Si KO : retour erreur avec message clair.

   **b. Lookup société**
   - Si l'utilisateur a sélectionné une suggestion d'auto-complete : `matched_company_id` connu, on saute la classification IA.
   - Sinon, fuzzy match sur `companies.name_normalized` :
     - Si match avec score > 0.85 : on propose une confirmation côté UI ("Voulez-vous dire **NRJ Group** ?").
     - Si match société existante avec domaine ≠ `primary_domain` (et pas dans `alternate_domains`) → refus `domain_mismatch`.
     - Sinon → société nouvelle, déclencher classification IA.

   **c. Classification IA (si nouvelle société)**
   - Appel Claude API (modèle `claude-haiku-4-5`).
   - Sortie : `{ pole_code, confidence, reasoning }`.
   - `confidence >= 0.7` → on stocke le pôle ; sinon → pôle = `INCONNU`.

   **d. Détermination de la catégorie**
   - Société existante avec `was_prs_2026_exhibitor = true` → `prs_exhibitor`.
   - Nouvelle société dont le nom matche `prs_2026_exhibitors` (fuzzy) → `prs_exhibitor` + flag.
   - Pôle = `INCONNU` → `non_eligible`.
   - Sinon → `standard`.

   **e. Résolution affiliation** (si `affiliate_input` rempli ou cookie `ref` présent) :
   - Si arrivée via lien `?ref=TOKEN` → `affiliate_id` connu, on saute le matching.
   - Sinon, fuzzy match sur `affiliates.display_name_normalized` (Levenshtein ≤ 2 ou similarity > 0.7).
     - Match trouvé → on lie au `affiliate_id`.
     - Pas de match → création auto d'un nouvel `affiliate` (`commission_percent = 0`, token généré, `created_by_user_id = null`). Phil pourra l'éditer plus tard.

   **f. Création `public_signup_attempts`** (tout est tracé : email, classification, catégorie, affiliation).

   **g. Envoi email de vérification** (Brevo) avec lien `/inscription-exposant/[token]` (TTL configurable via `app_settings.signup_token_ttl_hours`).

4. Page de retour : *"Merci. Un lien de confirmation a été envoyé à [email]. Cliquez dessus pour accéder à votre espace exposant."*

### Étape 2 — Confirmation et formulaire détaillé

1. Clic sur le lien dans l'email → token vérifié → `verified_at = now()`.
2. **Branchement selon `derived_category`** :

   **Cas A — `prs_exhibitor` ou `standard`** :
   - Charge `pricing_tiers` filtrés par `category` (3 packs visibles avec tarif correspondant).
   - Charge `addon_options` filtrées par `scope` (`prs_only`/`both` si PRS, `mds_only`/`both` sinon).
   - Charge `booth_inventory` du pôle de la société, statut `available`, salons sélectionnables.
   - Bouton "Voir le plan d'implantation" → modal avec iframe Canva.
   - Affichage : choix salons / pack / emplacement / options (multi-select) / message libre.
   - Submit → conversion en `prospect` (booth passe en `option`), création société si nouvelle, sync Sellsy + Brevo.

   **Cas B — `non_eligible`** :
   - Pas de tarifs ni d'emplacements.
   - Texte : *"Votre profil ne correspond pas à un pôle exposant identifié. Laissez-nous un message — notre équipe reviendra vers vous rapidement."*
   - Champ message libre + envoi.
   - Submit → `prospect` avec `status = 'lead'` + tag `non_eligible`, sync Sellsy/Brevo en mode "à qualifier".

3. Redirection vers `/inscription-exposant/merci`.

### Schéma synthétique

```
[Saisie email + société + auto-complete]
        │
        ▼
[POST /api/signup/init]
        │
        ├─► email pro ?  ─NON─► Refus
        │
        ├─► auto-complete cliqué ?  ─OUI─► utilise matched_company_id
        │
        ├─► société existe en base ?
        │     ├─ OUI: domaine match ? ─NON─► Refus
        │     │     └─ OUI: hérite catégorie + pôle
        │     └─ NON: classification IA
        │           ├─ confidence ≥ 0.7: créer company avec pôle
        │           └─ confidence < 0.7: pôle=INCONNU, catégorie=non_eligible
        │
        ├─► déterminer catégorie tarifaire
        │
        ▼
[Création public_signup_attempts + envoi mail Brevo DOI]
        │
        ▼
[Clic lien]
        │
        ├─ Cas A: formulaire complet (tarifs + emplacements + options + plan Canva)
        └─ Cas B: message neutre + champ libre
        │
        ▼
[Submit] → prospect → sync Sellsy + Brevo + Connectonair
```

---

## 7. Classification IA des sociétés

### 7.1 Prompt système

```
Tu es un classificateur de sociétés pour le salon B2B "MediaDays Solutions 2026"
(Carrousel du Louvre, Paris).

Pour chaque société, retourne le pôle thématique parmi :

- REGIES_RETAIL_MEDIA : régies pub, éditeurs, retailers, agences créa, annonceurs, UDECAM
- AUDIO_RADIO : radios diffuseurs, plateformes audio, podcast networks, solutions audio pour radios
- DIFFUSION_INFRA : cloud broadcast, CDN, transport contenu, opérateurs FM/DAB+, infrastructure broadcast
- VIDEO_CTV : distribution vidéo, monétisation CTV, analytics vidéo, production vidéo pro
- OUTDOOR_DOOH : tech DOOH, programmatique outdoor, solutions d'affichage
- DATA_ADTECH : adtech, DSP/SSP, data, mesure d'audience, IA marketing, retail media tech
- INCONNU : société qui ne correspond clairement à aucun pôle ci-dessus

Réponds STRICTEMENT en JSON :
{ "pole_code": "<code>", "confidence": <0..1>, "reasoning": "<une phrase>" }

Sois sévère sur la confiance : ne dépasse 0.7 que si tu es certain.
Dans le doute, retourne "INCONNU" avec confidence = 0.
```

### 7.2 Prompt utilisateur

```
Société : {company_name}
Domaine email : {email_domain}
Site web : {website_url ou "non fourni"}
Description : {short_desc ou "non fournie"}
```

### 7.3 Coût

- Modèle : `claude-haiku-4-5` (rapide, économique).
- ~500-800 tokens / appel, < 0,001 € / inscription.
- Fallback : si l'API échoue, `pole = INCONNU`, catégorie `non_eligible`.

### 7.4 Reclassement manuel

L'admin peut forcer un pôle sur la fiche société (`/companies/[id]`) — `pole_classified_by = 'manual'`.

---

## 8. Intégrations API

### 8.1 Sellsy — source de vérité facturation et catalogue produits

> **Principe** : tous les documents financiers (devis, pro-forma, factures) sont émis dans Sellsy. L'app Prospection les *commande* via API, mais ne les stocke jamais elle-même. Sellsy est aussi la **source de vérité du catalogue produit** (packs + options) — la plateforme se synchronise dessus.

- **Auth** : OAuth 2 ou clé API. Variables : `SELLSY_CLIENT_ID`, `SELLSY_CLIENT_SECRET`, `SELLSY_API_KEY`.
- **Endpoints utilisés** :
  - `POST /companies` → créer entreprise prospect
  - `POST /contacts` → créer contact
  - `POST /opportunities` → créer deal (description = pack + options + emplacement choisi)
  - `POST /opportunities/{id}/quotes` → émettre **devis**
  - `POST /invoices` (status `proforma`) → émettre **facture pro-forma**
  - `POST /invoices` (status `final`) → émettre **facture définitive** (à la signature OU directement pour parcours `facture_integrale`)
  - `POST /payments` → enregistrer un paiement (acompte ou intégral) contre un devis ou une facture
  - `PATCH /opportunities/:id` → update statut
  - `GET /catalogue/items` → **récupérer le catalogue produits Sellsy** (sync vers `sellsy_products_mirror`)
- **Mapping `payment_path` → document Sellsy** :
  - `devis_sepa` (par défaut) ou `devis_acompte_stripe` → `POST /opportunities/{id}/quotes` avec RIB en pied de page
  - `proforma_acompte` → `POST /invoices` avec `status = proforma`
  - `facture_integrale` → `POST /invoices` avec `status = final` (immédiat)
- **Sync bancaire Sellsy (Powens)** : pour le parcours `devis_sepa`, c'est Sellsy qui détecte les virements reçus sur le compte bancaire MediaDays via sa connexion Powens (intégration native Sellsy). Le rapprochement automatique entre virement et devis se fait sur le **libellé** (référence du devis) ou le **montant exact**. Sellsy émet alors un webhook `invoice.paid` ou `quote.accepted` que l'app reçoit (cf. 3.24). Pas de code custom à écrire côté app — juste la config initiale côté Sellsy par Phil.
- **Tags Sellsy par pôle** (validé avec Phil) : 1 tag dédié par pôle, à appliquer automatiquement sur la company Sellsy. Le mapping `pole_code` → `sellsy_tag_id` est stocké dans `app_settings.sellsy_pole_tag_map`. Tag additionnel automatique : si `category = 'prs_exhibitor'` → tag `tarif_prs_2026`.
- **Réconciliation paiement** : à réception du webhook Stripe `checkout.session.completed`, l'app appelle `POST /payments` Sellsy pour rattacher le montant à la pièce concernée (en utilisant `prospect.sellsy_devis_id` ou `prospect.sellsy_proforma_id` ou `prospect.sellsy_invoice_id`).
- **Bilingue** : Sellsy supporte les langues de contact (FR/EN). On envoie systématiquement les documents dans la langue de `contacts.language`. **À configurer côté Sellsy** : modèles PDF de devis et facture en version FR ET EN.

### 8.1bis Synchronisation produits Sellsy ↔ plateforme

**Pourquoi** : éviter que les tarifs ou libellés de la plateforme divergent du catalogue Sellsy (ce qui cassrait la facturation). Une seule source de vérité catalogue : Sellsy.

**Mécanisme** :
1. Côté Sellsy, Phil crée chaque produit (packs ACCESS/CLASSIC/PREMIUM × 2 catégories + 18 options additionnelles) avec un **SKU stable** (ex. `PACK_ACCESS_MDS`, `OPT_LOGO_GOLD`).
2. La plateforme synchronise via `GET /catalogue/items` :
   - Soit déclenchée manuellement (bouton "Synchroniser maintenant" dans `/admin/sellsy-products`)
   - Soit via cron quotidien (Vercel Cron Job)
3. Les résultats sont stockés dans `sellsy_products_mirror`.
4. Les tables `pricing_tiers` et `addon_options` ont une colonne `sellsy_sku` qui fait le pont.
5. Au moment d'émettre un devis/facture, la plateforme passe les `sellsy_product_id` correspondants — Sellsy gère lui-même les libellés et prix.

**Affichage côté plateforme** : les libellés et prix montrés à l'utilisateur viennent de la plateforme (tables `pricing_tiers` / `addon_options`), mais un check de cohérence est fait avec `sellsy_products_mirror`. Si un écart est détecté, alerte sur `/admin/sellsy-products` avec bouton "réconcilier".

### 8.2 Brevo

- **Auth** : `BREVO_API_KEY`.
- **Listes Brevo à créer** :
  - "MDS 2026 — Inscriptions web non vérifiées"
  - "MDS 2026 — Inscriptions web vérifiées"
  - "MDS 2026 — Pôle 🏛️ Régies & Retail Media"
  - "MDS 2026 — Pôle 🎙️ Audio & Radio"
  - "MDS 2026 — Pôle 📡 Diffusion & Infra"
  - "MDS 2026 — Pôle 🎥 Vidéo & CTV"
  - "MDS 2026 — Pôle 📢 Outdoor & DOOH"
  - "MDS 2026 — Pôle 📊 Data & Adtech"
  - "MDS 2026 — Exposants PRS éligibles tarif préférentiel"
  - "MDS 2026 — Signés"
  - "MDS 2026 — Demandes non éligibles"
- **Templates Brevo (en double FR / EN)** :
  - `doi_fr` / `doi_en` — double opt-in avec lien `[token]`
  - `welcome_tarifs_fr` / `welcome_tarifs_en` — Cas A (tarifs + lien plan Canva)
  - `welcome_contact_fr` / `welcome_contact_en` — Cas B (prise de contact)
  - `acompte_paid_fr` / `acompte_paid_en` — confirmation acompte encaissé
  - `signed_fr` / `signed_en` — post-signature finale
- **Bilingue** : la langue choisie côté formulaire (`public_signup_attempts.language`) est répliquée dans `contacts.language` ; tous les emails partent dans cette langue.

### 8.3 Connectonair — enrichissement en lecture seule

> **Périmètre clarifié** (v2.3) : Connectonair sert **uniquement à importer** des informations dans notre base. **Aucun push** depuis la plateforme vers Connectonair.

- **Variables** : `CONNECTONAIR_API_BASE_URL`, `CONNECTONAIR_API_KEY`.
- **Clé d'identification unique** : l'**email du contact** (pas le nom de société, qui peut diverger entre les deux bases).
- **Opérations** :
  - `GET /contacts?email=<email>` → récupérer la fiche d'un contact si elle existe dans Connectonair
  - `GET /companies?id=<id>` → récupérer les infos enrichies de la société liée
- **Cas d'usage** :
  1. À la qualification d'un signup ou à la création manuelle d'un prospect, on appelle Connectonair par email pour enrichir automatiquement : société, fonction, historique salons, langue, etc.
  2. Bouton "Enrichir depuis Connectonair" sur la fiche société/contact admin pour rappel manuel.
- **Stockage** : les données récupérées sont stockées dans les colonnes existantes (`companies`, `contacts`) avec `source = 'connectonair_enrichment'` dans les `activities`.
- **Pas de bidirectionnel** : si une donnée est modifiée côté plateforme, elle ne remonte **pas** vers Connectonair. Connectonair reste maître de ses propres données ; nous l'utilisons comme source d'enrichissement, comme on utiliserait un Clearbit ou un Dropcontact.

### 8.4 Plan Canva

- Pas d'API automatisée (Canva n'expose pas un endpoint "stand X est libre").
- Source de vérité = `booth_inventory` en base.
- Lien public Canva (`https://canva.link/md26plan`) embeddé en iframe pour visualisation.
- Phil maintient les deux en parallèle. À envisager en P5 : import CSV depuis un export Canva pour resync.

---

## 9. Authentification

### 9.1 Côté admin

- Supabase Auth (email + password ou magic link).
- **2FA TOTP recommandé** pour les comptes admin (Supabase Auth supporte nativement). Activable depuis `/admin/users`. Obligatoire pour `role = 'admin'` à partir de la P5.
- Création des comptes admin manuellement via dashboard Supabase ou `/admin/users`.
- Rôles : `admin` (Phil, full access) et `sales` (commerciale, accès pipeline + exposants, pas accès `/admin/preferences` ni `/admin/audit-log`).
- Middleware Next.js → redirige `/login` si non authentifié.

### 9.2 Côté public (formulaire d'inscription)

- Pas d'auth.
- Anti-spam : honeypot + rate limiting (3 tentatives/heure/IP) + reCAPTCHA v3 si abus.
- Double opt-in obligatoire avant accès au formulaire détaillé.
- Token verification : TTL configurable via `app_settings.signup_token_ttl_hours` (défaut 48h), single-use.

### 9.3 Côté Espace Exposant (magic link)

- **Pas de mot de passe** : authentification exclusivement par magic link envoyé sur l'email.
- L'utilisateur saisit son email sur `/espace-exposant/connexion` → l'app vérifie qu'au moins un `prospect` rattaché à cet email a `status IN ('acompte_paye', 'signe')` → envoi d'un magic link Brevo.
- Token stocké dans `exhibitor_sessions` (TTL 24h pour le clic, session 30j après usage).
- À l'usage : création d'une session Supabase Auth dédiée, scope = "exhibitor".
- Les routes `/espace-exposant/**` sont protégées par middleware exhibitor (différent du middleware admin).
- Si l'email saisi ne correspond à aucun contact d'exposant payé : pas d'erreur explicite (anti-énumération), simple message *"Si votre email est rattaché à un exposant, vous recevrez un lien de connexion."*

---

## 10. Variables d'environnement

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Sellsy
SELLSY_CLIENT_ID=
SELLSY_CLIENT_SECRET=
SELLSY_API_KEY=

# Brevo
BREVO_API_KEY=
BREVO_LIST_ID_AWAITING=
BREVO_LIST_ID_VERIFIED=
BREVO_LIST_ID_PRS_ELIGIBLE=
BREVO_LIST_ID_SIGNED=
BREVO_LIST_ID_NON_ELIGIBLE=
BREVO_LIST_ID_POLE_REGIES_RETAIL_MEDIA=
BREVO_LIST_ID_POLE_AUDIO_RADIO=
BREVO_LIST_ID_POLE_DIFFUSION_INFRA=
BREVO_LIST_ID_POLE_VIDEO_CTV=
BREVO_LIST_ID_POLE_OUTDOOR_DOOH=
BREVO_LIST_ID_POLE_DATA_ADTECH=
BREVO_TEMPLATE_DOI_FR=
BREVO_TEMPLATE_DOI_EN=
BREVO_TEMPLATE_WELCOME_TARIFS_FR=
BREVO_TEMPLATE_WELCOME_TARIFS_EN=
BREVO_TEMPLATE_WELCOME_CONTACT_FR=
BREVO_TEMPLATE_WELCOME_CONTACT_EN=
BREVO_TEMPLATE_ACOMPTE_PAID_FR=
BREVO_TEMPLATE_ACOMPTE_PAID_EN=
BREVO_TEMPLATE_SIGNED_FR=
BREVO_TEMPLATE_SIGNED_EN=

# Stripe (encaissement acompte)
STRIPE_SECRET_KEY=                  # sk_live_... ou sk_test_...
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Sentry (monitoring)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# VAT VIES (vérification TVA intracommunautaire)
# L'API VIES est publique et gratuite, pas de clé. Endpoint : http://ec.europa.eu/taxation_customs/vies/services/checkVatService

# Sellsy webhooks (synchro inverse — cf. 3.24)
SELLSY_WEBHOOK_SECRET=

# NeverBounce (vérification deliverability — cf. 3.27)
NEVERBOUNCE_API_KEY=
NEVERBOUNCE_SANDBOX=false           # true en dev pour ne pas consommer le quota

# Connectonair (à compléter)
CONNECTONAIR_API_BASE_URL=
CONNECTONAIR_API_KEY=

# Anthropic (classification IA)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5

# Canva
NEXT_PUBLIC_CANVA_PLAN_URL=https://canva.link/md26plan

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=fr
NEXT_PUBLIC_SUPPORTED_LOCALES=fr,en

# App
NEXT_PUBLIC_APP_URL=https://mds-prospection.vercel.app

# Note : DEPOSIT_PERCENTAGE, SIGNUP_TOKEN_TTL_HOURS et beaucoup d'autres
# paramètres opérationnels sont stockés dans la table app_settings
# (cf. section 3.12) et éditables depuis /admin/preferences.
# Les env vars ci-dessus sont uniquement les secrets et les paramètres
# d'infrastructure pure (URLs, clés API, etc.).
```

---

## 11. Plan de développement

### Phase 0 — Setup infrastructure (avec multi-saison + audit dès le début)

- [x] Repo GitHub, clone local, bootstrap Next.js + TS + Tailwind, charte intégrée
- [ ] Création projet Supabase + récup URL/clés
- [ ] Migration SQL initiale (toutes les tables avec colonnes bilingues `_fr` / `_en`, FK `season_id`, `audit_log`, `stripe_events_processed`)
- [ ] Activer extension `pg_trgm` (pour auto-complete fuzzy)
- [ ] **Triggers Postgres pour audit_log** sur `prospects`, `companies`, `app_settings`
- [ ] Installation `next-intl` + structure `messages/fr.json` & `messages/en.json` + middleware locale
- [ ] **Création saison initiale `MDS_2026`** (active=true)
- [ ] Seed `poles` FR + EN (les 6 + INCONNU, depuis fichier maître xlsx) — transverses, sans season_id
- [ ] Seed `pricing_tiers` FR + EN (3 packs × 2 catégories, depuis DDP) → liés à saison MDS_2026
- [ ] Seed `addon_options` FR + EN (~17 options depuis DDP) → liés à saison MDS_2026
- [ ] Import CSV `prs_2026_exhibitors` (47 lignes depuis Prospection_MDS2026_v2.xlsx) → liés à saison
- [ ] Import CSV `companies` initial (853 sociétés depuis Prospection_MDS2026_v2.xlsx, avec `language`) — transverse
- [ ] Setup Anthropic API + test classification sur 5 sociétés
- [ ] shadcn/ui + thème MD (couleurs pôles + design tokens)
- [ ] **Sentry SDK** intégré (Next.js + Node)
- [ ] **Vercel Analytics** activé
- [ ] ESLint + Prettier + commitlint
- [ ] CI GitHub Actions (lint + typecheck + build)
- [ ] Déploiement Vercel + env vars (FR + EN par défaut)

**Critères d'acceptation P0** : build passe en CI, classification IA testée avec accuracy > 80%, routes `/fr/` et `/en/` accessibles, audit_log capture une création test, **Sentry reçoit un test event**, déploiement Vercel auto sur push.

### Phase 1 — Auth + Dashboard admin (squelette)

- [ ] Auth Supabase (login + middleware + logout)
- [ ] Layout admin (topbar logo MD + nav + avatar)
- [ ] Dashboard avec 4 KPIs (mock + réel quand dispo)
- [ ] Liste prospects basique (table responsive)
- [ ] Vues `/companies`, `/booths` en lecture
- [ ] `/booths/plan` avec iframe Canva
- [ ] Page `/styleguide` pour valider la charte
- [ ] Vue `/admin/pricing` lecture seule (KPI prix par pack)

**Critères P1** : admin connecté voit dashboard cohérent avec maquette, navigation fluide, plan Canva s'affiche.

### Phase 2 — CRUD pipeline complet (sans intégrations externes)

- [ ] CRUD `companies` (avec reclassement pôle manuel)
- [ ] CRUD `contacts` rattachés
- [ ] CRUD `prospects` avec timeline d'activités
- [ ] CRUD `booth_inventory`
- [ ] CRUD `addon_options` et `pricing_tiers`
- [ ] Filtres et recherche prospects (par pôle, catégorie, statut, salon)
- [ ] Auto-complete société (composant Combobox + endpoint `/api/companies/search`)
- [ ] Export CSV
- [ ] Import CSV `prs_2026_exhibitors` via UI

**Critères P2** : pipeline gérable A→Z manuellement, auto-complete fonctionnel.

### Phase 3 — Formulaire public + double opt-in + classification IA + i18n + RGPD

- [ ] Routes localisées `/fr/inscription-exposant` et `/en/inscription-exposant`
- [ ] Détection auto Accept-Language + toggle FR/EN visible
- [ ] Page étape 1 avec auto-complete société (FR + EN)
- [ ] Route `/api/signup/init` : validation email + lookup + classification IA + DOI Brevo (langue persistée)
- [ ] Page `/inscription-exposant/[token]` Cas A et Cas B (FR + EN)
- [ ] **Étape 2A en sous-étapes/accordéons** (Pack & Salons → Emplacement & Options → Paiement)
- [ ] **Verrou optimiste** sur `booth_inventory` à la sélection (status=option, expires_at = now+30min)
- [ ] **Cron** pour relâcher les options expirées (Vercel Cron Job)
- [ ] **Vérification VAT VIES** si pays ≠ FR (cf. 3.17)
- [ ] **CGV** comme page éditable + checkbox d'acceptation obligatoire à la signature
- [ ] **Consentement marketing** distinct du transactionnel (case optionnelle)
- [ ] Page `/inscription-exposant/merci` (FR + EN)
- [ ] Pages publiques `/{locale}/cgv`, `/{locale}/mentions-legales`, `/{locale}/politique-confidentialite`
- [ ] **Empty states + error states** sur tous les écrans clés (cf. maquette v2.4)
- [ ] Vue admin `/signups` (modération)
- [ ] Conversion signup → prospect (auto à la soumission étape 2)
- [ ] Embed Canva dans le formulaire Cas A
- [ ] Anti-spam (honeypot + rate limit, **hCaptcha** plutôt que reCAPTCHA pour RGPD)
- [ ] Templates Brevo FR + EN créés et liés

**Critères P3** : un visiteur réel s'inscrit (en FR ou EN), valide son email, voit les bons tarifs, accepte les CGV, choisit un emplacement (verrouillé 30 min), soumet, apparaît dans le pipeline admin. Si client UE non-FR : sa TVA est vérifiée VIES.

### Phase 4 — Intégrations Sellsy + Brevo + Stripe + Connectonair (read) + sync produits + notifs

- [ ] Sync Sellsy (création company + contact + opportunity + tag pôle)
- [ ] Émission Sellsy selon parcours :
  - [ ] `devis_differe` / `devis_acompte` → devis Sellsy
  - [ ] `proforma_acompte` → facture pro-forma
  - [ ] `facture_integrale` → facture définitive immédiate
- [ ] **Application autoliquidation TVA** sur factures Sellsy si `vat_verified = valid` et pays UE ≠ FR
- [ ] **Sync produits Sellsy → `sellsy_products_mirror`** (cron quotidien + bouton manuel sur `/admin/sellsy-products`)
- [ ] Liens `pricing_tiers.sellsy_sku` et `addon_options.sellsy_sku` posés
- [ ] Sync Brevo (upsert contact + ajout listes selon pôle/catégorie/langue/marketing_consent)
- [ ] **Intégration Stripe Checkout** pour les parcours `devis_acompte`, `proforma_acompte`, `facture_integrale`
- [ ] **Stripe Payment Links** pour le mode concierge admin (cf. 3.21)
- [ ] **Page admin `/admin/quotes/new`** (création devis 4 étapes : société → contact → offre → émission)
- [ ] **Templates Brevo `devis_concierge_fr`/`devis_concierge_en`** avec PDF Sellsy en pièce jointe
- [ ] **Webhook Stripe avec idempotence** (`stripe_events_processed` PK check) qui met à jour `acompte_status` + notifie Sellsy (`POST /payments`) — supporte Checkout ET Payment Links
- [ ] Émission facture définitive Sellsy à la signature finale (admin marque `signe`)
- [ ] **Notifications admin** sur événements clés (cf. 3.18) — Brevo email
- [ ] **Enrichissement Connectonair** (read-only par email) lors qualification + bouton "Enrichir" sur fiche
- [ ] Indicateurs de sync (badges) sur fiches
- [ ] Action "resynchroniser" manuelle
- [ ] **Auto-retry exponentiel** des syncs en échec (3 retries max)
- [ ] **Mode test/sandbox** opérationnel : prospects `is_test=true` ne déclenchent aucune sync externe
- [ ] **Webhooks inverse Sellsy** (cf. 3.24) : endpoint `/api/webhooks/sellsy`, vérif HMAC, idempotence via `sellsy_events_processed`
- [ ] **Vérification deliverability email** (cf. 3.27) via NeverBounce avant création prospect

**Critères P4** : un signup public peut payer (acompte ou intégral) par Stripe (idempotence garantie), l'argent arrive sur le compte, le document Sellsy est marqué payé (avec autoliquidation TVA si applicable), la fiche prospect passe en `acompte_paye` ou `signe` automatiquement, Phil reçoit un email de notif, catalogue Sellsy synchronisé.

### Phase 5 — Espace Exposant + préférences admin + pages légales + affiliation + profils

- [ ] Pages `/admin/preferences` (toutes catégories : finances, RGPD, intégrations, email, général)
- [ ] CRUD `app_settings` avec validation par catégorie
- [ ] Pages publiques `/{locale}/mentions-legales` et `/{locale}/politique-confidentialite` (rendu Markdown depuis settings)
- [ ] Bandeau cookies configurable
- [ ] Auth Espace Exposant (magic link Brevo + Supabase session scoped)
- [ ] Tableau de bord Exposant `/espace-exposant`
- [ ] Détail commande avec téléchargement factures Sellsy
- [ ] CRUD `exhibitor_resources` (admin) — guide, infos pratiques, logistique
- [ ] Page ressources Exposant (lecture)
- [ ] Catalogue options supplémentaires post-signature → génère devis Sellsy additionnel
- [ ] Formulaire contact direct dans l'espace exposant
- [ ] **Système d'affiliation** :
  - [ ] Champ `affiliate_input` sur étape 1 du formulaire avec auto-complete + matching fuzzy
  - [ ] Capture `?ref=TOKEN` + cookie 30j
  - [ ] CRUD `/admin/affiliates` (création / édition / désactivation)
  - [ ] Génération QR code (lib `qrcode`)
  - [ ] Tracking `affiliate_clicks`
  - [ ] Calcul auto de `commission_eur_ht` à la signature
  - [ ] Onglet "Affiliation" dans Espace Exposant si applicable
- [ ] **Profil exposant** :
  - [ ] Page `/{locale}/espace-exposant/profil` (formulaire structuré, drag-and-drop logo)
  - [ ] Page `/admin/exhibitors-profiles` (vue d'ensemble + édition)
  - [ ] Bucket Supabase Storage `exhibitor-media` avec RLS
  - [ ] Indicateur de complétude des profils sur dashboard admin
- [ ] **RGPD opérationnel** :
  - [ ] Action admin "Supprimer définitivement (RTBF)" avec cascade et audit
  - [ ] Action admin "Exporter données contact" (JSON portabilité)
  - [ ] Email support `rgpd@mediadays.fr` traité dans la politique de confidentialité
- [ ] **2FA TOTP** activable depuis `/admin/users` (Supabase Auth) — recommandé pour `role = admin`
- [ ] **Multi-saison opérationnel** :
  - [ ] Page `/admin/seasons` (CRUD + duplication d'une saison vers une nouvelle)
  - [ ] Sélecteur de saison sur tous les écrans de pipeline et reporting
- [ ] **Assistant IA conversationnel** (cf. 3.22) :
  - [ ] Tables `chat_conversations`, `chat_messages`, `reminders` + RLS
  - [ ] Route `/api/assistant/chat` (streaming Anthropic via SSE)
  - [ ] Outils admin (search_prospects, create_reminder, draft_proposal, etc.)
  - [ ] Outils partenaire (get_my_order, get_event_info, faq_search, etc.)
  - [ ] Contextualisation par catégorie (PRS / Standard / Non éligible) côté partenaire
  - [ ] Widget flottant + panneau latéral droit (admin + Espace Partenaire)
  - [ ] Bouton "💎 Mode approfondi (Sonnet)" admin uniquement
  - [ ] Prompt caching activé sur le system prompt
  - [ ] Page `/admin/reminders` (file rappels)
  - [ ] Cron quotidien : envoyer notifs des rappels échus du jour
- [ ] **Notifications partenaire lifecycle** (cf. 3.25) :
  - [ ] 18 templates Brevo (9 emails × 2 langues)
  - [ ] Cron quotidien 8h UTC qui scanne les signés et envoie selon J-X
  - [ ] Page `/espace-partenaire/preferences-emails` (case lifecycle on/off)
  - [ ] Trace dans `activities` avec type `lifecycle_email_sent`
- [ ] **Récap PDF post-signature** (cf. 3.28) :
  - [ ] Génération avec `@react-pdf/renderer`
  - [ ] Stockage Supabase `exhibitor-media/{company_id}/recap_signed.pdf`
  - [ ] Email automatique avec PDF attaché à la signature
  - [ ] Téléchargement permanent depuis Espace Partenaire
  - [ ] Régénération sur changement de pack/options
- [ ] **Reporting analytique** (cf. 3.26) :
  - [ ] Page `/admin/reports` avec funnel + perf + évolution
  - [ ] Graphiques (recharts ou chart.js)
  - [ ] Export PDF mensuel automatique
  - [ ] Insights IA (Sonnet on-demand)
- [ ] **Mass email campaigns** (cf. 3.29) :
  - [ ] Table `email_campaigns`
  - [ ] Page `/admin/campaigns` (4 étapes : cible / composer / test / envoyer)
  - [ ] Intégration Brevo Campaigns API
  - [ ] Tracking opens/clicks/bounces/unsubs
  - [ ] Garde-fous : confirmation > 100 destinataires, quota max/jour

**Critères P5** : (1) un exposant signé reçoit un magic link, accède à son espace, télécharge sa facture, consulte le guide, commande une option supplémentaire ; (2) un visiteur arrivant via lien d'affiliation est tracé, l'affilié voit ses apports dans son dashboard, le calcul de commission se fait à la signature ; (3) chaque exposant peut compléter son profil (logo + description + LinkedIn + réseaux), Phil voit l'état d'avancement ; (4) Phil peut supprimer un contact RGPD-compliant ou exporter ses données ; (5) Phil peut dupliquer la saison MDS_2026 → MDS_2027 en un clic.

### Phase 6 — Finalisation + MCP Server

- [ ] Tests E2E (Playwright) parcours critiques (signup → paiement → exposant → affiliation)
- [ ] Documentation utilisateur (Phil + commerciale + exposants)
- [ ] Audit RGPD final
- [ ] Performance / SEO public
- [ ] **Audit accessibilité WCAG AA** (contraste, navigation clavier, aria-labels, screen reader)
- [ ] Préparation de la **saison 2027** (clic "Dupliquer saison" et vérifier l'isolation)
- [ ] **MCP Server read-only** (cf. 3.23) :
  - [ ] Migration : créer rôle Postgres `mcp_readonly` (SELECT-only)
  - [ ] Table `mcp_tokens` + RLS
  - [ ] Route Next.js `/api/mcp` avec SDK officiel `@modelcontextprotocol/sdk`
  - [ ] 14 tools listés en 3.23.2 + 9 resources listées en 3.23.3
  - [ ] Page admin `/admin/mcp-tokens` (génération, révocation, audit usage)
  - [ ] Auth Bearer + scopes (`mcp:read`, `mcp:read:finance`, `mcp:read:full_contacts`)
  - [ ] Rate limiting 100 req/min/token
  - [ ] Audit log de chaque appel MCP
  - [ ] Test de bout en bout : configurer Cowork, demander "Combien de prospects signés ?", obtenir réponse en temps réel

**Critères P6** : app stable, monitorée, documentée, accessible WCAG AA. Autonome pour Phil et la commerciale en saison. Multi-saison vérifié. **Cowork peut interroger la DB de l'app en lecture seule via MCP.**

---

## 12. Premier prompt à donner à Claude Code

À copier dans Claude Code une fois ce SPEC dans `docs/SPEC.md` :

> *"Lis `docs/SPEC.md` (v2.5), `docs/MDS-Design-Tokens.md` et `docs/MDS-Prospection-Mockup-v2.4.html`. Compare avec l'état actuel du repo et produis-moi un plan détaillé pour la **Phase 0 uniquement** : setup Supabase, migration SQL avec toutes les tables incluant `seasons`, `audit_log`, `stripe_events_processed`, FK `season_id` partout pertinent, colonnes bilingues `_fr`/`_en`, extension pg_trgm, triggers Postgres pour audit_log ; installation `next-intl` avec routes localisées FR/EN ; seeds initiaux liés à la saison `MDS_2026` (6 pôles + tarifs ACCESS/CLASSIC/PREMIUM × 2 catégories + 18 options additionnelles) ; intégration Sentry + Vercel Analytics ; shadcn ; CI ; déploiement Vercel. Plan en français, avec checklist des fichiers à créer/modifier et des commandes à lancer. N'écris pas de code à ce stade — juste le plan que je validerai avant qu'on attaque."*

Une fois le plan validé : `/plan-eng-review` (Gstack) → `/ship` morceau par morceau.

---

## 13. Sources de données utilisées pour rédiger ce SPEC

| Source | Chemin | Contenu utilisé |
|---|---|---|
| Fichier maître MDS | `COWORK/MDS2026-Reference-Maitre.xlsx` | Taxonomie 6 pôles, plan des salles |
| Prospection v2 | `MEDIADAYS/MD PROSPECTION/Prospection_MDS2026_v2.xlsx` | 853 sociétés (companies seed), 47 PRS exhibitors, 711 contacts |
| DDP MDS | `MD 2026/DEMANDE DE PARTICIPATION/DDP-MDS26-FR-B-PART.pdf` | Tarifs MDS standard, options |
| DDP PRS | `MD 2026/DEMANDE DE PARTICIPATION/DDP-MDPRS26-27-FR-B-PART.pdf` | Tarifs préférentiels PRS, options |
| Plan Canva | `https://canva.link/md26plan` | Plan visuel embed |
| Logos officiels | `MD 2026/PARIS/LOGO 2026/*.svg` | Brand kit |

---

## 14. Décisions ouvertes / inputs encore à fournir par Phil

**Résolus en v2.3** (Phil a tranché) :
- ✅ **Connectonair** : lecture seule, par email, pour enrichissement uniquement (pas de push). Pas bloquant.
- ✅ **Pourcentage acompte** : éditable depuis `/admin/preferences`, défaut 30 %.
- ✅ **Tags Sellsy** : 1 tag par pôle, mapping stocké dans `app_settings.sellsy_pole_tag_map`.
- ✅ **Templates PDF Sellsy bilingues** : Phil les créera côté Sellsy (FR + EN). Plateforme passe seulement la langue.
- ✅ **Sync produits Sellsy ↔ plateforme** : Sellsy = source de vérité catalogue, miroir local + bouton sync manuel + cron quotidien.
- ✅ **RGPD** : pages standards (mentions légales + politique de confidentialité) éditables depuis `/admin/preferences`. Bandeau cookies configurable.
- ✅ **Auto-import 853 sociétés en P0** : oui (seed massif depuis `Prospection_MDS2026_v2.xlsx`).
- ✅ **Traductions** : génération auto via Claude → validation Phil → fixées dans `messages/{fr,en}.json` et colonnes `_fr`/`_en`.
- ✅ **Liste PRS éligibles** : pour l'instant aucune société contactée, données 2025. On utilise les 47 "Cible PRS" comme seed initial, modifiable ensuite via `/admin/prs-exhibitors`.

**Encore à fournir** :
- [ ] **Compte Stripe MediaDays** : à créer (mode test puis live). Phil récupère les 4 clés (`pk_test`, `sk_test`, `pk_live`, `sk_live`) + crée le webhook endpoint.
- [ ] **Compte Sentry** : créer un projet Sentry pour Next.js, récupérer le DSN.
- [ ] **Mapping étapes pipeline Sellsy** : noms exacts des stages Sellsy pour faire correspondre `prospect.status` (`lead`, `contact`, `devis_envoye`, `acompte_paye`, `signe`, `perdu`). À récupérer côté Sellsy.
- [ ] **Domaine de production** : `mds-prospection.vercel.app` (gratuit, par défaut) ou sous-domaine custom (ex. `prospection.mediadays.fr`). À décider avant déploiement P0 final.
- [ ] **Contenu initial Espace Exposant** : Phil prépare le guide exposant + infos pratiques (Markdown, FR + EN). Stocké dans `exhibitor_resources` à la P5.
- [ ] **Catalogue produits Sellsy** : Phil crée les SKU Sellsy (3 packs × 2 catégories + 17 options) avec libellés bilingues. La sync les ramènera automatiquement dans `sellsy_products_mirror`.
- [ ] **Templates Sellsy bilingues avec mention autoliquidation** : modèle FR + EN incluant la mention "Autoliquidation TVA art. 196 directive 2006/112/CE" pour les clients UE.
- [ ] **CGV** : rédiger ou faire rédiger par un juriste les CGV B2B des MediaDays Solutions (FR + EN).

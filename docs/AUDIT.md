# Audit final SPEC v2.8 — avant push Claude Code

Date : 2026-04-30
Comparaison entre le SPEC actuel et la liste des fonctionnalités identifiées au cours de nos discussions (notamment le doc `MDS-Prospection-FEATURES-MANQUANTES.md` et la revue multi-perspectives).

---

## ✅ Couvert dans le SPEC v2.8 (23 sections fonctionnelles)

| # | Fonctionnalité | Section SPEC |
|---|---|---|
| ✓ | 6 Pôles officiels v2.1 | 3.1 |
| ✓ | Salles Carrousel du Louvre | 3.2 |
| ✓ | Catégorie tarifaire (PRS / Standard / Non éligible) | 3.3 |
| ✓ | Tarifs ACCESS/CLASSIC/PREMIUM × 2 catégories | 3.4 |
| ✓ | 17 options additionnelles depuis DDP | 3.5 |
| ✓ | Validation emails pro (free providers + disposable) | 3.6 |
| ✓ | Auto-complete société dès 2 lettres | 3.7 |
| ✓ | Plan Canva embeddé | 3.8 |
| ✓ | i18n FR/EN sur public + emails Brevo | 3.9 |
| ✓ | 4 modes de paiement (devis, devis+acompte, proforma, intégral) | 3.10 |
| ✓ | Idempotence Stripe + verrou optimiste booth | 3.10 |
| ✓ | Espace Partenaire (auth magic link) | 3.11 |
| ✓ | Réglages admin (préférences modifiables) | 3.12 |
| ✓ | Système d'affiliation + QR code + dashboard | 3.13 |
| ✓ | Profil exposant (logo, réseaux sociaux, contacts) | 3.14 |
| ✓ | Multi-saison (édition 2026, 2027…) | 3.15 |
| ✓ | Audit log admin + RTBF + portabilité RGPD | 3.16 |
| ✓ | TVA VIES + autoliquidation | 3.17 |
| ✓ | Notifications admin (Brevo email) | 3.18 |
| ✓ | Mode test / sandbox | 3.19 |
| ✓ | Feature flags | 3.20 |
| ✓ | Création devis concierge admin | 3.21 |
| ✓ | Assistant IA Claude (admin + partenaire) | 3.22 |
| ✓ | MCP Server read-only pour Cowork | 3.23 |
| ✓ | Connectonair en lecture seule par email | 8.3 |
| ✓ | Sync produits Sellsy ↔ plateforme | 8.1bis |
| ✓ | CGV éditable + checkbox obligatoire | 5.2 + 3.10 |
| ✓ | 2FA TOTP admin | 9.1 |
| ✓ | Sentry + Vercel Analytics dès P1 | Section 2 + P0 |
| ✓ | Logos officiels finaux 2026 | _brand/ |

---

## ⚠️ Identifiés en cours mais NON intégrés au SPEC

Ces points avaient été listés dans `MDS-Prospection-FEATURES-MANQUANTES.md` (niveaux 2 et 3) mais n'ont jamais été repris dans le SPEC. À considérer si tu veux les avoir en P5/P6 pour une v1 vraiment complète.

### Niveau 2 — Nice-to-have v1 (recommandé)

| # | Fonctionnalité | Pourquoi c'est utile | Effort |
|---|---|---|---|
| **R1** | **Reporting analytique dédié** (`/admin/reports`) | Funnel détaillé, conversion par source/pôle/affilié, CA mois par mois, top apporteurs, export PDF mensuel pour la commerciale. Le dashboard actuel est léger. | Moyen |
| **R2** | **Annuaire public exposants** (`/{locale}/partenaires` + `/{locale}/partenaires/[slug]`) | Page publique qui liste les partenaires signés avec leur profil (logo, description, contacts publics, réseaux). Valeur SEO + valorise le profil que les exposants remplissent. | Moyen |
| **R3** | **Email deliverability check** (NeverBounce / Hunter / Kickbox) | À l'étape 1, vérifier qu'un email saisi existe vraiment (pas juste syntaxe valide). ~10 % des emails B2B saisis sont morts. ~0,005 €/check. | Faible |
| **R4** | **Récap PDF complet à la signature** | À la signature, génère un PDF "carton de bienvenue" : logo MD + récap commande + photo emplacement + agenda + contacts. Renforce le sentiment "deal conclu" et sert de référence. | Moyen |
| **R5** | **Versionnement complet des préférences** | Quand `deposit_percentage` change 30→40, les anciens prospects gardent 30. Partiellement traité (snapshot dans `prospects.deposit_percentage_at_creation`) mais pas généralisé à toutes les préfs. | Faible |
| **R6** | **Countdown calendrier public** | Sur la home publique : "J-127 avant Paris". Sur l'Espace Partenaire : timeline des deadlines (logo J-30, badges J-7, etc.). Petit mais effet "urgence". | Faible |
| **R7** | **Webhooks inverse Sellsy** | Si Phil change un statut dans Sellsy directement (ex. marque un devis comme refusé), l'app doit le savoir. Sellsy expose des webhooks → écouter `quote.accepted`, `invoice.paid`, etc. | Moyen |
| **R8** | **Mass email campaigns depuis l'app** | Composer/envoyer une newsletter aux exposants depuis l'admin (pas besoin d'aller dans Brevo). Brevo a une API Campaigns. | Moyen |
| **R9** | **Notifications partenaire (lifecycle)** | Emails automatiques aux exposants signés : "J-30 — pensez à uploader votre logo HD", "J-7 — confirmez vos badges", "J-1 — guide d'arrivée". Améliore drastiquement la qualité de la prestation. | Moyen |
| **R10** | **Cmd+K search globale admin** | Une barre de commande accessible avec Cmd+K (ou Ctrl+K) qui permet de chercher prospects/sociétés/contacts/booths/options en 2 secondes depuis n'importe quelle page. | Faible |
| **R11** | **Notifications in-app (cloche admin)** | Petite cloche en haut à droite avec compteur de non-lus : nouveau signup, paiement reçu, rappel échu, sync échoué. Évite de devoir checker l'email. | Moyen |
| **R12** | **Export comptable mensuel** | Bouton "Export comptable" qui génère un CSV avec tous les paiements du mois (date, montant, prospect, type devis/facture, statut Sellsy). À transmettre au comptable. | Faible |

### Niveau 3 — Future v2 (peut attendre)

| # | Fonctionnalité | Quand l'envisager |
|---|---|---|
| F1 | Matchmaking visiteurs ↔ exposants | V2 quand l'app a fait ses preuves |
| F2 | Badges QR équipe exposant | V2 |
| F3 | API publique pour LaLettre.pro | V2 |
| F4 | App mobile (PWA installable) | V2 |
| F5 | Assistant IA exposant ouvert au public | Couvert partiellement par 3.22 (auth requise) |
| F6 | Salon waitlist quand pôle plein | V2 |
| F7 | Networking exposant ↔ exposant | V2 |
| F8 | Onboarding tour première connexion | V2 (ou v1 si simple) |

---

## 🎨 Sur le mockup — manques identifiés

| # | Manque | Recommandation |
|---|---|---|
| **M1** | **Vues mobile dédiées** | Ajouter 4-5 écrans clés (Step 1 public + Espace Partenaire dashboard + Admin liste prospects + Chat IA partenaire) en version mobile 375px à la fin du mockup |
| **M2** | **États de chargement (skeleton)** | Aucun skeleton/loader montré — Claude Code va devoir improviser |
| **M3** | **Dark mode** | Non spécifié dans la charte — à décider : on ne fait pas ? on le prévoit ? |
| **M4** | **Onboarding première connexion exposant** | Pas montré dans la maquette |
| **M5** | **Modal de confirmation actions critiques** | Ex. "Supprimer ce prospect (RTBF)" — besoin d'un design pour les confirmations |

---

## 📝 Recommandation

Pour ne **vraiment rien oublier** avant de pousser sur Claude Code, je propose de faire **une dernière passe v2.9** qui intègre :

### Doit absolument être fait avant P0
- **M1** — vues mobile dans le mockup (sans ça, Claude Code va deviner pour le responsive)
- **R7** — webhooks inverse Sellsy (sans ça, on a un risque de désynchro silencieuse)
- **R9** — notifications partenaire lifecycle (sans ça, l'expérience exposant est plate)

### Souhaitable mais peut être ajouté en P5
- **R1** Reporting analytique
- **R2** Annuaire public
- **R4** Récap PDF signature
- **R6** Countdown
- **R10** Cmd+K
- **R11** Cloche notifications admin
- **R12** Export comptable mensuel

### Peut attendre la v2 (post-événement 2026)
- Tout le niveau 3 (F1-F8)

---

## Question à trancher

**Veux-tu que je fasse la passe v2.9 maintenant** (intégrer M1 + R7 + R9 minimum, plus éventuellement quelques nice-to-have de niveau 2 que tu juges importants) **pour avoir un SPEC vraiment final** avant de pousser sur Claude Code ?

Ou préfères-tu :
- **(a)** Tout intégrer en bloc dans v2.9 (~30 min de travail SPEC + mockup)
- **(b)** Choisir une sous-liste à intégrer
- **(c)** Pousser tel quel en v2.8 et ajouter les manquants au fil de l'eau

Mon vote : **(a)** sur les 3 critiques (M1, R7, R9) au minimum, puis itérer en P5 sur le reste.

# MDS Prospection — Fonctionnalités à considérer (suggestions)

Date : 2026-04-28
Référence SPEC : v2.4

Liste hiérarchisée des fonctionnalités importantes pour ce type d'outil B2B salon/événementiel qui ne sont **pas encore dans le SPEC** mais qui méritent d'être ajoutées (en P0 ou plus tard selon priorité).

---

## 🔴 Niveau 1 — Must-have pour v1 (à ajouter au SPEC avant P0)

### A. Multi-saison / multi-édition
**Pourquoi** : MDS aura une édition 2027, 2028… La structure actuelle ne le permet pas sans tout dupliquer.
**Implémentation** :
- Table `seasons` (id, code, name, dates, status active/archived/upcoming).
- FK `season_id` sur `prospects`, `booth_inventory`, `pricing_tiers`, `addon_options`, `prs_2026_exhibitors` → renommer en `season_exhibitors` avec FK season.
- L'admin sélectionne la saison active pour l'app publique.
- Reporting filtré par saison.

### B. Audit log admin
**Pourquoi** : pour la traçabilité, conformité, debug, et accountability entre Phil et la commerciale.
**Implémentation** :
- Table `audit_log` (id, user_id, action, entity_type, entity_id, before jsonb, after jsonb, ip, ua, created_at).
- Triggers Postgres ou hooks middleware sur tous les `UPDATE` / `DELETE` sensibles.
- Vue `/admin/audit-log` consultable.

### C. Notifications admin temps réel
**Pourquoi** : un nouveau signup à 2h du matin dimanche, Phil veut le savoir vite.
**Implémentation** :
- Notifications email (via Brevo) sur événements clés : nouveau signup vérifié, nouvelle inscription web, paiement reçu, échec sync API, etc.
- (Optionnel) Webhook Slack si Phil utilise Slack.
- Configurable dans `/admin/preferences` (qui reçoit quoi).

### D. Empty states & error states définis
**Pourquoi** : sans ça, Claude Code va inventer ou laisser des écrans cassés.
**Implémentation** : à intégrer dans la maquette v2.4 (j'en mets dans la prochaine version).
- Dashboard vide : message d'onboarding avec "ajouter votre premier prospect"
- Erreur API (Sellsy down) : message clair avec bouton retry
- Erreur paiement Stripe : page d'erreur avec contact support
- Email de vérification expiré : page avec bouton "renvoyer un nouveau lien"
- Rate limit atteint : "trop de tentatives, réessayez dans 5 min"

### E. RTBF + portabilité données (RGPD opérationnel)
**Pourquoi** : obligation légale.
**Implémentation** :
- Action admin sur fiche contact : "Supprimer définitivement (RTBF)" avec confirmation et cascade.
- Action admin : "Exporter toutes les données de ce contact" (JSON téléchargeable).
- Email support `rgpd@mediadays.fr` dans la politique de confidentialité.
- Log de toute action RGPD dans `audit_log`.

### F. Vérification VAT VIES + autoliquidation TVA
**Pourquoi** : conformité fiscale B2B intracommunautaire. Sans ça, tu factures à tort la TVA française à un client allemand → litige + correction comptable lourde.
**Implémentation** :
- Champ `vat_number` optionnel sur le formulaire (visible seulement si pays ≠ France).
- Appel API VIES (`http://ec.europa.eu/taxation_customs/vies/services/checkVatService`) côté serveur pour valider.
- Si validé : `vat_verified = true` côté `companies` → Sellsy applique l'autoliquidation (TVA 0 % avec mention "Autoliquidation TVA art. 196 directive 2006/112/CE").

### G. Idempotence webhook Stripe + verrou booth
**Pourquoi** : éviter doublons et conflits de réservation.
**Implémentation** :
- Table `stripe_events_processed` (event_id PK, processed_at) — check avant action.
- Sur sélection booth : passer en `option` avec `option_expires_at = now() + 30 min`. Cron qui passe les options expirées en `available`.

### H. CGV (conditions générales de vente)
**Pourquoi** : obligation B2B France.
**Implémentation** : page `/{locale}/cgv` éditable depuis `/admin/preferences`, acceptation obligatoire à la signature/paiement (checkbox).

---

## 🟡 Niveau 2 — Nice-to-have v1 (recommandé en P3-P5 si time-to-market le permet)

### I. Reporting / dashboard analytique
**Pourquoi** : Phil pilote le projet à l'œil sans ça.
**Implémentation** : page `/admin/reports` avec :
- Funnel inscription : clics affiliés → signups → vérifiés → tarifs vus → soumis → payés → signés
- Conversion par source (affilié, direct, salon, campagne)
- CA encaissé vs CA prévu, par salon
- Top affiliés (CA généré + commission cumulée)
- Évolution temporelle (semaine/mois)
- Export PDF mensuel pour la commerciale

### J. Annuaire public des exposants
**Pourquoi** : valeur SEO + valeur ajoutée perçue par les exposants (visibilité avant l'événement).
**Implémentation** :
- Page publique `/{locale}/exposants` avec liste des exposants signés + filtres par pôle.
- Page détail `/{locale}/exposants/[slug]` avec profil complet (logo, description, contacts publics, réseaux).
- Génère du contenu indexable + valorise le profil exposant que tu obliges à compléter.

### K. Mode test / sandbox commercial
**Pourquoi** : la commerciale doit pouvoir tester le parcours sans polluer la base réelle.
**Implémentation** : flag global `test_mode` dans `app_settings`, prospects taggés `is_test = true` filtrés par défaut dans toutes les vues. Permet aussi de faire des démos.

### L. Vérification deliverability email
**Pourquoi** : un email valide syntaxiquement n'existe pas forcément. Sur du B2B, ~10 % des emails saisis sont morts.
**Implémentation** : appel à NeverBounce / Hunter / Kickbox API à la soumission étape 1. Si email "undeliverable" → blocage propre. Coût ~$0.005 / vérification.

### M. Récapitulatif PDF complet à la signature
**Pourquoi** : la facture Sellsy montre les lignes mais pas le contexte (emplacement choisi, options détaillées, notes). Un récap "carton de bienvenue" envoyé à la signature renforce le sentiment de "deal conclu".
**Implémentation** : génération PDF côté plateforme avec logo, photo emplacement, listing options détaillé, agenda du salon, contacts utiles. Stocké dans `attachments` du prospect.

### N. Versionnement des préférences
**Pourquoi** : si Phil change `deposit_percentage` de 30 → 40 %, les prospects créés avant doivent garder 30 %.
**Implémentation** : table `app_settings_history` ou approche simple = snapshot du `deposit_percentage` dans `prospects.deposit_percentage_at_creation` au moment où le prospect est créé.

### O. Calendrier public + countdown
**Pourquoi** : urgence et engagement avant l'événement.
**Implémentation** :
- Sur `/{locale}` accueil : countdown vers le prochain salon ("J-127 avant Paris").
- Sur Espace Exposant : timeline des deadlines (logo à fournir avant J-30, badges à imprimer avant J-7, etc.).

### P. 2FA pour comptes admin
**Pourquoi** : les comptes admin voient les paiements, l'auth seule par mot de passe est faible.
**Implémentation** : Supabase Auth supporte le TOTP. Activable depuis `/admin/users`.

### Q. Feature flags simples
**Pourquoi** : pousser des fonctionnalités progressivement, désactiver en cas de bug en prod.
**Implémentation** : section dédiée dans `app_settings` (`feature_flags: { espace_exposant: true, affiliation: false }`). Un middleware lit le flag et bloque l'accès.

### R. Concurrence sur les emplacements (verrou optimiste)
Couvert par le point G. À détailler dans le SPEC.

---

## 🟢 Niveau 3 — Future / V2

### S. Matchmaking visiteurs ↔ exposants
**Pourquoi** : feature majeure des plateformes événementielles modernes (Brella, Whova, Catalyx). Permet aux visiteurs de demander des RDV pré-salon avec les exposants. Booste massivement la perception de valeur côté exposant.
**Implémentation** : module séparé après v1.

### T. Badges QR exposants + équipe
**Pourquoi** : chaque exposant a typiquement 2-5 personnes sur son stand. Génération auto des badges QR pour le contrôle d'accès.
**Implémentation** : Espace Exposant > section "Badges équipe", upload des noms/photos, génération PDF prêt à imprimer.

### U. API publique
**Pourquoi** : LaLettre.pro, Connectonair, ou un futur partenaire pourrait vouloir afficher la liste des exposants en temps réel.
**Implémentation** : routes API REST publiques `/api/v1/public/exhibitors` (lecture seule), avec cache CDN.

### V. App mobile (PWA)
**Pourquoi** : l'Espace Exposant + les outils de la commerciale en mobilité bénéficient d'une PWA installable.
**Implémentation** : Next.js supporte PWA via manifest + service worker. Effort modeste si déjà responsive.

### W. Assistant IA exposant
**Pourquoi** : "À quelle heure sont les conférences ?" "Où est mon stand ?" "Comment changer mon logo ?" → un chat IA basé sur les ressources et le SPEC pourrait répondre 24/7.
**Implémentation** : page Espace Exposant avec embed de Claude Sonnet, RAG sur les ressources MDS.

### X. Salon waitlist
**Pourquoi** : si toutes les places dans un pôle sont prises, basculer automatiquement en liste d'attente.
**Implémentation** : statut `waitlist` sur prospect + email automatique "vous êtes 3ᵉ sur liste d'attente" + notification admin si désistement.

### Y. Communications mass via Brevo depuis l'app
**Pourquoi** : aujourd'hui Phil va dans Brevo pour envoyer une newsletter. L'avoir dans l'app simplifie.
**Implémentation** : page `/admin/communications` avec composeur d'email + sélection de liste + preview + envoi via Brevo Campaigns API.

### Z. Networking exposant ↔ exposant
**Pourquoi** : déjà demandé sur d'autres salons média. Permet aux exposants de se connaître avant le show.
**Implémentation** : annuaire interne dans l'Espace Exposant + messagerie privée.

---

## Synthèse — Ce que je recommande d'ajouter au SPEC v2.5

**Avant de pousser la P0 sur Claude Code, intégrer dans le SPEC** :

| # | Fonctionnalité | Impact P0 | Justification |
|---|---|---|---|
| A | Multi-saison | ✅ table seasons + FK partout | Architectural — refacto coûteux après |
| D | Empty/error states | ✅ ajout dans maquette | Sinon Claude Code invente |
| E | RTBF + portabilité | ⚠️ table audit_log + fonctions | RGPD obligatoire |
| F | VAT VIES | ⚠️ champ vat_number + API | Risque fiscal réel |
| G | Idempotence Stripe + verrou booth | ⚠️ table stripe_events + cron | Bugs critiques évités |
| H | CGV | ✅ même mécanisme que mentions légales | Légal obligatoire B2B |
| B | Audit log | ⚠️ table audit_log + triggers | Compliance + debug |
| C | Notifs admin | ✅ entrée app_settings + envoi Brevo | Opérationnel |
| K | Mode test | ✅ flag is_test sur prospects | Pratique commerciale |
| Q | Feature flags | ✅ entrée app_settings | Hygiène déploiement |

Les 6 autres (I, J, L, M, N, O, P) peuvent attendre P3-P5 sans casser quoi que ce soit.

Les niveaux 3 (S → Z) sont des **features stratégiques pour 2027+** quand l'outil aura prouvé sa valeur.

---

**Recommandation finale** : avant de copier le SPEC actuel dans `docs/SPEC.md` du repo et de lancer Claude Code, consacrer **30-60 minutes** à intégrer les 10 ajouts ci-dessus dans une **v2.5**. C'est le meilleur ROI possible — éviter une dette technique et légale qui coûterait 10x plus cher à corriger après.

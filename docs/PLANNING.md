# MDS Prospection — Rétro-planning & budget (mode IA)

Date : 2026-04-30
Cible événement : Paris 15 décembre 2026 (Bruxelles 26 novembre, Marseille 10 décembre)
Approche : développement IA-augmenté (Phil pilote + Claude Code génère + Cowork orchestre)

---

## 1. Méthodologie d'estimation — pourquoi pas une approche humaine

Une approche humaine dirait : "ce projet = 4-6 mois full-time pour une équipe de 2-3 devs". C'est faux dans ton contexte.

**Différences clés en mode IA** :

| Tâche | Approche humaine | Approche IA |
|---|---|---|
| Génération de code (composant, page, route API) | 1-4h chacun | 5-15 min |
| Setup boilerplate (auth, layout, formulaires) | 2-3 jours | 2-4h |
| Connexion API tierce avec retry/edge cases | 1-2 jours | 3-6h |
| Tests E2E d'un parcours | 4-8h | 1-2h |
| Documentation et commentaires | 4-6h | 0 (auto) |
| Refactoring | 1-2 jours | 1-2h |

**Le goulot d'étranglement n'est plus le code, c'est** :
1. **Toi** qui review, testes et valides chaque livraison (on ne peut pas court-circuiter)
2. **Les configurations externes incompressibles** : KYC Stripe, validation domaine Brevo, création SKU Sellsy, doc Connectonair
3. **L'attente de réponses tierces** : prestataires, comptable pour CGV, etc.

**Ratio de productivité estimé** : Phil + Claude Code = équivalent ~2-3 développeurs seniors humains.

---

## 2. Rétro-planning par sprint

### Hypothèse de base : 4-6h/jour de travail effectif sur le projet, 5 jours/semaine

Si tu es à **temps plein** sur le projet, voici l'enchaînement le plus rapide :

#### Sprint 1 (semaine du 5 mai) — Foundations
**Objectif** : app déployée avec auth + dashboard squelette
- **J1-J2** : P0 setup Supabase, migrations, seeds (6 pôles, tarifs, 17 options, 47 PRS, 853 sociétés), shadcn/ui thème MD, Sentry, CI, déploiement Vercel
- **J3-J4** : P1 auth Supabase + middleware, layout admin, dashboard avec KPIs (mock), liste prospects responsive, page styleguide
- **J5** : tests + ajustements + premier déploiement prod

**Livrable fin sprint 1** : `https://mds-prospection.vercel.app` accessible, login admin, dashboard visuel cohérent avec maquette

#### Sprint 2 (semaine du 12 mai) — CRUD pipeline
**Objectif** : gestion manuelle complète du pipeline
- **J1-J3** : CRUD companies/contacts/prospects + timeline activities, auto-complete société (pg_trgm), filtres et search
- **J4** : CRUD booth_inventory + addons + pricing + import 853 sociétés via UI
- **J5** : export CSV + tests + ajustements

**Livrable fin sprint 2** : tu peux gérer manuellement A→Z des prospects dans l'app

#### Sprint 3 (semaines du 19-26 mai) — Formulaire public + IA
**Objectif** : acquisition publique fonctionnelle
- **Sem 3a** : routes localisées FR/EN, étape 1 form avec auto-complete + champ affilié, API signup/init avec validation email + classif IA Claude Haiku, DOI Brevo
- **Sem 3b** : étape 2A complète (Pack/Booth/Options/Paiement) en sous-étapes, étape 2B non-éligible, page merci, pages CGV/legales, empty/error states, vue admin /signups, anti-spam hCaptcha, VAT VIES, conversion signup → prospect

**Livrable fin sprint 3** : un visiteur peut s'inscrire en autonomie, tu reçois la qualification dans l'admin

🚀 **À ce stade tu peux déjà lancer la prospection en bêta** (pas encore de paiement automatisé mais devis manuel possible)

#### Sprint 4 (semaines du 2-9 juin) — Intégrations financières
**Objectif** : paiements + synchros automatisées
- **Sem 4a** : Sellsy API (companies/contacts/opportunities/devis/factures/proforma), tags pôles, sync produits Sellsy → mirror, Brevo (listes + templates), notifications admin
- **Sem 4b** : Stripe Checkout + Payment Links, webhooks Stripe avec idempotence, webhooks inverse Sellsy, NeverBounce deliverability, Connectonair enrichissement read-only, mode test sandbox, auto-retry

**Livrable fin sprint 4** : flux complet inscription → devis Sellsy → Stripe → encaissement → statut auto. **Production utilisable.**

#### Sprint 5 (semaines du 16-30 juin) — Espace Partenaire + IA + Reporting
**Objectif** : tout le post-vente + outils de pilotage avancés
- **Sem 5a** : auth Espace Partenaire magic link, dashboard partenaire, détail commande + factures Sellsy, CRUD ressources admin, page ressources lecture, options supplémentaires, formulaire contact, /admin/preferences (toutes catégories)
- **Sem 5b** : système d'affiliation (CRUD + QR + tracking + dashboard exposant-affilié), profil partenaire avec Storage logos, page profils admin, multi-saison opérationnel, 2FA TOTP, RTBF + portabilité
- **Sem 5c** : assistant IA admin (chat + outils + streaming + escalation Sonnet), assistant IA partenaire contextualisé, page rappels, cron rappels échus, reporting analytique avec graphes, lifecycle emails (18 templates + cron), récap PDF post-signature, mass email campaigns

**Livrable fin sprint 5** : **app v1 complète et production-ready**

#### Sprint 6 (semaine du 7 juillet) — Polish + MCP + audit
**Objectif** : finition pro
- **J1-J2** : tests E2E Playwright sur les parcours critiques
- **J3-J4** : MCP server avec SDK + tools/resources, page tokens MCP admin, configuration de Cowork côté Phil
- **J5** : audit accessibilité WCAG AA, perf/SEO public, documentation utilisateur, préparation saison 2027 (test duplication)

**Livrable fin sprint 6** : **v1 stable, monitorée, documentée. Cowork peut interroger la DB.**

---

## 3. Synthèse des durées

| Mode | Durée totale | Lancement bêta | Lancement v1 |
|---|---|---|---|
| **Full-time intense** (8h/j, focus total) | **6 semaines** | fin sprint 3 (≈ 28 mai) | fin sprint 5 (≈ 30 juin) |
| **Soutenu** (4-6h/j) | **8-9 semaines** | mi-juin | mi-juillet |
| **Mix avec autres tâches** (2-3 j/sem) | **3-4 mois** | juillet | septembre |

Date de l'événement : **26 novembre 2026** (Bruxelles, le plus tôt). Tu as **7 mois** devant toi → **largement le temps**, même en mode "soutenu".

**Ma recommandation** : viser le mode "soutenu" qui te laisse 4 mois pour itérer sur des cas réels, recetter avec la commerciale, et pousser vers le PRO les exposants.

---

## 4. Stratégie de lancement progressif

Plutôt que d'attendre la v1 complète, **lance en production dès la fin du sprint 3** (≈ mi-juin) avec :
- Acquisition publique active (formulaire live, classification IA, double opt-in)
- Pipeline admin pour gérer les prospects entrants
- Paiements **manuels via Sellsy direct** (pas encore Stripe automatisé)

Tu commences à acquérir des prospects pendant que les sprints 4-6 enrichissent l'app sans interruption pour l'utilisateur. C'est **l'approche start-up classique** et c'est cohérent avec une exécution en mode IA.

---

## 5. Budget réaliste

### 5.1 Coûts récurrents mensuels

#### Phase de développement (mai-juin 2026, ~2 mois)

| Outil | Plan | Coût mensuel |
|---|---|---|
| Vercel | Hobby (gratuit) | **0 €** |
| Supabase | Free (suffit en dev) | **0 €** |
| Brevo | Free (300 emails/jour) | **0 €** |
| Sentry | Free (5k errors/mois) | **0 €** |
| Anthropic API | pay-as-you-go (classif IA + tests assistant) | **5-15 €** |
| NeverBounce | pay-per-check | **2-5 €** |
| Stripe | Mode test gratuit | **0 €** |
| GitHub | Free (privé) | **0 €** |
| **Total dev** | | **~10-20 €/mois** |

#### Phase de production (juillet 2026 → après événement, ~6 mois)

| Outil | Plan | Coût mensuel |
|---|---|---|
| Vercel | Pro (analytics + SLA + domaine custom + branches preview) | **18 €** |
| Supabase | Pro (8GB DB, backups quotidiens, 100k MAU) | **22 €** |
| Brevo | **150 K envois/mois — déjà couvert par l'abonnement Phil** | **0 €** |
| Sellsy | **déjà couvert par l'abonnement Phil** (incl. sync banque Powens) | **0 €** |
| Sentry | Free (5k errors suffit) ou Team (50k) | **0-23 €** |
| Vercel Analytics | inclus avec Pro | **0 €** |
| Anthropic API | classif + assistants IA (estim 30-50€ pendant pic) | **30-50 €** |
| NeverBounce | ~500-1000 checks/mois | **5-10 €** |
| Stripe | gratuit, frais transactionnels seulement (sur ~20% des paiements car la plupart en virement SEPA classique) | **0 €** |
| Domaine custom (`.fr` ou `.com`) | renouvellement annuel | **~1 €** |
| **Total prod** | | **~75-100 €/mois** |

### 5.2 Coûts variables sur les transactions

**Hypothèse révisée v2.10** : ~70-80 % des partenaires payent par **virement SEPA classique** (cohérent avec le B2B France et l'abonnement Sellsy avec sync banque), seulement 20-30 % via Stripe.

Estimation conservatrice : **200 K€ de CA encaissé sur 2026**.

| Mode | Part estimée | CA passant par ce mode | Frais |
|---|---|---|---|
| **Virement SEPA classique** (via RIB Sellsy + sync banque) | ~75 % | 150 K€ | **0 €** (juste les frais bancaires interbancaires de ta banque, négligeables) |
| **Stripe SEPA Direct Debit** | ~10 % | 20 K€ | 0,8 % = **160 €** |
| **Stripe carte CB** | ~10 % | 20 K€ | 1,4 % + 0,25 € × 8 = **282 €** |
| **Stripe Pro-forma international** | ~5 % | 10 K€ | 1,4 % + 0,25 € × 4 = **141 €** |
| **Total frais transaction** | 100 % | 200 K€ | **~580 €** |

**Économie vs scénario "tout Stripe"** : ~2 500 € sur la saison. Le SEPA classique est massivement gagnant côté MediaDays.

### 5.3 Coûts uniques setup

| Item | Coût | Source |
|---|---|---|
| **Crédit initial Anthropic API** (mai) | 50 € | acheté sur console.anthropic.com |
| **Crédit initial NeverBounce** | 20 € | suffit pour ~2500 vérifs |
| **CGV B2B + mentions légales bilingues** | | |
| → Option A : DIY avec template + relecture juriste | 0-200 € | très acceptable pour démarrer |
| → Option B : Captain Contrat / Defendt | 200-400 € | rapide, semi-pro |
| → Option C : avocat dédié | 500-1500 € | inutile pour ce projet à mon avis |
| **Domaine custom** (1 an) | 12-15 € | OVH, Gandi, Namecheap |
| **Setup divers** (logos, polices premium si besoin) | 0-100 € | déjà couvert |

**Total setup** : **~80-300 €** selon choix CGV.

### 5.4 Budget total réaliste (v2.10)

| Période | Coût total |
|---|---|
| Setup unique | 80-300 € |
| Dev (2 mois × 15 €) | 30 € |
| Prod jusqu'à fin événement (6 mois × 90 € moyen) | 540 € |
| Frais Stripe (~25% des transactions, le reste en virement SEPA gratuit) | ~580 € |
| **TOTAL projet jusqu'au 30 décembre 2026** | **1 200 - 1 450 €** |

**Comparaison avec estimation initiale (avant prise en compte des abos existants Phil + SEPA)** :

| Version | Total |
|---|---|
| v2.9 (sans abos Phil + tout Stripe) | 2 500-4 300 € |
| **v2.10 (avec abos Phil + 75 % SEPA)** | **1 200-1 450 €** |
| **Économie réalisée** | **~1 500-3 000 €** |

### 5.5 Comparaison

À titre indicatif, ce que ça coûterait autrement :
- **Agence de dev custom** (équivalent fonctionnel) : **30-80 K€** pour 4-6 mois de chantier
- **SaaS B2B salon clé en main** type Eventbrite Organizer Pro / Whova / Brella : **5-15 K$/an** + frais de billetterie
- **Stack Bubble/Webflow + Zapier + Airtable** : **~3-5 K€** mais pas de vraie sophistication métier (pas d'IA contextualisée, pas de MCP, etc.)

→ Tu fais un outil sur-mesure, scalable, multi-saison pour **moins de 5 K€**. Le ratio prix/valeur est imbattable.

---

## 6. Outils à configurer (checklist)

### Avant le sprint 1 (idéalement cette semaine)

- [ ] **Compte Anthropic API** (https://console.anthropic.com) → ajouter 50€ de crédit, créer une clé API
- [ ] **Compte Supabase** (https://supabase.com) → créer projet en région EU (Frankfurt ou Paris), copier URL + anon key + service role key
- [ ] **Compte Vercel** (déjà existant ?) → lier au repo GitHub `mds-prospection`
- [ ] **Compte Sentry** (https://sentry.io) → créer projet Next.js, copier DSN
- [ ] **Compte hCaptcha** (https://hcaptcha.com) → créer site, copier les clés site/secret

### Avant le sprint 4 (mi-mai)

- [ ] **Stripe** → finaliser KYC entreprise MediaDays (ça peut prendre 1-2 semaines à valider, à anticiper). Récupérer 4 clés : `pk_test`, `sk_test`, `pk_live`, `sk_live`. Configurer un webhook endpoint vers `https://mds-prospection.vercel.app/api/webhooks/stripe` (à créer après déploiement) avec un `STRIPE_WEBHOOK_SECRET`.
- [ ] **Brevo** (abonnement existant 150K envois/mois → 0€ supplémentaire) → vérifier accès API, valider domaine d'envoi (SPF/DKIM/DMARC sur `mediadays.fr`), créer 6 listes pôles + 4 listes statut + 1 liste signés
- [ ] **Brevo templates** → créer ~30 templates :
  - 2 DOI (FR + EN)
  - 4 welcome (Cas A FR/EN, Cas B FR/EN)
  - 4 acompte/signed (FR + EN x 2)
  - 18 lifecycle (9 emails × 2 langues)
  - 2 devis concierge (FR + EN)
- [ ] **Sellsy** (abonnement existant → 0€ supplémentaire) :
  - vérifier accès API (OAuth ou clé)
  - créer les 6 SKU produits (3 packs × 2 catégories) + 17 options additionnelles avec libellés bilingues
  - créer modèles PDF devis/facture FR ET EN **avec RIB MediaDays en pied de page** (pour le parcours `devis_sepa`) + mention autoliquidation TVA art. 196 (clients UE hors FR)
  - **activer la sync bancaire Powens** dans Sellsy : connecter le compte bancaire MediaDays → permet la détection automatique des virements reçus + rapprochement avec les devis émis (essentiel pour le parcours SEPA par défaut)
  - récupérer le webhook secret partagé (HMAC pour vérif côté app)
- [ ] **Connectonair** → réclamer la doc API à l'éditeur si pas encore reçue. Sinon : prévoir un stub.
- [ ] **NeverBounce** (https://neverbounce.com) → créer compte, ajouter 20€ de crédit, copier API key
- [ ] **Canva** → vérifier que `https://canva.link/md26plan` est bien actif et en partage public

### Avant le sprint 6 (juillet)

- [ ] **Domaine custom** (optionnel) → réserver `prospection.mediadays.fr` ou similaire
- [ ] **CGV** → faire valider la version par un juriste si voulu (cf. options 5.3)
- [ ] **MCP setup Cowork** → ajouter le MCP de l'app dans les paramètres Cowork avec ton token

---

## 7. Priorisation arbitrage budget si besoin

Si à un moment tu veux trancher sur le budget, voici ce qui peut sauter :

**Coupes facilement reportables sans impact court terme** :
1. Sentry Team (rester sur Free — 5k errors/mois c'est largement assez pour démarrer) → **-23€/mois**
2. Vercel Pro (rester sur Hobby si <100GB bandwidth/mois) → **-18€/mois** mais perd analytics intégré
3. Brevo Lite → repasser sur Free si <300 emails/jour à un moment creux → **-22€/mois**

**Coupes risquées (à éviter)** :
- Supabase Pro → Free fait perdre les backups, gros risque sur prod
- Anthropic API → c'est ton avantage compétitif, ne pas couper
- NeverBounce → c'est seulement 5-10€/mois, on garde

**Économie max sans casser quoi que ce soit** : ~50€/mois → **300€ sur la saison**. Pas vraiment un sujet.

---

## 8. Risques planning

| Risque | Impact | Mitigation |
|---|---|---|
| KYC Stripe lent (1-2 sem) | Décale le sprint 4 | Démarrer la création de compte **maintenant** |
| Doc API Connectonair non disponible | P5 décale | Stub déjà prévu dans le SPEC, pas vraiment bloquant |
| Templates Sellsy bilingues à créer côté Sellsy | Délai sprint 4 | Préparer les modèles dès la P0 (pas du dev) |
| Tests utilisateurs revèlent des problèmes UX | Retours en P5 | Bêta interne tôt (sprint 3) avec la commerciale |
| Charge mentale "tout faire en parallèle" | Burn-out | Discipline focus, 1 sprint à la fois, pas mélanger |

---

## 9. Recommandation finale

Mon conseil pour optimiser à fond :

1. **Cette semaine** (avant 5 mai) : créer les comptes Anthropic/Supabase/Sentry, lancer le KYC Stripe (le plus lent)
2. **5-9 mai** : sprint 1 (P0 + P1)
3. **12-16 mai** : sprint 2 (P2)
4. **19-30 mai** : sprint 3 (P3) → **soft launch fin mai**
5. **2-13 juin** : sprint 4 (P4) → **launch payments début juin**
6. **16 juin - 4 juillet** : sprint 5 (P5) → **v1 complète début juillet**
7. **7-11 juillet** : sprint 6 (polish + MCP)
8. **Juillet-novembre** : usage réel, itération sur retours, prospection active
9. **26 novembre 2026** : Bruxelles → événement servi par l'app
10. **10-15 décembre** : Marseille + Paris

**Si tu peux y consacrer 6h/j en moyenne, tu finis la v1 complète début juillet.** Tu auras 5 mois pour acquérir des partenaires, itérer, et arriver à la saison avec un outil rodé.

**Coût total** : entre 2 500 € et 4 300 € sur 8 mois. Pour un outil sur-mesure de cette ampleur, c'est exceptionnel.

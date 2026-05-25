-- Migration 0055 — P3.1 exhibitor_resources V1 (created_at + seed initial)
--
-- Ajoute la colonne `created_at` manquante (la table 0008 n'avait que
-- `updated_at`) puis seed 5 ressources de démarrage (génériques, éditables
-- par admin après livraison).
--
-- Pas de modification de RLS : les policies 0015
-- (`exhibitor_resources_read_published` + `exhibitor_resources_admin_write`)
-- restent suffisantes.

-- ========================================================================== --
-- 1. Ajout colonne created_at (manquante dans la migration 0008 d'origine)
-- ========================================================================== --
alter table public.exhibitor_resources
  add column if not exists created_at timestamptz not null default now();

create index if not exists exhibitor_resources_created_at_idx
  on public.exhibitor_resources (created_at desc);

-- ========================================================================== --
-- 2. Seed initial (5 ressources sample) — idempotent via ON CONFLICT (slug)
-- ========================================================================== --
insert into public.exhibitor_resources (
  slug, title_fr, title_en, body_fr, body_en, is_published, display_order
) values
(
  'guide-exposant',
  'Guide exposant — Tout savoir pour bien préparer votre participation',
  'Exhibitor guide — Everything you need to prepare for your participation',
  E'# Guide exposant\n\nBienvenue parmi les exposants des MediaDays Solutions 2026. Ce guide rassemble toutes les informations essentielles pour préparer votre venue à Marseille (10 décembre, Palais du Pharo) et Paris (15 décembre, Carrousel du Louvre).\n\n## Checklist J-30\n\n- Confirmer votre équipe sur place\n- Préparer vos supports de communication\n- Réserver vos hébergements\n\n## Contact équipe\n\nUne question ? Écrivez-nous à [philippe@mediadays.solutions](mailto:philippe@mediadays.solutions).',
  E'# Exhibitor guide\n\nWelcome to MediaDays Solutions 2026 exhibitors. This guide gathers all essential information to prepare your participation in Marseille (December 10, Palais du Pharo) and Paris (December 15, Carrousel du Louvre).\n\n## D-30 Checklist\n\n- Confirm your on-site team\n- Prepare your communication materials\n- Book accommodations\n\n## Team contact\n\nQuestion? Write to [philippe@mediadays.solutions](mailto:philippe@mediadays.solutions).',
  true, 10
),
(
  'faq-logistique-salon',
  'FAQ logistique salon',
  'Show logistics FAQ',
  E'# FAQ logistique\n\n## Quand puis-je accéder à mon stand pour le montage ?\n\nLe montage est ouvert la veille de chaque étape à partir de 14h.\n\n## Y a-t-il du Wifi sur les stands ?\n\nOui, Wifi exposant fourni par le lieu (codes communiqués J-7).\n\n## Puis-je apporter mon mobilier ?\n\nOui, dans la limite des dimensions de votre emplacement.',
  E'# Logistics FAQ\n\n## When can I access my booth for setup?\n\nSetup opens the day before each event from 2 PM.\n\n## Is there Wifi on the booths?\n\nYes, exhibitor Wifi provided by the venue (codes shared D-7).\n\n## Can I bring my own furniture?\n\nYes, within the dimensions of your booth.',
  true, 20
),
(
  'charte-graphique-mds',
  'Charte graphique MediaDays Solutions 2026',
  'MediaDays Solutions 2026 brand guidelines',
  E'# Charte graphique MDS 2026\n\nRetrouvez tous les éléments visuels pour communiquer autour de votre participation.\n\n## Logos\n\n- [Logo MDS PNG fond transparent](https://mediadays.solutions/brand/mds-logo.png)\n- [Logo Paris Radio Show](https://mediadays.solutions/brand/prs-logo.png)\n\n## Couleurs principales\n\n- Bleu MDS : `#1A2B6E`\n- Magenta MDS : `#E91E63`\n\n## Typographie\n\nInter (Google Fonts).',
  E'# MDS 2026 Brand Guidelines\n\nFind all visual assets to communicate about your participation.\n\n## Logos\n\n- [MDS logo PNG transparent](https://mediadays.solutions/brand/mds-logo.png)\n- [Paris Radio Show logo](https://mediadays.solutions/brand/prs-logo.png)\n\n## Main colors\n\n- MDS Blue: `#1A2B6E`\n- MDS Magenta: `#E91E63`\n\n## Typography\n\nInter (Google Fonts).',
  true, 30
),
(
  'plan-salle-carrousel',
  'Plan du Carrousel du Louvre — Paris 15 décembre',
  'Carrousel du Louvre floor plan — Paris December 15',
  E'# Plan de salle — Carrousel du Louvre\n\nL''étape Paris se déroule au Carrousel du Louvre le 15 décembre 2026.\n\n## Salles\n\n- **Salle Le Nôtre** : pôles AUDIO & RADIO + DIFFUSION & INFRA\n- **Salle Soufflot** : pôles VIDÉO & CTV + OUTDOOR & DOOH + DATA & ADTECH\n\nLe plan détaillé sera communiqué J-15.',
  E'# Floor plan — Carrousel du Louvre\n\nThe Paris event is held at Carrousel du Louvre on December 15, 2026.\n\n## Rooms\n\n- **Salle Le Nôtre**: AUDIO & RADIO + DIFFUSION & INFRA poles\n- **Salle Soufflot**: VIDEO & CTV + OUTDOOR & DOOH + DATA & ADTECH poles\n\nDetailed plan shared D-15.',
  true, 40
),
(
  'charte-affichage-stand',
  'Charte d''affichage stand',
  'Booth display guidelines',
  E'# Charte d''affichage stand\n\n## Dimensions autorisées\n\n- Totem max 2,5 m de haut\n- Aucun élément suspendu au plafond\n\n## Branding\n\nVotre logo doit être lisible à 5 m. Privilégiez les contrastes forts.\n\n## Éclairage\n\nÉvitez les éclairages stroboscopiques. Pas de néons éblouissants.',
  E'# Booth display guidelines\n\n## Allowed dimensions\n\n- Totem max 2.5m height\n- No ceiling-suspended elements\n\n## Branding\n\nYour logo must be readable from 5m away. Use strong contrasts.\n\n## Lighting\n\nAvoid strobe lighting. No blinding neons.',
  true, 50
)
on conflict (slug) do nothing;

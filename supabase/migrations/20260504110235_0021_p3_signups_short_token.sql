-- ============================================================================
-- 0021 — P3 M5 : ajout short_token sur public_signup_attempts.
--
-- CONTEXTE : le tracker de clic Brevo enrobe les liens dans une URL de
-- redirection sur le custom tracking domain configure cote compte
-- (`r.mail.connectonair.com` chez Phil). Pour les URLs longues (notre JWT
-- DOI ~280 chars), Brevo retourne 404 SendinBlue avant meme d'atteindre
-- /api/signup/verify -> impossible de finaliser l'inscription.
--
-- La doc community Brevo confirme que (a) custom domain click tracking n'est
-- PAS dispo en self-serve (Enterprise only) et (b) desactiver le click
-- tracking n'est PAS dispo (idem Enterprise). On bascule donc sur Option B :
-- raccourcir le token DOI pour que l'URL passe sous la limite Brevo.
--
-- Format short token : 16 chars alphanumeriques (alphabet sans ambiguite,
-- pas de 0/O/I/l/1), 96 bits d'entropie via crypto.randomBytes(16). Collision
-- probabilite negligeable meme a 100k inscriptions.
--
-- BACKWARD COMPAT : on conserve la colonne doi_token JWT (rempli en parallele
-- a l'INSERT pour debug / rollback), mais l'URL utilise short_token. La route
-- /api/signup/verify accepte les deux parametres ?t= (nouveau, prioritaire)
-- et ?token= (legacy JWT, fallback) pour ne pas casser les inscriptions en
-- cours pendant le deploiement.
-- ============================================================================

alter table public.public_signup_attempts
  add column if not exists short_token varchar(20),
  add column if not exists short_token_expires_at timestamptz;

create unique index if not exists signup_attempts_short_token_unique
  on public.public_signup_attempts (short_token)
  where short_token is not null;

comment on column public.public_signup_attempts.short_token is
  'Token DOI court URL-safe (16 chars). Prefere a doi_token JWT pour eviter '
  'les 404 du tracker Brevo sur longues URLs. Genere via crypto.randomBytes.';

comment on column public.public_signup_attempts.short_token_expires_at is
  'Expiration du short_token (24h apres generation). Denormalise pour query.';

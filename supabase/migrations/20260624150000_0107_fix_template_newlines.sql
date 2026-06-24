-- P12.x micro-fix — les templates seedés en 0106 ont été insérés avec des
-- séquences littérales "\n" (chaîne SQL standard, pas E'') → on les convertit
-- en vrais sauts de ligne dans body_text. body_html utilise déjà des <p>.
UPDATE public.email_templates
SET body_text = REPLACE(body_text, '\n', E'\n')
WHERE body_text LIKE '%\n%';

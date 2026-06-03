'use client';

/**
 * P3.1 — rendu markdown sécurisé pour les ressources partenaire.
 *
 * - Pas de rehypeRaw : HTML brut ignoré (anti-XSS).
 * - Liens : target=_blank + rel=noopener noreferrer.
 * - Styles : typo MDS via classes Tailwind (titres, listes, code, etc.).
 *
 * Utilisé côté admin (preview drawer) et côté partenaire (page détail).
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownView({ body }: { body: string }) {
  return (
    <div className="text-md-text [&_a]:text-md-blue [&_blockquote]:border-md-border [&_code]:bg-md-bg-soft [&_h1]:text-md-blue-dark [&_h2]:text-md-blue-dark [&_h3]:text-md-blue-dark [&_pre]:bg-md-bg-soft [&_th]:bg-muted space-y-3 text-sm leading-relaxed [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-extrabold [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-xs [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

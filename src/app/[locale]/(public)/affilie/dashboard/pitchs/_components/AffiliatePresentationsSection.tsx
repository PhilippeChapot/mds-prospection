/**
 * P7.x.AffiliateCanvaPresentations — section Présentations commerciales.
 *
 * Server component pur (pas de 'use client') : pas d'event handlers,
 * juste des <a target="_blank"> vers Canva.
 */

import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  getPresentations,
  PRESENTATIONS_SECTION_TITLE,
  PRESENTATIONS_CTA_LABEL,
  type PresentationLocale,
} from '@/lib/affilie/presentations';

interface Props {
  locale: PresentationLocale;
}

export function AffiliatePresentationsSection({ locale }: Props) {
  const items = getPresentations(locale);
  const sectionTitle = PRESENTATIONS_SECTION_TITLE[locale];
  const ctaLabel = PRESENTATIONS_CTA_LABEL[locale];

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-md-blue-dark text-base font-bold">{sectionTitle}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border-md-border hover:border-md-blue hover:bg-md-blue/5 group flex flex-col gap-2 rounded-md border bg-white p-3 transition"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-2xl leading-none" aria-hidden>
                {item.icon}
              </span>
              <ExternalLink
                className="text-md-text-muted group-hover:text-md-blue mt-0.5 size-3.5 shrink-0"
                aria-hidden
              />
            </div>
            <div>
              <div className="text-md-text text-sm leading-snug font-semibold">{item.title}</div>
              <p className="text-md-text-muted mt-0.5 text-xs leading-relaxed">
                {item.description}
              </p>
            </div>
            <span className="text-md-blue mt-auto text-xs font-semibold">{ctaLabel}</span>
          </a>
        ))}
      </div>
    </Card>
  );
}

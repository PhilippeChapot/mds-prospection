import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function ComingSoon({
  title,
  phase,
  description,
}: {
  title: string;
  phase: 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
  description?: string;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
      <span className="text-md-magenta text-xs font-bold tracking-[0.25em] uppercase">
        A venir · {phase}
      </span>
      <h1 className="mt-3 font-[family-name:var(--font-montserrat)] text-3xl font-extrabold tracking-tight">
        {title}
      </h1>
      {description ? (
        <p className="text-md-text-muted mt-3 max-w-md text-sm">{description}</p>
      ) : null}
      <Link
        href="/admin"
        className="text-md-blue mt-8 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour au dashboard
      </Link>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Eye, ExternalLink } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import { SIGNUP_STATUS_CLASS, SIGNUP_STATUS_LABEL, type SignupRow } from './types';
import { cn } from '@/lib/utils';

interface Props {
  rows: SignupRow[];
}

export function SignupsListClient({ rows }: Props) {
  return (
    <div className="border-md-border overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-md-bg-soft text-md-text-muted text-left text-[11px] font-semibold tracking-wide uppercase">
          <tr>
            <Th>Date</Th>
            <Th>Email / Contact</Th>
            <Th>Société</Th>
            <Th>Catégorie</Th>
            <Th>Pôle (IA)</Th>
            <Th>Statut</Th>
            <Th className="w-px text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-md-border divide-y">
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row }: { row: SignupRow }) {
  const fullName = [row.contactFirstName, row.contactLastName].filter(Boolean).join(' ');
  const isPole = row.aiPoleCode && (POLE_CODES as readonly string[]).includes(row.aiPoleCode);
  return (
    <tr className="hover:bg-md-bg-soft/40">
      <Td>
        <div className="text-md-text">{formatDate(row.createdAt)}</div>
        <div className="text-md-text-muted text-[11px]">{formatTime(row.createdAt)}</div>
      </Td>
      <Td>
        <div className="text-md-text font-medium break-all">{row.email}</div>
        {fullName && <div className="text-md-text-muted text-[11px]">{fullName}</div>}
      </Td>
      <Td>
        <span className="text-md-text">{row.companyNameInput ?? '—'}</span>
        {row.derivedCategory === 'prs_exhibitor' && (
          <span className="bg-md-magenta/10 text-md-magenta ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
            PRS
          </span>
        )}
      </Td>
      <Td>
        {row.category ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              row.category === 'exposant'
                ? 'bg-md-blue/10 text-md-blue'
                : 'bg-md-warning/15 text-md-warning',
            )}
          >
            {row.category === 'exposant' ? 'Exposant' : 'Partenaire'}
          </span>
        ) : (
          <span className="text-md-text-muted text-xs">—</span>
        )}
      </Td>
      <Td>
        {isPole ? (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="cursor-pointer">
                <PoleWithConfidence
                  code={row.aiPoleCode as PoleCode}
                  confidence={row.aiConfidence}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="max-w-sm text-xs">
              <p className="font-semibold">
                {row.aiPoleCode} · confiance {Math.round((row.aiConfidence ?? 0) * 100)}%
              </p>
              {row.aiReasoning && <p className="text-md-text-muted mt-1">{row.aiReasoning}</p>}
            </PopoverContent>
          </Popover>
        ) : (
          <span className="text-md-text-muted text-xs">—</span>
        )}
      </Td>
      <Td>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
            SIGNUP_STATUS_CLASS[row.status],
          )}
        >
          <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
          {SIGNUP_STATUS_LABEL[row.status]}
        </span>
        {row.convertedToProspectId && (
          <Link
            href={`/admin/prospects/${row.convertedToProspectId}`}
            className="text-md-blue mt-1 inline-flex items-center gap-1 text-[10px] hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden /> prospect
          </Link>
        )}
      </Td>
      <Td className="text-right">
        <Link
          href={`/admin/signups/${row.id}`}
          className="border-md-border hover:border-md-blue/40 hover:bg-md-blue/5 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition"
        >
          <Eye className="size-3.5" aria-hidden /> Voir
        </Link>
      </Td>
    </tr>
  );
}

function PoleWithConfidence({ code, confidence }: { code: PoleCode; confidence: number | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <PoleBadge code={code} />
      {confidence != null && (
        <span className="text-md-text-muted text-[10px]">{Math.round(confidence * 100)}%</span>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2.5', className)}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2.5 align-middle', className)}>{children}</td>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

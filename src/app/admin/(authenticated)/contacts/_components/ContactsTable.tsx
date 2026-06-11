'use client';

import Link from 'next/link';
import { Phone, Smartphone, ArrowRight } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { ContactEnrichCoAButton } from './ContactEnrichCoAButton';
import { formatPhoneForDisplay } from '@/lib/utils/phone-format';
import type { ContactListRow } from '@/lib/contacts/admin-queries';
import type { PoleCode } from '@/lib/design-tokens';
import { AdminDataTable } from '@/components/admin/AdminDataTable';

const columns: ColumnDef<ContactListRow>[] = [
  {
    id: 'contact',
    header: 'Contact',
    size: 220,
    minSize: 160,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div>
          <Link
            href={`/admin/companies/${r.company.id}#contact-${r.id}`}
            className="block hover:underline"
          >
            <div className="text-md-text truncate font-semibold">
              {[r.first_name, r.last_name].filter(Boolean).join(' ') || r.email}
            </div>
            <div className="text-md-text-muted truncate text-xs">{r.email}</div>
            {r.role ? (
              <div className="text-md-text-muted truncate text-[10px]">{r.role}</div>
            ) : null}
          </Link>
          {r.phone_mobile ? (
            <a
              href={`tel:${r.phone_mobile}`}
              className="text-md-text-muted hover:text-md-blue mt-0.5 inline-flex items-center gap-1 text-[11px]"
              title="Appeler le mobile"
            >
              <Smartphone className="size-3" aria-hidden />
              {formatPhoneForDisplay(r.phone_mobile)}
            </a>
          ) : null}
        </div>
      );
    },
  },
  {
    id: 'company',
    header: 'Société',
    size: 190,
    minSize: 140,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div>
          <Link
            href={`/admin/companies/${r.company.id}`}
            className="text-md-blue truncate text-xs font-medium hover:underline"
          >
            {r.company.name}
          </Link>
          {r.company.phone ? (
            <a
              href={`tel:${r.company.phone}`}
              className="text-md-text-muted hover:text-md-blue mt-0.5 flex items-center gap-1 text-[11px]"
              title="Appeler la société"
            >
              <Phone className="size-3" aria-hidden />
              {formatPhoneForDisplay(r.company.phone)}
            </a>
          ) : null}
        </div>
      );
    },
  },
  {
    id: 'pole',
    header: 'Pôle',
    size: 90,
    minSize: 70,
    cell: ({ row }) =>
      row.original.company.pole_code ? (
        <PoleBadge code={row.original.company.pole_code as PoleCode} />
      ) : (
        <span className="text-md-text-muted text-xs">—</span>
      ),
  },
  {
    id: 'lang',
    header: 'Lang',
    size: 70,
    minSize: 60,
    cell: ({ row }) => (
      <span className="text-md-text font-mono text-xs">{row.original.language}</span>
    ),
  },
  {
    id: 'primary',
    header: 'Primary',
    size: 95,
    minSize: 75,
    cell: ({ row }) =>
      row.original.is_primary ? (
        <span className="bg-md-blue/10 text-md-blue rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
          ★ Primary
        </span>
      ) : (
        <span className="text-md-text-muted text-xs">—</span>
      ),
  },
  {
    id: 'lifecycle',
    header: 'Lifecycle',
    size: 90,
    minSize: 70,
    cell: ({ row }) =>
      row.original.lifecycle_emails_enabled ? (
        <span className="text-xs text-emerald-600">✓ on</span>
      ) : (
        <span className="text-md-text-muted text-xs">✗ off</span>
      ),
  },
  {
    id: 'brevo',
    header: 'Brevo',
    size: 90,
    minSize: 70,
    cell: ({ row }) =>
      row.original.brevo_contact_id ? (
        <span className="text-xs text-emerald-600">✓ sync</span>
      ) : (
        <span className="text-xs text-amber-600">— not sync</span>
      ),
  },
  {
    id: 'prospect',
    header: 'Prospect',
    size: 130,
    minSize: 90,
    cell: ({ row }) => {
      const r = row.original;
      return r.is_prospect ? (
        <span className="inline-flex flex-col gap-0.5">
          <span className="font-semibold text-emerald-700">✅ Prospect</span>
          {r.prospect_owner?.full_name ? (
            <span className="text-[10px] text-emerald-600">{r.prospect_owner.full_name}</span>
          ) : null}
        </span>
      ) : (
        <span className="text-md-text-muted text-xs">—</span>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    meta: { headerLabel: 'Actions' },
    size: 150,
    minSize: 120,
    enableResizing: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <ContactEnrichCoAButton
          contactId={row.original.id}
          hasEmail={Boolean(row.original.email)}
        />
        <Link
          href={`/admin/prospects/new?contact_id=${row.original.id}`}
          title="Convertir en prospect"
          className="text-md-blue hover:text-md-blue-dark inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowRight className="size-3" aria-hidden />
          Convertir
        </Link>
      </div>
    ),
  },
];

export function ContactsTable({ rows }: { rows: ContactListRow[] }) {
  return (
    <AdminDataTable
      tableKey="contacts"
      columns={columns}
      data={rows}
      emptyMessage="Aucun contact ne correspond aux filtres."
    />
  );
}

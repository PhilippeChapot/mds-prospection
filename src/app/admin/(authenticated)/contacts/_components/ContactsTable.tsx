import Link from 'next/link';
import { ArrowRight, Phone, Smartphone } from 'lucide-react';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { ContactEnrichCoAButton } from './ContactEnrichCoAButton';
import { formatPhoneForDisplay } from '@/lib/utils/phone-format';
import type { ContactListRow } from '@/lib/contacts/admin-queries';
import type { PoleCode } from '@/lib/design-tokens';

export function ContactsTable({ rows }: { rows: ContactListRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border-md-border text-md-text-muted rounded-xl border p-12 text-center text-sm shadow-sm">
        Aucun contact ne correspond aux filtres.
      </div>
    );
  }

  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Société</th>
              <th className="px-4 py-3">Pôle</th>
              <th className="px-4 py-3">Lang</th>
              <th className="px-4 py-3">Primary</th>
              <th className="px-4 py-3">Lifecycle</th>
              <th className="px-4 py-3">Brevo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-md-border hover:bg-muted/30 border-t">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/companies/${row.company.id}#contact-${row.id}`}
                    className="block hover:underline"
                  >
                    <div className="text-md-text font-semibold">
                      {[row.first_name, row.last_name].filter(Boolean).join(' ') || row.email}
                    </div>
                    <div className="text-md-text-muted text-xs">{row.email}</div>
                    {row.role ? (
                      <div className="text-md-text-muted text-[10px]">{row.role}</div>
                    ) : null}
                  </Link>
                  {row.phone_mobile ? (
                    <a
                      href={`tel:${row.phone_mobile}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-md-text-muted hover:text-md-blue mt-0.5 inline-flex items-center gap-1 text-[11px]"
                      title="Appeler le mobile"
                    >
                      <Smartphone className="size-3" aria-hidden />
                      {formatPhoneForDisplay(row.phone_mobile)}
                    </a>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/companies/${row.company.id}`}
                    className="text-md-blue text-xs font-medium hover:underline"
                  >
                    {row.company.name}
                  </Link>
                  {row.company.phone ? (
                    <a
                      href={`tel:${row.company.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-md-text-muted hover:text-md-blue mt-0.5 flex items-center gap-1 text-[11px]"
                      title="Appeler la société"
                    >
                      <Phone className="size-3" aria-hidden />
                      {formatPhoneForDisplay(row.company.phone)}
                    </a>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {row.company.pole_code ? (
                    <PoleBadge code={row.company.pole_code as PoleCode} />
                  ) : (
                    <span className="text-md-text-muted text-xs">—</span>
                  )}
                </td>
                <td className="text-md-text px-4 py-3 font-mono text-xs">{row.language}</td>
                <td className="px-4 py-3">
                  {row.is_primary ? (
                    <span className="bg-md-blue/10 text-md-blue rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                      ★ Primary
                    </span>
                  ) : (
                    <span className="text-md-text-muted text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.lifecycle_emails_enabled ? (
                    <span className="text-emerald-600">✓ on</span>
                  ) : (
                    <span className="text-md-text-muted">✗ off</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.brevo_contact_id ? (
                    <span className="text-emerald-600">✓ sync</span>
                  ) : (
                    <span className="text-amber-600">— not sync</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <ContactEnrichCoAButton contactId={row.id} hasEmail={Boolean(row.email)} />
                    <Link
                      href={`/admin/prospects/new?contact_id=${row.id}`}
                      title="Convertir en prospect"
                      className="text-md-blue hover:text-md-blue-dark inline-flex items-center gap-1 text-xs font-semibold"
                    >
                      <ArrowRight className="size-3" aria-hidden />
                      Convertir
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

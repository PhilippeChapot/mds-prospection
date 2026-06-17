'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  AddAffiliateClaimModal,
  type AffiliatePickerItem,
} from '@/components/admin/affiliate-claims/AddAffiliateClaimModal';

function sourceLabel(source: string): string {
  if (source === 'cookie_tracking') return '🍪 Cookie';
  if (source === 'declared_by_company') return '🏢 Société';
  if (source === 'declared_by_affiliate') return '👤 Affilié';
  if (source === 'manual_admin') return '👤 Admin';
  return source;
}

export interface CompanyClaimRow {
  id: string;
  affiliateId: string;
  affiliateName: string;
  source: string;
  status: 'active' | 'pending';
  validatedAt: string | null;
  notesAdmin: string | null;
}

export function AffiliateClaimsSection({
  companyId,
  claims,
  affiliates,
}: {
  companyId: string;
  claims: CompanyClaimRow[];
  affiliates: AffiliatePickerItem[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-md-text-muted text-xs">
            {claims.length === 0
              ? 'Aucun affilié rattaché à cette société.'
              : `${claims.length} affilié(s) rattaché(s).`}
          </span>
          {affiliates.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
              + Lier un apporteur
            </Button>
          ) : null}
        </div>

        {claims.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-md-text-muted border-md-border border-b text-xs">
                <th className="pb-2 text-left font-medium">Affilié</th>
                <th className="pb-2 text-left font-medium">Statut</th>
                <th className="pb-2 text-left font-medium">Source</th>
                <th className="pb-2 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-md-border divide-y">
              {claims.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/affiliates/${c.affiliateId}`}
                      className="text-md-blue font-medium hover:underline"
                    >
                      {c.affiliateName}
                    </Link>
                    {c.notesAdmin ? (
                      <div className="text-md-text-muted mt-0.5 text-[10px] italic">
                        {c.notesAdmin}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        c.status === 'active'
                          ? 'bg-md-success/15 text-md-success rounded-full px-2 py-0.5 text-[10px] font-semibold'
                          : 'rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700'
                      }
                    >
                      {c.status === 'active' ? '✅ Actif' : '⏳ En attente'}
                    </span>
                  </td>
                  <td className="text-md-text-muted py-2 pr-4 text-xs">{sourceLabel(c.source)}</td>
                  <td className="text-md-text-muted py-2 text-xs">
                    {c.validatedAt
                      ? new Date(c.validatedAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <AddAffiliateClaimModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        affiliates={affiliates}
        companyId={companyId}
      />
    </>
  );
}

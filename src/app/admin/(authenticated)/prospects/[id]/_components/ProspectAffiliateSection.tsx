'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AddAffiliateClaimModal,
  type AffiliatePickerItem,
} from '@/components/admin/affiliate-claims/AddAffiliateClaimModal';

export function ProspectAffiliateSection({
  affiliateId,
  affiliateName,
  affiliateCommission,
  prospectId,
  affiliates,
}: {
  affiliateId: string | null;
  affiliateName: string | null;
  affiliateCommission: number | null;
  prospectId: string;
  affiliates: AffiliatePickerItem[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (affiliateId && affiliateName) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/affiliates/${affiliateId}`}
          className="text-md-blue font-medium hover:underline"
        >
          {affiliateName}
        </Link>
        {affiliateCommission != null ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
            {affiliateCommission}%
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-md-text-muted">—</span>
        {affiliates.length > 0 ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-md-blue text-xs hover:underline"
          >
            + Lier un apporteur
          </button>
        ) : null}
      </div>

      <AddAffiliateClaimModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        affiliates={affiliates}
        prospectId={prospectId}
      />
    </>
  );
}

'use client';

import { useTransition } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { exportContactsCsvAction, type ExportContactsFilters } from './export-action';

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reserve super_admin — le parent (page.tsx) ne rend ce composant que si
 * profile.role==='super_admin' (couche UI gating de la doctrine
 * feedback_super_admin_destructive_actions_pattern). La couche serveur
 * (requireSuperAdmin dans export-action.ts) reste la garde-fou reel.
 */
export function ExportContactsButton({ filters }: { filters: ExportContactsFilters }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await exportContactsCsvAction(filters);
            downloadCsv(result.csv, result.filename);
            toast.success(`Export telecharge : ${result.filename}`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Erreur export');
          }
        })
      }
      disabled={pending}
    >
      <Download className="size-4" aria-hidden />
      {pending ? 'Export…' : 'Exporter CSV'}
    </Button>
  );
}

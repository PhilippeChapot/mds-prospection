'use client';

import { useTransition } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { exportCompaniesCsvAction, type ExportCompaniesFilters } from './export-action';

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

export function CompaniesExportButton({ filters }: { filters: ExportCompaniesFilters }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await exportCompaniesCsvAction(filters);
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

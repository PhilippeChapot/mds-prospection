'use client';

import { useState, useEffect, useRef } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type VisibilityState,
  type RowData,
} from '@tanstack/react-table';
import { Settings2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Augment TanStack ColumnMeta to carry display metadata.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Human-readable label shown in the column-visibility dropdown (fallback: header string or id). */
    headerLabel?: string;
    /** Extra class applied to <td> for this column (e.g. text-right, px-3). */
    cellClassName?: string;
  }
}

// ─── localStorage helpers (exported for tests) ────────────────────────────────

export const LS_PREFIX = 'mds:tablePrefs:';

export type TablePrefs = {
  columnSizing: ColumnSizingState;
  columnVisibility: VisibilityState;
};

export function readTablePrefs(tableKey: string): TablePrefs {
  try {
    if (typeof window === 'undefined') return { columnSizing: {}, columnVisibility: {} };
    const raw = window.localStorage.getItem(LS_PREFIX + tableKey);
    if (!raw) return { columnSizing: {}, columnVisibility: {} };
    return JSON.parse(raw) as TablePrefs;
  } catch {
    return { columnSizing: {}, columnVisibility: {} };
  }
}

export function writeTablePrefs(tableKey: string, prefs: TablePrefs): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LS_PREFIX + tableKey, JSON.stringify(prefs));
  } catch {
    /* noop — localStorage unavailable (SSR / private browsing) */
  }
}

export function clearTablePrefs(tableKey: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(LS_PREFIX + tableKey);
  } catch {
    /* noop */
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AdminDataTableProps<TData> {
  /** Unique key used for localStorage persistence (e.g. "contacts"). */
  tableKey: string;
  columns: ColumnDef<TData>[];
  data: TData[];
  /** Fallback message shown when the data array is empty. */
  emptyMessage?: string;
  /** Optional per-row className (e.g. highlight selected rows). */
  getRowClassName?: (row: TData) => string;
}

export function AdminDataTable<TData>({
  tableKey,
  columns,
  data,
  emptyMessage = 'Aucune ligne ne correspond aux filtres.',
  getRowClassName,
}: AdminDataTableProps<TData>) {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Refs to coordinate restore → save without writing empty state on first render.
  const prefsRestoredRef = useRef(false);
  const isInitialSaveRef = useRef(true);

  // Restore from localStorage on mount.
  useEffect(() => {
    const prefs = readTablePrefs(tableKey);
    setColumnSizing(prefs.columnSizing);
    setColumnVisibility(prefs.columnVisibility);
    prefsRestoredRef.current = true;
  }, [tableKey]);

  // Persist after restore (skip the very first run to avoid overwriting before restore).
  useEffect(() => {
    if (isInitialSaveRef.current) {
      isInitialSaveRef.current = false;
      return;
    }
    if (!prefsRestoredRef.current) return;
    writeTablePrefs(tableKey, { columnSizing, columnVisibility });
  }, [tableKey, columnSizing, columnVisibility]);

  const table = useReactTable({
    data,
    columns,
    state: { columnSizing, columnVisibility },
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
  });

  function handleReset() {
    clearTablePrefs(tableKey);
    isInitialSaveRef.current = false;
    setColumnSizing({});
    setColumnVisibility({});
  }

  const hideableColumns = table.getAllColumns().filter((c) => c.getCanHide());
  const visibleLeafCount = table.getVisibleLeafColumns().length;

  function getColLabel(col: ReturnType<typeof table.getAllColumns>[number]): string {
    const meta = col.columnDef.meta as { headerLabel?: string } | undefined;
    if (meta?.headerLabel) return meta.headerLabel;
    if (typeof col.columnDef.header === 'string') return col.columnDef.header;
    return col.id;
  }

  return (
    <div className="space-y-2">
      {/* Toolbar: column visibility */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              title="Afficher/masquer des colonnes"
              aria-label="Paramètres des colonnes"
            >
              <Settings2 className="size-3.5" aria-hidden />
              <span className="ml-1.5">Colonnes</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 min-w-[180px] overflow-y-auto">
            {hideableColumns.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={col.getIsVisible()}
                onCheckedChange={(val) => col.toggleVisibility(val === true)}
              >
                {getColLabel(col)}
              </DropdownMenuCheckboxItem>
            ))}
            {hideableColumns.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={handleReset} className="text-md-text-muted gap-1.5 text-xs">
              <RefreshCw className="size-3" aria-hidden />
              Réinitialiser les colonnes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        {visibleLeafCount === 0 ? (
          <div className="text-md-text-muted p-12 text-center text-sm">
            Aucune colonne affichée.{' '}
            <button type="button" onClick={handleReset} className="text-md-blue underline">
              Réinitialiser
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="text-left text-sm"
              style={{ tableLayout: 'fixed', width: table.getTotalSize() }}
            >
              <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="relative px-4 py-3 select-none"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={cn(
                              'absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none',
                              'hover:bg-md-magenta/40',
                              header.column.getIsResizing() && 'bg-md-magenta/60',
                            )}
                            title="Redimensionner cette colonne"
                            aria-hidden
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleLeafCount}
                      className="text-md-text-muted px-4 py-12 text-center text-sm"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-md-border hover:bg-muted/30 border-t',
                        getRowClassName?.(row.original),
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const cellCls = (
                          cell.column.columnDef.meta as { cellClassName?: string } | undefined
                        )?.cellClassName;
                        return (
                          <td
                            key={cell.id}
                            className={cn('overflow-hidden px-4 py-3', cellCls)}
                            style={{ width: cell.column.getSize() }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * P5.x.TableResizableColumns — tests AdminDataTable
 *
 * Couvre :
 *   - readTablePrefs / writeTablePrefs / clearTablePrefs (localStorage helpers)
 *   - AdminDataTable render de base (données présentes)
 *   - AdminDataTable "Aucune colonne affichée" quand tout est masqué via localStorage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  readTablePrefs,
  writeTablePrefs,
  clearTablePrefs,
  LS_PREFIX,
  AdminDataTable,
} from './AdminDataTable';

beforeEach(() => {
  localStorage.clear();
});

// ─── localStorage helpers ────────────────────────────────────────────────────

describe('readTablePrefs', () => {
  it('returns empty defaults when key not found in localStorage', () => {
    const prefs = readTablePrefs('nonexistent-table');
    expect(prefs.columnSizing).toEqual({});
    expect(prefs.columnVisibility).toEqual({});
  });

  it('returns stored prefs when key exists', () => {
    const stored = { columnSizing: { name: 200, role: 80 }, columnVisibility: { role: false } };
    localStorage.setItem(LS_PREFIX + 'my-table', JSON.stringify(stored));
    const prefs = readTablePrefs('my-table');
    expect(prefs.columnSizing).toEqual(stored.columnSizing);
    expect(prefs.columnVisibility).toEqual(stored.columnVisibility);
  });
});

describe('writeTablePrefs + clearTablePrefs', () => {
  it('writeTablePrefs persists prefs; readTablePrefs round-trips them', () => {
    const prefs = { columnSizing: { col1: 300 }, columnVisibility: { col1: false } };
    writeTablePrefs('rt-table', prefs);
    const restored = readTablePrefs('rt-table');
    expect(restored.columnSizing).toEqual(prefs.columnSizing);
    expect(restored.columnVisibility).toEqual(prefs.columnVisibility);
  });

  it('clearTablePrefs removes prefs so readTablePrefs returns empty defaults', () => {
    writeTablePrefs('clear-table', { columnSizing: { x: 100 }, columnVisibility: {} });
    clearTablePrefs('clear-table');
    const prefs = readTablePrefs('clear-table');
    expect(prefs.columnSizing).toEqual({});
    expect(prefs.columnVisibility).toEqual({});
  });
});

// ─── AdminDataTable component ─────────────────────────────────────────────────

type TestRow = { id: string; name: string };

const TEST_COLUMNS: ColumnDef<TestRow>[] = [
  {
    id: 'name',
    header: 'Nom',
    cell: ({ row }) => <span data-testid="cell-name">{row.original.name}</span>,
  },
];

const TEST_DATA: TestRow[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

describe('AdminDataTable component', () => {
  it('renders a row for each data entry', () => {
    render(
      <AdminDataTable<TestRow> tableKey="test-render" columns={TEST_COLUMNS} data={TEST_DATA} />,
    );
    expect(screen.getAllByTestId('cell-name')).toHaveLength(2);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows "Aucune colonne affichée" message when all columns are hidden in localStorage', () => {
    // Pre-load localStorage so the restore effect hides the only column.
    writeTablePrefs('test-hidden', {
      columnSizing: {},
      columnVisibility: { name: false },
    });

    render(
      <AdminDataTable<TestRow> tableKey="test-hidden" columns={TEST_COLUMNS} data={TEST_DATA} />,
    );

    // After the restore useEffect fires, 'name' is hidden → visibleLeafCount = 0.
    expect(screen.getByText(/Aucune colonne affichée/)).toBeInTheDocument();
    // Data rows should NOT be visible.
    expect(screen.queryByText('Alice')).toBeNull();
  });
});

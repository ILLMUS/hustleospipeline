import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  computeDrawerData,
  isLineItemLike,
  normalizeItems,
  ReceiptDrawerContent,
  fmtMoney,
  safeDate,
  type AllocationLike,
  type MoneyEntryLike,
} from '@/pages/moneyTracker/receiptDrawer';
import type { QuoteDocument } from '@/types/document';

function makeEntry(overrides: Partial<MoneyEntryLike> = {}): MoneyEntryLike {
  return {
    id: 'e1',
    document_id: 'd1',
    receipt_number: 'REC-0001',
    client_name: 'Acme Corp',
    items: [{ id: 'i1', description: 'Widget', quantity: 2, unitPrice: 50 }],
    amount: 100,
    entry_date: '2026-07-01',
    ...overrides,
  };
}

function makeDoc(overrides: Partial<QuoteDocument> = {}): QuoteDocument {
  return {
    id: 'd1',
    type: 'receipt',
    quoteNumber: 'Q-0001',
    invoiceNumber: 'INV-0001',
    receiptNumber: 'REC-0001',
    title: 'Order 42',
    businessInfo: { logo: null, name: 'Biz', address: '', phone: '', email: '' },
    clientInfo: { name: 'Acme Corp', address: '1 St', phone: '555', email: 'a@b.c' },
    items: [{ id: 'i1', description: 'Widget', quantity: 2, unitPrice: 50 }],
    taxRate: 10,
    termsAndConditions: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    issueDate: '2026-07-01',
    dueDate: '2026-07-15',
    ...overrides,
  };
}

const allocs: AllocationLike[] = [
  { id: 'a1', money_entry_id: 'e1', bucket: 'expenses', amount: 40, note: 'Auto 40%', is_auto: true },
  { id: 'a2', money_entry_id: 'e1', bucket: 'reserve', amount: 20, note: 'Auto 20%', is_auto: true },
  { id: 'a3', money_entry_id: 'e1', bucket: 'taxes', amount: 25, note: 'Auto 25%', is_auto: true },
  { id: 'a4', money_entry_id: 'e1', bucket: 'debts', amount: 15, note: 'Auto 15%', is_auto: true },
  { id: 'a5', money_entry_id: 'other', bucket: 'expenses', amount: 999, note: 'other entry', is_auto: true },
];

describe('type guards & normalization', () => {
  it('isLineItemLike rejects nulls, primitives, arrays', () => {
    expect(isLineItemLike(null)).toBe(false);
    expect(isLineItemLike(undefined)).toBe(false);
    expect(isLineItemLike('x')).toBe(false);
    expect(isLineItemLike(5)).toBe(false);
    expect(isLineItemLike([])).toBe(false);
    expect(isLineItemLike({})).toBe(false);
    expect(isLineItemLike({ description: 'ok' })).toBe(true);
  });

  it('normalizeItems handles non-arrays, garbage items, and coerces numbers', () => {
    expect(normalizeItems(null)).toEqual([]);
    expect(normalizeItems('nope')).toEqual([]);
    const out = normalizeItems([
      { description: 'A', quantity: '3', unitPrice: '10' },
      null,
      'junk',
      { quantity: 1 }, // missing desc -> 'Item'
    ]);
    expect(out).toEqual([
      { description: 'A', quantity: 3, unitPrice: 10, total: 30 },
      { description: 'Item', quantity: 1, unitPrice: 0, total: 0 },
    ]);
  });

  it('safeDate returns null for bad input and fmtMoney handles NaN', () => {
    expect(safeDate('')).toBeNull();
    expect(safeDate('not-a-date')).toBeNull();
    expect(safeDate(null as any)).toBeNull();
    expect(fmtMoney(NaN)).toBe('E0.00');
    expect(fmtMoney('12.5')).toBe('E12.50');
  });
});

describe('computeDrawerData', () => {
  it('returns null when entry is missing or invalid', () => {
    expect(computeDrawerData(null, null, [])).toBeNull();
    expect(computeDrawerData({} as any, null, [])).toBeNull();
  });

  it('filters allocations to the entry and sums per bucket', () => {
    const data = computeDrawerData(makeEntry(), makeDoc(), allocs)!;
    expect(data).not.toBeNull();
    expect(data.allocations).toHaveLength(4);
    expect(data.perBucket).toEqual({ expenses: 40, reserve: 20, taxes: 25, debts: 15 });
    expect(data.amount).toBe(100);
    expect(data.hasReceiptRef).toBe(true);
  });

  it('computes subtotal + tax from the document', () => {
    const data = computeDrawerData(makeEntry(), makeDoc({ taxRate: 10 }), allocs)!;
    expect(data.subtotal).toBe(100);
    expect(data.taxRate).toBe(10);
    expect(data.tax).toBeCloseTo(10);
  });

  it('falls back to entry.items when the doc reference is missing', () => {
    const data = computeDrawerData(makeEntry({ document_id: null }), null, allocs)!;
    expect(data.hasReceiptRef).toBe(false);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].total).toBe(100);
    expect(data.taxRate).toBe(0);
  });
});

describe('ReceiptDrawerContent rendering', () => {
  it('shows friendly empty state when no data', () => {
    render(<ReceiptDrawerContent data={null} />);
    expect(screen.getByTestId('drawer-empty')).toBeInTheDocument();
  });

  it('renders original receipt fields, who bought, and per-bucket allocations', () => {
    const data = computeDrawerData(makeEntry(), makeDoc(), allocs);
    render(<ReceiptDrawerContent data={data} />);

    // receipt fields
    expect(screen.getByText('Order 42')).toBeInTheDocument();
    expect(screen.getByText('Q-0001')).toBeInTheDocument();
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
    expect(screen.getAllByText('REC-0001').length).toBeGreaterThan(0);

    // who bought
    const who = screen.getByTestId('drawer-who');
    expect(who).toHaveTextContent('Acme Corp');
    expect(who).toHaveTextContent('a@b.c');

    // what they bought
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-subtotal')).toHaveTextContent('E100.00');
    expect(screen.getByTestId('drawer-tax')).toHaveTextContent('E10.00');
    expect(screen.getByTestId('drawer-total')).toHaveTextContent('E100.00');

    // per-bucket
    expect(screen.getByTestId('drawer-bucket-expenses-amount')).toHaveTextContent('E40.00');
    expect(screen.getByTestId('drawer-bucket-reserve-amount')).toHaveTextContent('E20.00');
    expect(screen.getByTestId('drawer-bucket-taxes-amount')).toHaveTextContent('E25.00');
    expect(screen.getByTestId('drawer-bucket-debts-amount')).toHaveTextContent('E15.00');
  });

  it('does not crash and shows fallback when document reference is missing', () => {
    const data = computeDrawerData(
      makeEntry({ document_id: null, client_name: null, items: null as any }),
      null,
      [],
    );
    render(<ReceiptDrawerContent data={data} />);
    expect(screen.getByTestId('drawer-missing-ref')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-no-items')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-who')).toHaveTextContent('Unknown');
    // all buckets render at E0.00
    ['expenses', 'reserve', 'taxes', 'debts'].forEach((b) => {
      expect(screen.getByTestId(`drawer-bucket-${b}-amount`)).toHaveTextContent('E0.00');
    });
  });

  it('handles malformed entry.items array without crashing', () => {
    const data = computeDrawerData(
      makeEntry({ document_id: null, items: [null, 'bad', { description: 'Good', quantity: 1, unitPrice: 5 }] as any }),
      null,
      [],
    );
    render(<ReceiptDrawerContent data={data} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-subtotal')).toHaveTextContent('E5.00');
  });
});
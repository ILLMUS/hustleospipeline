import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  computeDrawerData,
  ReceiptDrawerContent,
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
  { id: 'a2', money_entry_id: 'e1', bucket: 'reserve',  amount: 20, note: 'Auto 20%', is_auto: true },
  { id: 'a3', money_entry_id: 'e1', bucket: 'taxes',    amount: 25, note: 'Auto 25%', is_auto: true },
  { id: 'a4', money_entry_id: 'e1', bucket: 'debts',    amount: 15, note: null,       is_auto: false },
];

/**
 * Snapshot tests locking down the drawer layout for known input shapes.
 * These catch layout regressions when receipt references and items are
 * partially missing — a common real-world state for imported receipts.
 */
describe('ReceiptDrawerContent — layout snapshots', () => {
  it('matches snapshot: no data (empty state)', () => {
    const { container } = render(<ReceiptDrawerContent data={null} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot: full receipt + doc + all four allocations', () => {
    const data = computeDrawerData(makeEntry(), makeDoc(), allocs);
    const { container } = render(<ReceiptDrawerContent data={data} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot: doc reference missing, falls back to entry items', () => {
    const data = computeDrawerData(
      makeEntry({ document_id: null }),
      null,
      allocs,
    );
    const { container } = render(<ReceiptDrawerContent data={data} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot: doc reference missing AND items null AND no allocations', () => {
    const data = computeDrawerData(
      makeEntry({ document_id: null, client_name: null, items: null as any }),
      null,
      [],
    );
    const { container } = render(<ReceiptDrawerContent data={data} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot: doc present but with partial fields (no quote #, no due date, no tax)', () => {
    const data = computeDrawerData(
      makeEntry(),
      makeDoc({ quoteNumber: '', dueDate: '', taxRate: 0, title: '' }),
      allocs.slice(0, 2),
    );
    const { container } = render(<ReceiptDrawerContent data={data} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot: malformed items array is filtered without breaking layout', () => {
    const data = computeDrawerData(
      makeEntry({
        document_id: null,
        items: [null, 'bad', 42, { description: 'Good', quantity: 1, unitPrice: 5 }] as any,
      }),
      null,
      [],
    );
    const { container } = render(<ReceiptDrawerContent data={data} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot: entry with missing receipt_number and unknown client', () => {
    const data = computeDrawerData(
      makeEntry({ receipt_number: null, client_name: null, document_id: null }),
      null,
      [],
    );
    const { container } = render(<ReceiptDrawerContent data={data} />);
    expect(container).toMatchSnapshot();
  });
});
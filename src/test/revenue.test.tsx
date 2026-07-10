import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuoteDocument, calculateGrandTotal } from '@/types/document';

function makeDoc(overrides: Partial<QuoteDocument>): QuoteDocument {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: overrides.type ?? 'quote',
    quoteNumber: 'Q-0001',
    title: 'Test',
    businessInfo: { logo: null, name: 'B', address: '', phone: '', email: '' },
    clientInfo: { name: 'C', address: '', phone: '', email: '' },
    items: overrides.items ?? [{ id: '1', description: 'x', quantity: 1, unitPrice: 100 }],
    taxRate: overrides.taxRate ?? 0,
    termsAndConditions: '',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    ...overrides,
  } as QuoteDocument;
}

const mockDocs: QuoteDocument[] = [
  makeDoc({ type: 'quote', items: [{ id: 'a', description: 'q', quantity: 1, unitPrice: 1000 }] }),
  makeDoc({ type: 'invoice', items: [{ id: 'b', description: 'i', quantity: 1, unitPrice: 500 }] }),
  makeDoc({ type: 'receipt', items: [{ id: 'c', description: 'r1', quantity: 1, unitPrice: 200 }] }),
  makeDoc({ type: 'receipt', items: [{ id: 'd', description: 'r2', quantity: 2, unitPrice: 50 }] }),
];

vi.mock('@/context/DocumentContext', () => ({
  useDocuments: () => ({ documents: mockDocs, loading: false, addDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn() }),
}));

// Recharts needs a size; mock ResponsiveContainer to a fixed box.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 400, height: 200 }}>{children}</div>
    ),
  };
});

describe('Total Revenue calculation', () => {
  it('sums only receipts, excluding quotes and invoices', () => {
    const total = mockDocs
      .filter(d => d.type === 'receipt')
      .reduce((sum, d) => sum + calculateGrandTotal(d.items, d.taxRate), 0);
    // receipts: 200 + (2*50)=100 => 300
    expect(total).toBe(300);
  });

  it('would be wrong if quotes or invoices were included', () => {
    const wrong = mockDocs.reduce((sum, d) => sum + calculateGrandTotal(d.items, d.taxRate), 0);
    expect(wrong).not.toBe(300);
    expect(wrong).toBe(1800);
  });
});

describe('RevenueChart', () => {
  it('renders and only aggregates receipt documents', async () => {
    const RevenueChart = (await import('@/components/RevenueChart')).default;
    render(<RevenueChart />);
    // Chart renders because receipts exist (hasData branch)
    expect(screen.getByText(/Monthly Revenue/i)).toBeInTheDocument();
  });

  it('renders nothing when there are no receipts (quotes/invoices ignored)', async () => {
    vi.resetModules();
    vi.doMock('@/context/DocumentContext', () => ({
      useDocuments: () => ({
        documents: [
          makeDoc({ type: 'quote', items: [{ id: 'a', description: 'q', quantity: 1, unitPrice: 9999 }] }),
          makeDoc({ type: 'invoice', items: [{ id: 'b', description: 'i', quantity: 1, unitPrice: 9999 }] }),
        ],
        loading: false, addDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn(),
      }),
    }));
    const RevenueChart = (await import('@/components/RevenueChart')).default;
    const { container } = render(<RevenueChart />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Source guardrails', () => {
  it('Dashboard.tsx totalRevenue filter uses receipt only', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');
    // Find the totalRevenue useMemo block
    const match = src.match(/const totalRevenue = useMemo\(\(\) => \{[\s\S]*?\}, \[documents\]\);/);
    expect(match, 'totalRevenue useMemo block not found').toBeTruthy();
    const block = match![0];
    expect(block).toMatch(/d\.type === ['"]receipt['"]/);
    expect(block).not.toMatch(/d\.type === ['"]quote['"]/);
    expect(block).not.toMatch(/d\.type === ['"]invoice['"]/);
  });

  it('RevenueChart.tsx filter uses receipt only', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/RevenueChart.tsx', 'utf-8');
    expect(src).toMatch(/\.filter\(d => d\.type === ['"]receipt['"]\)/);
    expect(src).not.toMatch(/d\.type === ['"]quote['"]/);
    expect(src).not.toMatch(/d\.type === ['"]invoice['"]/);
  });
});
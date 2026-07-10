import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Wallet, PiggyBank, Landmark, TrendingDown, Receipt } from 'lucide-react';
import type { QuoteDocument, LineItem } from '@/types/document';

export type Bucket = 'expenses' | 'reserve' | 'taxes' | 'debts';

export interface MoneyEntryLike {
  id: string;
  document_id: string | null;
  receipt_number: string | null;
  client_name: string | null;
  items: unknown;
  amount: number | string;
  entry_date: string;
}

export interface AllocationLike {
  id: string;
  money_entry_id: string;
  bucket: Bucket;
  amount: number | string;
  note: string | null;
  is_auto: boolean;
}

export const BUCKET_META: Record<Bucket, { label: string; icon: any; color: string; bg: string }> = {
  expenses: { label: 'Expenses', icon: Wallet,      color: 'text-warning',     bg: 'bg-warning/10' },
  reserve:  { label: 'Reserve',  icon: PiggyBank,   color: 'text-success',     bg: 'bg-success/10' },
  taxes:    { label: 'Taxes',    icon: Landmark,    color: 'text-primary',     bg: 'bg-primary/10' },
  debts:    { label: 'Debts',    icon: TrendingDown, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export function fmtMoney(amount: unknown): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return `E${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function safeDate(input: unknown): Date | null {
  if (typeof input !== 'string' || !input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(input: unknown, pattern = 'dd MMM yyyy'): string {
  const d = safeDate(input);
  return d ? format(d, pattern) : '—';
}

export interface NormalizedItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Type guard: value looks enough like a line item to render. */
export function isLineItemLike(x: unknown): x is Partial<LineItem> {
  if (!isPlainObject(x)) return false;
  const hasQty = 'quantity' in x || 'unitPrice' in x || 'description' in x;
  return hasQty;
}

export function normalizeItems(raw: unknown): NormalizedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isLineItemLike).map((it) => {
    const quantity = Number((it as any).quantity) || 0;
    const unitPrice = Number((it as any).unitPrice) || 0;
    const description = typeof (it as any).description === 'string' && (it as any).description
      ? (it as any).description
      : 'Item';
    return { description, quantity, unitPrice, total: quantity * unitPrice };
  });
}

export interface DrawerData {
  entry: MoneyEntryLike;
  doc: QuoteDocument | null;
  items: NormalizedItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  amount: number;
  perBucket: Record<Bucket, number>;
  allocations: AllocationLike[];
  hasReceiptRef: boolean;
}

export function computeDrawerData(
  entry: MoneyEntryLike | null | undefined,
  doc: QuoteDocument | null | undefined,
  allAllocations: AllocationLike[] | null | undefined,
): DrawerData | null {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') return null;
  const safeDoc = doc && typeof doc === 'object' ? doc : null;
  const rawItems = safeDoc?.items ?? entry.items;
  const items = normalizeItems(rawItems);
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const taxRate = Number(safeDoc?.taxRate) || 0;
  const tax = subtotal * (taxRate / 100);
  const amount = Number(entry.amount) || 0;
  const perBucket: Record<Bucket, number> = { expenses: 0, reserve: 0, taxes: 0, debts: 0 };
  const allocations = Array.isArray(allAllocations)
    ? allAllocations.filter((a) => a && a.money_entry_id === entry.id && (['expenses','reserve','taxes','debts'] as Bucket[]).includes(a.bucket))
    : [];
  allocations.forEach((a) => { perBucket[a.bucket] += Number(a.amount) || 0; });
  return {
    entry,
    doc: safeDoc,
    items,
    subtotal,
    taxRate,
    tax,
    amount,
    perBucket,
    allocations,
    hasReceiptRef: !!safeDoc,
  };
}

interface Props {
  data: DrawerData | null;
  onOpenPreview?: (documentId: string) => void;
}

/**
 * Presentational drawer body. Null-safe: renders a friendly empty state
 * when the entry is missing or the document reference is incomplete.
 */
export function ReceiptDrawerContent({ data, onOpenPreview }: Props) {
  if (!data) {
    return (
      <div data-testid="drawer-empty" className="p-6 text-sm text-muted-foreground">
        No receipt selected.
      </div>
    );
  }
  const { entry, doc, items, subtotal, taxRate, tax, amount, perBucket, allocations, hasReceiptRef } = data;

  return (
    <div data-testid="drawer-body">
      <div className="text-left">
        <h2 className="flex items-center gap-2 text-lg font-heading font-semibold">
          <Receipt className="h-4 w-4 text-primary" />
          {entry.receipt_number || 'Receipt'}
        </h2>
        <p className="text-xs text-muted-foreground" data-testid="drawer-summary">
          Issued {fmtDate(entry.entry_date)} · Tracked income {fmtMoney(amount)}
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Receipt</p>
          <div className="rounded-lg border p-3 space-y-1 text-sm" data-testid="drawer-receipt">
            {doc?.title && <p className="font-semibold">{doc.title}</p>}
            {!hasReceiptRef && (
              <p className="text-xs text-muted-foreground" data-testid="drawer-missing-ref">
                Original document not available — showing snapshot from money entry.
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {doc?.quoteNumber && (<><span>Quote #</span><span className="text-foreground">{doc.quoteNumber}</span></>)}
              {doc?.invoiceNumber && (<><span>Invoice #</span><span className="text-foreground">{doc.invoiceNumber}</span></>)}
              {entry.receipt_number && (<><span>Receipt #</span><span className="text-foreground">{entry.receipt_number}</span></>)}
              {doc?.issueDate && (<><span>Issue date</span><span className="text-foreground">{fmtDate(doc.issueDate)}</span></>)}
              {doc?.dueDate && (<><span>Due date</span><span className="text-foreground">{fmtDate(doc.dueDate)}</span></>)}
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Who bought</p>
          <div className="rounded-lg border p-3 text-sm space-y-0.5" data-testid="drawer-who">
            <p className="font-semibold">{entry.client_name || doc?.clientInfo?.name || 'Unknown'}</p>
            {doc?.clientInfo?.email && <p className="text-xs text-muted-foreground">{doc.clientInfo.email}</p>}
            {doc?.clientInfo?.phone && <p className="text-xs text-muted-foreground">{doc.clientInfo.phone}</p>}
            {doc?.clientInfo?.address && <p className="text-xs text-muted-foreground whitespace-pre-line">{doc.clientInfo.address}</p>}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What they bought</p>
          <div className="rounded-lg border overflow-hidden" data-testid="drawer-items">
            {items.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground" data-testid="drawer-no-items">No line items recorded.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-2 px-2">Item</th>
                    <th className="text-right font-medium py-2 px-2">Qty</th>
                    <th className="text-right font-medium py-2 px-2">Unit</th>
                    <th className="text-right font-medium py-2 px-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="py-1.5 px-2">{it.description}</td>
                      <td className="py-1.5 px-2 text-right">{it.quantity}</td>
                      <td className="py-1.5 px-2 text-right">{fmtMoney(it.unitPrice)}</td>
                      <td className="py-1.5 px-2 text-right font-medium">{fmtMoney(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="text-xs space-y-0.5 px-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span data-testid="drawer-subtotal">{fmtMoney(subtotal)}</span></div>
            {taxRate > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span data-testid="drawer-tax">{fmtMoney(tax)}</span></div>
            )}
            <div className="flex justify-between font-semibold pt-1 border-t"><span>Total</span><span data-testid="drawer-total">{fmtMoney(amount)}</span></div>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Money allocated</p>
          <div className="grid grid-cols-2 gap-2" data-testid="drawer-buckets">
            {(Object.keys(BUCKET_META) as Bucket[]).map((b) => {
              const Icon = BUCKET_META[b].icon;
              const amt = perBucket[b];
              const pct = amount > 0 ? (amt / amount) * 100 : 0;
              return (
                <div key={b} className={`p-3 rounded-lg ${BUCKET_META[b].bg}`} data-testid={`drawer-bucket-${b}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`h-3.5 w-3.5 ${BUCKET_META[b].color}`} />
                    <p className="text-[11px] font-medium">{BUCKET_META[b].label}</p>
                  </div>
                  <p className={`text-sm font-heading font-bold ${BUCKET_META[b].color}`} data-testid={`drawer-bucket-${b}-amount`}>{fmtMoney(amt)}</p>
                  <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</p>
                </div>
              );
            })}
          </div>
          <ul className="space-y-1 pt-1">
            {allocations.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-xs border-b last:border-0 py-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`inline-block w-2 h-2 rounded-full ${BUCKET_META[a.bucket].bg}`} />
                  <span className="capitalize">{a.bucket}</span>
                  {!a.is_auto && <Badge variant="outline" className="text-[9px] px-1">manual</Badge>}
                  <span className="text-muted-foreground truncate">— {a.note ?? ''}</span>
                </span>
                <span className="font-medium whitespace-nowrap">{fmtMoney(a.amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        {entry.document_id && onOpenPreview && (
          <button
            className="w-full h-9 rounded-md border text-sm"
            onClick={() => onOpenPreview(entry.document_id as string)}
          >
            Open full receipt preview
          </button>
        )}
      </div>
    </div>
  );
}
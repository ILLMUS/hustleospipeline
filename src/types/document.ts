export type DocumentType = 'quote' | 'invoice' | 'receipt';

export interface BusinessInfo {
  logo: string | null;
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface ClientInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteDocument {
  id: string;
  type: DocumentType;
  quoteNumber: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  title: string;
  businessInfo: BusinessInfo;
  clientInfo: ClientInfo;
  items: LineItem[];
  taxRate: number;
  termsAndConditions: string;
  createdAt: string;
  issueDate?: string;
  dueDate?: string;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function calculateSubtotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function calculateTax(subtotal: number, taxRate: number): number {
  return subtotal * (taxRate / 100);
}

export function calculateGrandTotal(items: LineItem[], taxRate: number): number {
  const subtotal = calculateSubtotal(items);
  return subtotal + calculateTax(subtotal, taxRate);
}

let quoteCounter = 0;
let invoiceCounter = 0;
let receiptCounter = 0;

export function initCounters(docs: QuoteDocument[]) {
  docs.forEach(d => {
    const qNum = parseInt(d.quoteNumber.replace('Q-', ''));
    if (qNum > quoteCounter) quoteCounter = qNum;
    if (d.invoiceNumber) {
      const iNum = parseInt(d.invoiceNumber.replace('INV-', ''));
      if (iNum > invoiceCounter) invoiceCounter = iNum;
    }
    if (d.receiptNumber) {
      const rNum = parseInt(d.receiptNumber.replace('REC-', ''));
      if (rNum > receiptCounter) receiptCounter = rNum;
    }
  });
}

export function nextQuoteNumber(): string {
  quoteCounter++;
  return `Q-${String(quoteCounter).padStart(4, '0')}`;
}

export function nextInvoiceNumber(): string {
  invoiceCounter++;
  return `INV-${String(invoiceCounter).padStart(4, '0')}`;
}

export function nextReceiptNumber(): string {
  receiptCounter++;
  return `REC-${String(receiptCounter).padStart(4, '0')}`;
}

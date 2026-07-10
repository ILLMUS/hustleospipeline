import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { QuoteDocument, initCounters, calculateGrandTotal } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

interface DocumentContextType {
  documents: QuoteDocument[];
  loading: boolean;
  addDocument: (doc: QuoteDocument) => void;
  updateDocument: (doc: QuoteDocument) => void;
  deleteDocument: (id: string) => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

function toDbRow(doc: QuoteDocument, userId: string) {
  return {
    id: doc.id,
    user_id: userId,
    type: doc.type,
    quote_number: doc.quoteNumber,
    invoice_number: doc.invoiceNumber ?? null,
    receipt_number: doc.receiptNumber ?? null,
    title: doc.title,
    business_info: doc.businessInfo as any,
    client_info: doc.clientInfo as any,
    items: doc.items as any,
    tax_rate: doc.taxRate,
    terms_and_conditions: doc.termsAndConditions,
    issue_date: doc.issueDate ?? null,
    due_date: doc.dueDate ?? null,
    created_at: doc.createdAt,
  };
}

function fromDbRow(row: any): QuoteDocument {
  return {
    id: row.id,
    type: row.type,
    quoteNumber: row.quote_number,
    invoiceNumber: row.invoice_number ?? undefined,
    receiptNumber: row.receipt_number ?? undefined,
    title: row.title,
    businessInfo: row.business_info,
    clientInfo: row.client_info,
    items: row.items,
    taxRate: Number(row.tax_rate),
    termsAndConditions: row.terms_and_conditions,
    issueDate: row.issue_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    createdAt: row.created_at,
  };
}

async function syncReceiptToMoneyTracker(doc: QuoteDocument, userId: string) {
  if (doc.type !== 'receipt') return;
  const amount = calculateGrandTotal(doc.items, doc.taxRate);
  const { data: existing } = await supabase
    .from('money_entries')
    .select('id')
    .eq('document_id', doc.id)
    .maybeSingle();

  if (existing) {
    await supabase.from('money_entries').update({
      client_name: doc.clientInfo.name,
      items: doc.items as any,
      amount,
      receipt_number: doc.receiptNumber ?? null,
    }).eq('id', existing.id);
    return;
  }

  // Load or create allocation settings
  let { data: settings } = await supabase
    .from('allocation_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!settings) {
    const { data: created } = await supabase
      .from('allocation_settings')
      .insert({ user_id: userId })
      .select()
      .single();
    settings = created;
  }

  const { data: entry, error: entryErr } = await supabase.from('money_entries').insert({
    user_id: userId,
    document_id: doc.id,
    receipt_number: doc.receiptNumber ?? null,
    client_name: doc.clientInfo.name,
    items: doc.items as any,
    amount,
    entry_date: (doc.issueDate ?? doc.createdAt).slice(0, 10),
  }).select().single();
  if (entryErr || !entry || !settings) return;

  const buckets: Array<{ bucket: string; pct: number }> = [
    { bucket: 'expenses', pct: Number(settings.expenses_pct) },
    { bucket: 'reserve',  pct: Number(settings.reserve_pct) },
    { bucket: 'taxes',    pct: Number(settings.taxes_pct) },
    { bucket: 'debts',    pct: Number(settings.debts_pct) },
  ];
  await supabase.from('allocations').insert(
    buckets.map(b => ({
      user_id: userId,
      money_entry_id: entry.id,
      bucket: b.bucket,
      amount: Math.round(amount * b.pct) / 100, // = amount*pct/100 rounded to 2dp
      is_auto: true,
      note: `Auto-split ${b.pct}%`,
    }))
  );
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<QuoteDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching documents:', error);
      } else {
        const docs = (data || []).map(fromDbRow);
        initCounters(docs);
        setDocuments(docs);
      }
      setLoading(false);
    };
    fetchDocs();
  }, [user]);

  const addDocument = async (doc: QuoteDocument) => {
    if (!user) return;
    setDocuments(prev => [doc, ...prev]);
    const { error } = await supabase.from('documents').insert(toDbRow(doc, user.id));
    if (error) console.error('Error adding document:', error);
    await syncReceiptToMoneyTracker(doc, user.id);
  };

  const updateDocument = async (doc: QuoteDocument) => {
    if (!user) return;
    setDocuments(prev => prev.map(d => d.id === doc.id ? doc : d));
    const { error } = await supabase.from('documents').update(toDbRow(doc, user.id)).eq('id', doc.id);
    if (error) console.error('Error updating document:', error);
    await syncReceiptToMoneyTracker(doc, user.id);
  };

  const deleteDocument = async (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) console.error('Error deleting document:', error);
  };

  return (
    <DocumentContext.Provider value={{ documents, loading, addDocument, updateDocument, deleteDocument }}>
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocuments() {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error('useDocuments must be used within DocumentProvider');
  return ctx;
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useDocuments } from '@/context/DocumentContext';
import { calculateGrandTotal } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ArrowLeft, Wallet, PiggyBank, Receipt, Landmark, TrendingDown, ChevronDown, ChevronUp, RefreshCw, Plus, ShoppingBag, BookOpen } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { computeDrawerData, ReceiptDrawerContent } from './moneyTracker/receiptDrawer';

type Bucket = 'expenses' | 'reserve' | 'taxes' | 'debts';

interface Settings {
  id?: string;
  expenses_pct: number;
  reserve_pct: number;
  taxes_pct: number;
  debts_pct: number;
}

interface MoneyEntry {
  id: string;
  document_id: string | null;
  receipt_number: string | null;
  client_name: string | null;
  items: any[];
  amount: number;
  entry_date: string;
  created_at: string;
}

interface Allocation {
  id: string;
  money_entry_id: string;
  bucket: Bucket;
  amount: number;
  note: string | null;
  is_auto: boolean;
  created_at: string;
}

const BUCKET_META: Record<Bucket, { label: string; icon: any; color: string; bg: string }> = {
  expenses: { label: 'Expenses', icon: Wallet,     color: 'text-warning',     bg: 'bg-warning/10' },
  reserve:  { label: 'Reserve',  icon: PiggyBank,  color: 'text-success',     bg: 'bg-success/10' },
  taxes:    { label: 'Taxes',    icon: Landmark,   color: 'text-primary',     bg: 'bg-primary/10' },
  debts:    { label: 'Debts',    icon: TrendingDown,color: 'text-destructive', bg: 'bg-destructive/10' },
};

function fmt(amount: number) {
  return `E${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MoneyTracker() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { documents } = useDocuments();
  const [settings, setSettings] = useState<Settings>({ expenses_pct: 40, reserve_pct: 20, taxes_pct: 25, debts_pct: 15 });
  const [entries, setEntries] = useState<MoneyEntry[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openLedger, setOpenLedger] = useState<Bucket | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [drawerEntryId, setDrawerEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: s }, { data: e }, { data: a }] = await Promise.all([
        supabase.from('allocation_settings').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('money_entries').select('*').eq('user_id', user.id).order('entry_date', { ascending: false }),
        supabase.from('allocations').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      ]);
      if (s) setSettings({
        id: s.id,
        expenses_pct: Number(s.expenses_pct),
        reserve_pct: Number(s.reserve_pct),
        taxes_pct: Number(s.taxes_pct),
        debts_pct: Number(s.debts_pct),
      });
      setEntries((e ?? []) as any);
      setAllocations((a ?? []) as any);
      setLoading(false);
    })();
  }, [user]);

  const bucketTotals = useMemo(() => {
    const totals: Record<Bucket, number> = { expenses: 0, reserve: 0, taxes: 0, debts: 0 };
    allocations.forEach(a => { totals[a.bucket] = (totals[a.bucket] || 0) + Number(a.amount); });
    return totals;
  }, [allocations]);

  const totalIncome = useMemo(() => entries.reduce((s, e) => s + Number(e.amount), 0), [entries]);

  // Group entries by client for the "Who bought what" purchases list
  const purchasesByClient = useMemo(() => {
    const map = new Map<string, { client: string; total: number; entries: MoneyEntry[] }>();
    entries.forEach(e => {
      const key = (e.client_name || 'Unknown').trim() || 'Unknown';
      const g = map.get(key) ?? { client: key, total: 0, entries: [] };
      g.total += Number(e.amount);
      g.entries.push(e);
      map.set(key, g);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries]);

  const entryById = useMemo(() => {
    const m = new Map<string, MoneyEntry>();
    entries.forEach(e => m.set(e.id, e));
    return m;
  }, [entries]);

  const ledgerRows = useMemo(() => {
    if (!openLedger) return [];
    return allocations
      .filter(a => a.bucket === openLedger)
      .map(a => ({ alloc: a, entry: entryById.get(a.money_entry_id) }))
      .sort((a, b) => (b.alloc.created_at || '').localeCompare(a.alloc.created_at || ''));
  }, [openLedger, allocations, entryById]);

  const pctSum = settings.expenses_pct + settings.reserve_pct + settings.taxes_pct + settings.debts_pct;

  const saveSettings = async () => {
    if (!user) return;
    if (pctSum !== 100) { toast.error('Percentages must sum to 100'); return; }
    const payload = {
      user_id: user.id,
      expenses_pct: settings.expenses_pct,
      reserve_pct: settings.reserve_pct,
      taxes_pct: settings.taxes_pct,
      debts_pct: settings.debts_pct,
    };
    const { error } = settings.id
      ? await supabase.from('allocation_settings').update(payload).eq('id', settings.id)
      : await supabase.from('allocation_settings').insert(payload);
    if (error) toast.error('Failed to save split');
    else toast.success('Split saved. Applied to future receipts.');
  };

  const backfillReceipts = async () => {
    if (!user) return;
    const existingDocIds = new Set(entries.map(e => e.document_id));
    const receipts = documents.filter(d => d.type === 'receipt' && !existingDocIds.has(d.id));
    if (receipts.length === 0) { toast.info('All receipts already tracked'); return; }

    let s = settings;
    if (!s.id) {
      const { data: created } = await supabase.from('allocation_settings').insert({
        user_id: user.id,
        expenses_pct: s.expenses_pct, reserve_pct: s.reserve_pct, taxes_pct: s.taxes_pct, debts_pct: s.debts_pct,
      }).select().single();
      if (created) { s = { ...s, id: created.id }; setSettings(s); }
    }

    for (const doc of receipts) {
      const amount = calculateGrandTotal(doc.items, doc.taxRate);
      const { data: entry } = await supabase.from('money_entries').insert({
        user_id: user.id,
        document_id: doc.id,
        receipt_number: doc.receiptNumber ?? null,
        client_name: doc.clientInfo.name,
        items: doc.items as any,
        amount,
        entry_date: (doc.issueDate ?? doc.createdAt).slice(0, 10),
      }).select().single();
      if (!entry) continue;
      const rows = [
        { bucket: 'expenses', pct: s.expenses_pct },
        { bucket: 'reserve',  pct: s.reserve_pct },
        { bucket: 'taxes',    pct: s.taxes_pct },
        { bucket: 'debts',    pct: s.debts_pct },
      ].map(b => ({
        user_id: user.id,
        money_entry_id: entry.id,
        bucket: b.bucket,
        amount: Math.round(amount * b.pct) / 100,
        is_auto: true,
        note: `Auto-split ${b.pct}%`,
      }));
      await supabase.from('allocations').insert(rows);
    }
    toast.success(`Imported ${receipts.length} receipt${receipts.length > 1 ? 's' : ''}`);
    // reload
    const [{ data: e }, { data: a }] = await Promise.all([
      supabase.from('money_entries').select('*').eq('user_id', user.id).order('entry_date', { ascending: false }),
      supabase.from('allocations').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ]);
    setEntries((e ?? []) as any);
    setAllocations((a ?? []) as any);
  };

  const [manualBucket, setManualBucket] = useState<Bucket>('expenses');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNote, setManualNote] = useState('');

  const addManualAllocation = async (entryId: string) => {
    if (!user) return;
    const amt = parseFloat(manualAmount);
    if (!amt || isNaN(amt)) { toast.error('Enter a valid amount'); return; }
    const { data, error } = await supabase.from('allocations').insert({
      user_id: user.id,
      money_entry_id: entryId,
      bucket: manualBucket,
      amount: amt,
      note: manualNote || 'Manual adjustment',
      is_auto: false,
    }).select().single();
    if (error || !data) { toast.error('Failed to add allocation'); return; }
    setAllocations(prev => [...prev, data as any]);
    setManualAmount(''); setManualNote('');
    toast.success('Allocation added');
  };

  const drawerEntry = drawerEntryId ? entries.find(e => e.id === drawerEntryId) ?? null : null;
  const drawerDoc = drawerEntry?.document_id ? documents.find(d => d.id === drawerEntry.document_id) ?? null : null;
  const drawerData = computeDrawerData(drawerEntry as any, drawerDoc as any, allocations as any);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between py-3 sm:py-5 px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">Money Tracker</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Receipts auto-split into your buckets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={backfillReceipts} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Import receipts</span></Button>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(v => !v)}>Split settings</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-6">
        {/* Total income banner */}
        <Card className="p-4 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">Total income tracked (from receipts)</p>
            <p className="text-2xl sm:text-3xl font-heading font-bold">{fmt(totalIncome)}</p>
          </div>
          <Badge variant="outline" className="text-xs">{entries.length} entries</Badge>
        </Card>

        {/* Bucket cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {(Object.keys(BUCKET_META) as Bucket[]).map(b => {
            const meta = BUCKET_META[b];
            const Icon = meta.icon;
            const isOpen = openLedger === b;
            return (
              <Card
                key={b}
                onClick={() => setOpenLedger(isOpen ? null : b)}
                className={`p-4 cursor-pointer transition-colors hover:bg-accent/40 ${isOpen ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`h-9 w-9 rounded-full ${meta.bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{meta.label}</p>
                </div>
                <p className="text-lg sm:text-2xl font-heading font-bold">{fmt(bucketTotals[b])}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {allocations.filter(a => a.bucket === b).length} entries · tap to open ledger
                </p>
              </Card>
            );
          })}
        </div>

        {/* Ledger drill-down */}
        {openLedger && (
          <Card className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-heading font-semibold text-base">
                  {BUCKET_META[openLedger].label} ledger
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  Total {fmt(bucketTotals[openLedger])}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpenLedger(null)}>Close</Button>
            </div>
            {ledgerRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No allocations in this bucket yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="text-muted-foreground text-left">
                    <tr className="border-b">
                      <th className="py-1.5 pr-2 font-medium">Date</th>
                      <th className="py-1.5 pr-2 font-medium">Receipt</th>
                      <th className="py-1.5 pr-2 font-medium">Client</th>
                      <th className="py-1.5 pr-2 font-medium">Note</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map(({ alloc, entry }) => (
                      <tr key={alloc.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 whitespace-nowrap">
                          {format(new Date(entry?.entry_date ?? alloc.created_at), 'dd MMM yyyy')}
                        </td>
                        <td className="py-1.5 pr-2">
                          {entry?.document_id ? (
                            <button
                              className="text-primary hover:underline"
                              onClick={() => setDrawerEntryId(entry.id)}
                            >
                              {entry?.receipt_number || 'View'}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 truncate max-w-[180px]">{entry?.client_name || '—'}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground truncate max-w-[200px]">
                          {alloc.note}{!alloc.is_auto && ' (manual)'}
                        </td>
                        <td className={`py-1.5 pr-2 text-right font-medium ${BUCKET_META[openLedger].color}`}>
                          {fmt(alloc.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Who bought what - grouped by client */}
        {entries.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-heading font-semibold text-base sm:text-lg">Purchases by client</h3>
              <Badge variant="outline" className="text-[10px]">{purchasesByClient.length}</Badge>
            </div>
            {purchasesByClient.map(group => {
              const isOpen = expandedClient === group.client;
              return (
                <Card key={group.client} className="p-3 sm:p-4">
                  <button
                    className="w-full flex items-center gap-3 text-left"
                    onClick={() => setExpandedClient(isOpen ? null : group.client)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-semibold text-sm sm:text-base truncate">{group.client}</p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground">
                        {group.entries.length} receipt{group.entries.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <p className="font-heading font-bold text-sm sm:text-base">{fmt(group.total)}</p>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {group.entries.map(e => (
                        <div key={e.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              {e.receipt_number && (
                                <button
                                  className="text-xs text-primary hover:underline"
                                  onClick={() => setDrawerEntryId(e.id)}
                                >
                                  {e.receipt_number}
                                </button>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                {format(new Date(e.entry_date), 'dd MMM yyyy')}
                              </span>
                            </div>
                            <span className="text-xs font-medium">{fmt(e.amount)}</span>
                          </div>
                          {Array.isArray(e.items) && e.items.length > 0 ? (
                            <ul className="text-[11px] sm:text-xs text-muted-foreground pl-3 list-disc space-y-0.5">
                              {e.items.map((it: any, idx: number) => (
                                <li key={idx} className="flex justify-between gap-2">
                                  <span className="truncate">
                                    {it.description || 'Item'}
                                    {it.quantity ? ` × ${it.quantity}` : ''}
                                  </span>
                                  {typeof it.unitPrice === 'number' && (
                                    <span className="whitespace-nowrap">{fmt(it.quantity ? it.quantity * it.unitPrice : it.unitPrice)}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-muted-foreground pl-3">No line items</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <Card className="p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="font-heading font-semibold text-base">Auto-split percentages</h3>
              <p className="text-xs text-muted-foreground">Applied to every new receipt. Must total 100%.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.keys(BUCKET_META) as Bucket[]).map(b => (
                <div key={b}>
                  <Label className="text-xs">{BUCKET_META[b].label} %</Label>
                  <Input type="number" min={0} max={100}
                    value={(settings as any)[`${b}_pct`]}
                    onChange={e => setSettings(s => ({ ...s, [`${b}_pct`]: Number(e.target.value) } as Settings))}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <p className={`text-xs ${pctSum === 100 ? 'text-success' : 'text-destructive'}`}>Sum: {pctSum}%</p>
              <Button size="sm" onClick={saveSettings} disabled={pctSum !== 100}>Save split</Button>
            </div>
          </Card>
        )}

        {/* Entries */}
        <div className="space-y-2">
          <h3 className="font-heading font-semibold text-base sm:text-lg">Income entries</h3>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : entries.length === 0 ? (
            <Card className="p-8 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No income tracked yet. Convert a document to a receipt, or import existing receipts.</p>
              <Button variant="outline" size="sm" onClick={backfillReceipts} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Import receipts</Button>
            </Card>
          ) : (
            entries.map(entry => {
              const isOpen = expandedId === entry.id;
              const entryAllocs = allocations.filter(a => a.money_entry_id === entry.id);
              const perBucket: Record<Bucket, number> = { expenses: 0, reserve: 0, taxes: 0, debts: 0 };
              entryAllocs.forEach(a => { perBucket[a.bucket] += Number(a.amount); });
              const itemsSummary = (entry.items || []).map((i: any) => i.description).filter(Boolean).slice(0, 2).join(', ');
              const moreCount = Math.max(0, (entry.items?.length ?? 0) - 2);
              return (
                <Card key={entry.id} className="p-3 sm:p-4">
                  <button
                    className="w-full flex items-center gap-3 text-left"
                    onClick={() => setExpandedId(isOpen ? null : entry.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-semibold text-sm sm:text-base truncate">{entry.client_name || 'Unknown'}</span>
                        {entry.receipt_number && <Badge variant="outline" className="text-[10px]">{entry.receipt_number}</Badge>}
                      </div>
                      <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                        {itemsSummary || '—'}{moreCount > 0 ? ` +${moreCount} more` : ''} · {format(new Date(entry.entry_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-heading font-bold text-sm sm:text-base">{fmt(entry.amount)}</p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <div className="mt-2 flex justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setDrawerEntryId(entry.id)}>
                      <Receipt className="h-3.5 w-3.5" /> Receipt details
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(Object.keys(BUCKET_META) as Bucket[]).map(b => (
                          <div key={b} className={`p-2 rounded ${BUCKET_META[b].bg}`}>
                            <p className="text-[10px] text-muted-foreground">{BUCKET_META[b].label}</p>
                            <p className={`text-sm font-semibold ${BUCKET_META[b].color}`}>{fmt(perBucket[b])}</p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Allocation history</p>
                        <ul className="space-y-1">
                          {entryAllocs.map(a => (
                            <li key={a.id} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5">
                                <span className={`inline-block w-2 h-2 rounded-full ${BUCKET_META[a.bucket].bg}`} />
                                <span className="capitalize">{a.bucket}</span>
                                {!a.is_auto && <Badge variant="outline" className="text-[9px] px-1">manual</Badge>}
                                <span className="text-muted-foreground truncate max-w-[220px]">— {a.note}</span>
                              </span>
                              <span className="font-medium">{fmt(a.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
                        <div>
                          <Label className="text-[10px]">Bucket</Label>
                          <select
                            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                            value={manualBucket}
                            onChange={e => setManualBucket(e.target.value as Bucket)}
                          >
                            {(Object.keys(BUCKET_META) as Bucket[]).map(b => (
                              <option key={b} value={b}>{BUCKET_META[b].label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-[10px]">Amount (+/-)</Label>
                          <Input type="number" step="0.01" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="e.g. -50 or 100" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Note</Label>
                          <Input value={manualNote} onChange={e => setManualNote(e.target.value)} placeholder="Reason" />
                        </div>
                        <Button size="sm" onClick={() => addManualAllocation(entry.id)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add</Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </main>

      <Sheet open={!!drawerEntryId} onOpenChange={(o) => !o && setDrawerEntryId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>Receipt details</SheetTitle>
            <SheetDescription>Original receipt, purchases and allocation breakdown</SheetDescription>
          </SheetHeader>
          <ReceiptDrawerContent
            data={drawerData}
            onOpenPreview={(id) => navigate(`/preview/${id}`)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
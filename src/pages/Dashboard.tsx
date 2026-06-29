import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocuments } from '@/context/DocumentContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { QuoteDocument, calculateSubtotal, calculateTax, calculateGrandTotal, nextInvoiceNumber, nextReceiptNumber } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Plus, FileText, Download, MessageCircle, Pencil, Trash2, Receipt, ArrowRight, LogOut, Settings, Users, UserCheck, Clock, TrendingUp, Kanban, PlusCircle, History, FileImage } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PipelineChart from '@/components/PipelineChart';
import RevenueChart from '@/components/RevenueChart';
import { getDownloadHistory, DownloadEntry } from '@/lib/downloadHistory';

function formatCurrency(amount: number) {
  return `E${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { documents, loading, updateDocument, deleteDocument } = useDocuments();
  const { user, signOut } = useAuth();
  const [clientCount, setClientCount] = useState(0);
  const [pendingFollowUps, setPendingFollowUps] = useState(0);
  const [historyMap, setHistoryMap] = useState<Record<string, DownloadEntry[]>>({});

  useEffect(() => {
    const refresh = () => {
      const next: Record<string, DownloadEntry[]> = {};
      documents.forEach(d => { next[d.id] = getDownloadHistory(d.id); });
      setHistoryMap(next);
    };
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('download-history-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('download-history-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [documents]);

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const today = new Date().toISOString().split('T')[0];
      const [{ count: cCount }, { count: fCount }, { data: dueNotes }] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('client_notes').select('*', { count: 'exact', head: true })
          .eq('is_completed', false).not('follow_up_date', 'is', null)
          .lte('follow_up_date', today),
        supabase.from('client_notes').select('content, follow_up_date, clients!client_notes_client_id_fkey(name)')
          .eq('is_completed', false).not('follow_up_date', 'is', null)
          .lte('follow_up_date', today)
          .order('follow_up_date', { ascending: true })
          .limit(5),
      ]);
      setClientCount(cCount ?? 0);
      setPendingFollowUps(fCount ?? 0);

      // Show toast reminders for due follow-ups
      if (dueNotes && dueNotes.length > 0) {
        dueNotes.forEach((note: any) => {
          const clientName = note.clients?.name || 'A client';
          const isOverdue = note.follow_up_date < today;
          toast.warning(
            `${isOverdue ? '⏰ Overdue' : '📋 Due today'}: ${clientName}`,
            { description: note.content.substring(0, 80), duration: 8000 }
          );
        });
      }
    };
    fetchStats();
  }, [user]);

  const totalRevenue = useMemo(() => {
    return documents
      .filter(d => d.type === 'invoice' || d.type === 'receipt')
      .reduce((sum, d) => sum + calculateGrandTotal(d.items, d.taxRate), 0);
  }, [documents]);

  const handleConvertToInvoice = (doc: QuoteDocument) => {
    if (doc.type === 'invoice' || doc.type === 'receipt') {
      toast.info('Document is already an invoice or receipt');
      return;
    }
    const updated: QuoteDocument = {
      ...doc,
      type: 'invoice',
      invoiceNumber: nextInvoiceNumber(),
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    };
    updateDocument(updated);
    toast.success('Converted to Invoice');
  };

  const handleConvertToReceipt = (doc: QuoteDocument) => {
    if (doc.type !== 'invoice') return;
    const updated: QuoteDocument = {
      ...doc,
      type: 'receipt',
      receiptNumber: nextReceiptNumber(),
    };
    updateDocument(updated);
    toast.success('Converted to Receipt');
  };

  const handleDelete = (id: string) => {
    deleteDocument(id);
    toast.success('Document deleted');
  };

  const handleWhatsApp = (doc: QuoteDocument) => {
    const total = calculateGrandTotal(doc.items, doc.taxRate);
    const phone = doc.clientInfo.phone.replace(/[^0-9]/g, '');
    const docNum = doc.type === 'receipt' ? doc.receiptNumber : doc.type === 'invoice' ? doc.invoiceNumber : doc.quoteNumber;
    const message = `Hello ${doc.clientInfo.name},\n\nYour ${doc.type} (${doc.title}) has been prepared.\n\n${doc.type.charAt(0).toUpperCase() + doc.type.slice(1)} Number: ${docNum}\nTotal Amount: ${formatCurrency(total)}\n\nThank you.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleGeneratePDF = (doc: QuoteDocument) => {
    navigate(`/preview/${doc.id}`);
  };

  const handleAddToPipeline = async (doc: QuoteDocument) => {
    if (!user) return;
    const total = calculateGrandTotal(doc.items, doc.taxRate);
    const { error } = await supabase.from('deals').insert({
      user_id: user.id,
      document_id: doc.id,
      title: `${doc.clientInfo.name} – ${doc.title}`,
      value: total,
      stage: 'proposal',
      stage_order: 0,
      notes: `Auto-added from ${doc.type} ${doc.quoteNumber}`,
    });
    if (error) {
      toast.error('Failed to add to pipeline');
    } else {
      toast.success('Added to Sales Pipeline');
    }
  };

  const handleAddToClients = async (doc: QuoteDocument) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', doc.clientInfo.name)
      .maybeSingle();
    if (existing) {
      toast.info('Client already exists');
      return;
    }
    const { error } = await supabase.from('clients').insert({
      user_id: user.id,
      name: doc.clientInfo.name,
      email: doc.clientInfo.email || '',
      phone: doc.clientInfo.phone || '',
      address: doc.clientInfo.address || '',
      company: '',
    });
    if (error) {
      toast.error('Failed to add client');
    } else {
      setClientCount(c => c + 1);
      toast.success('Client added');
    }
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      quote: 'bg-accent/20 text-accent-foreground border-accent/30',
      invoice: 'bg-primary/10 text-foreground border-primary/20',
      receipt: 'bg-success/20 text-success border-success/30',
    };
    return colors[type] || '';
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between py-3 sm:py-5 px-3 sm:px-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">HustleOS</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Professional Document Builder</p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button onClick={() => navigate('/create')} size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm sm:size-default">
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Create New Quote</span>
              <span className="sm:hidden">New</span>
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate('/pipeline')} title="Sales Pipeline">
              <Kanban className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate('/clients')} title="Clients">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate('/settings')} title="Profile Settings">
              <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => signOut()} title="Logout">
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <Card className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/clients')}>
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-heading font-bold leading-tight">{clientCount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Clients</p>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/clients')}>
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-heading font-bold leading-tight">{pendingFollowUps}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Pending Follow-ups</p>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-heading font-bold leading-tight truncate">{formatCurrency(totalRevenue)}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Revenue</p>
            </div>
          </Card>
        </div>

        <PipelineChart />
        <RevenueChart />

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center animate-fade-in px-4">
            <FileText className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground/40 mb-3 sm:mb-4" />
            <h2 className="text-lg sm:text-xl font-heading font-semibold mb-2">No documents yet</h2>
            <p className="text-sm text-muted-foreground mb-5 sm:mb-6">Create your first quote to get started</p>
            <Button onClick={() => navigate('/create')} className="gap-2">
              <Plus className="h-4 w-4" />
              Create New Quote
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => {
              const total = calculateGrandTotal(doc.items, doc.taxRate);
              return (
                <Card key={doc.id} className="p-4 sm:p-5 flex flex-col gap-3 sm:gap-4 animate-fade-in hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 sm:space-y-1 min-w-0">
                      <h3 className="font-heading font-semibold text-base sm:text-lg leading-tight truncate">{doc.clientInfo.name}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{doc.title}</p>
                    </div>
                    <Badge variant="outline" className={`${typeBadge(doc.type)} flex-shrink-0 text-[10px] sm:text-xs`}>
                      {doc.type.charAt(0).toUpperCase() + doc.type.slice(1)}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs sm:text-sm text-muted-foreground">{doc.quoteNumber}</span>
                    <span className="font-heading font-bold text-base sm:text-lg">{formatCurrency(total)}</span>
                  </div>

                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {format(new Date(doc.createdAt), 'dd MMM yyyy, HH:mm')}
                  </p>

                  <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-2 border-t">
                    {doc.type === 'quote' && (
                      <Button size="sm" variant="outline" onClick={() => handleConvertToInvoice(doc)} className="gap-1 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                        <ArrowRight className="h-3 w-3" /> Invoice
                      </Button>
                    )}
                    {doc.type === 'invoice' && (
                      <Button size="sm" variant="outline" onClick={() => handleConvertToReceipt(doc)} className="gap-1 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                        <Receipt className="h-3 w-3" /> Receipt
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleGeneratePDF(doc)} className="gap-1 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                      <Download className="h-3 w-3" /> PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleWhatsApp(doc)} className="gap-1 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                          <PlusCircle className="h-3 w-3" /> Add
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel className="text-xs">Add to</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleAddToPipeline(doc)} className="gap-2 text-xs">
                          <Kanban className="h-3.5 w-3.5" /> Sales Pipeline
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAddToClients(doc)} className="gap-2 text-xs">
                          <Users className="h-3.5 w-3.5" /> Client
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="flex gap-1 ml-auto">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/edit/${doc.id}`)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(doc.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {historyMap[doc.id] && historyMap[doc.id].length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-muted-foreground mb-1.5">
                        <History className="h-3 w-3" /> Download history
                      </p>
                      <ul className="space-y-1">
                        {historyMap[doc.id].slice(0, 3).map((entry, idx) => (
                          <li key={idx}>
                            <button
                              type="button"
                              onClick={() => navigate(`/preview/${doc.id}?download=${entry.type}`)}
                              title={`Re-download ${entry.filename}`}
                              className="w-full flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded px-1 py-0.5 transition-colors text-left"
                            >
                              {entry.type === 'pdf'
                                ? <FileText className="h-3 w-3 flex-shrink-0 text-primary" />
                                : <FileImage className="h-3 w-3 flex-shrink-0 text-accent" />}
                              <span className="truncate flex-1 underline-offset-2 hover:underline">{entry.filename}</span>
                              <span className="flex-shrink-0 text-[9px] sm:text-[10px]">
                                {format(new Date(entry.timestamp), 'dd MMM HH:mm')}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

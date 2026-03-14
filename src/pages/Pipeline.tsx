import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, GripVertical, Trash2, FileText, User } from 'lucide-react';
import { toast } from 'sonner';

interface Deal {
  id: string;
  user_id: string;
  client_id: string | null;
  document_id: string | null;
  title: string;
  value: number;
  stage: string;
  stage_order: number;
  notes: string;
  expected_close_date: string | null;
  created_at: string;
  client_name?: string;
  document_title?: string;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface DocumentOption {
  id: string;
  title: string;
  quote_number: string;
  type: string;
}

const STAGES = [
  { key: 'lead', label: 'Lead', color: 'bg-muted' },
  { key: 'proposal', label: 'Proposal', color: 'bg-accent/20' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-warning/20' },
  { key: 'won', label: 'Won', color: 'bg-success/20' },
  { key: 'lost', label: 'Lost', color: 'bg-destructive/20' },
];

function formatCurrency(amount: number) {
  return `E${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Pipeline() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);

  // New deal form state
  const [newTitle, setNewTitle] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newStage, setNewStage] = useState('lead');
  const [newClientId, setNewClientId] = useState('');
  const [newDocumentId, setNewDocumentId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newCloseDate, setNewCloseDate] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [dealsRes, clientsRes, docsRes] = await Promise.all([
      supabase.from('deals').select('*').order('stage_order', { ascending: true }),
      supabase.from('clients').select('id, name, company'),
      supabase.from('documents').select('id, title, quote_number, type'),
    ]);

    const clientMap = new Map((clientsRes.data || []).map(c => [c.id, c.name]));
    const docMap = new Map((docsRes.data || []).map(d => [d.id, d.title || d.quote_number]));

    const enrichedDeals = (dealsRes.data || []).map(d => ({
      ...d,
      client_name: d.client_id ? clientMap.get(d.client_id) : undefined,
      document_title: d.document_id ? docMap.get(d.document_id) : undefined,
    }));

    setDeals(enrichedDeals);
    setClients(clientsRes.data || []);
    setDocuments(docsRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDragStart = (dealId: string) => {
    setDraggedDeal(dealId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    if (!draggedDeal) return;

    const deal = deals.find(d => d.id === draggedDeal);
    if (!deal || deal.stage === targetStage) {
      setDraggedDeal(null);
      return;
    }

    // Optimistic update
    setDeals(prev => prev.map(d => d.id === draggedDeal ? { ...d, stage: targetStage } : d));
    setDraggedDeal(null);

    const { error } = await supabase.from('deals').update({ stage: targetStage }).eq('id', draggedDeal);
    if (error) {
      toast.error('Failed to update deal stage');
      fetchData();
    } else {
      toast.success(`Moved to ${STAGES.find(s => s.key === targetStage)?.label}`);
    }
  };

  const handleCreateDeal = async () => {
    if (!user || !newTitle.trim()) {
      toast.error('Title is required');
      return;
    }

    const stageDeals = deals.filter(d => d.stage === newStage);
    const { error } = await supabase.from('deals').insert({
      user_id: user.id,
      title: newTitle.trim(),
      value: parseFloat(newValue) || 0,
      stage: newStage,
      stage_order: stageDeals.length,
      client_id: newClientId || null,
      document_id: newDocumentId || null,
      notes: newNotes,
      expected_close_date: newCloseDate || null,
    });

    if (error) {
      toast.error('Failed to create deal');
    } else {
      toast.success('Deal created');
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
  };

  const handleDeleteDeal = async (id: string) => {
    setDeals(prev => prev.filter(d => d.id !== id));
    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (error) toast.error('Failed to delete deal');
    else toast.success('Deal deleted');
  };

  const resetForm = () => {
    setNewTitle('');
    setNewValue('');
    setNewStage('lead');
    setNewClientId('');
    setNewDocumentId('');
    setNewNotes('');
    setNewCloseDate('');
  };

  const stageDeals = (stage: string) => deals.filter(d => d.stage === stage);
  const stageTotal = (stage: string) => stageDeals(stage).reduce((s, d) => s + d.value, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between py-3 sm:py-5 px-3 sm:px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">Sales Pipeline</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Drag deals between stages</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Deal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">New Deal</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label>Title *</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Deal title" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Value</Label>
                    <Input type="number" value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Stage</Label>
                    <Select value={newStage} onValueChange={setNewStage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map(s => (
                          <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Client</Label>
                  <Select value={newClientId} onValueChange={setNewClientId}>
                    <SelectTrigger><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Linked Document</Label>
                  <Select value={newDocumentId} onValueChange={setNewDocumentId}>
                    <SelectTrigger><SelectValue placeholder="Link a quote/invoice (optional)" /></SelectTrigger>
                    <SelectContent>
                      {documents.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.quote_number} — {d.title || d.type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Expected Close Date</Label>
                  <Input type="date" value={newCloseDate} onChange={e => setNewCloseDate(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
                </div>
                <Button onClick={handleCreateDeal} className="w-full">Create Deal</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading pipeline...</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4 min-h-[70vh]">
            {STAGES.map(stage => (
              <div
                key={stage.key}
                className="flex-shrink-0 w-[260px] sm:w-[280px] flex flex-col"
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, stage.key)}
              >
                {/* Column header */}
                <div className={`rounded-t-lg px-3 py-2.5 ${stage.color} border border-b-0`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-semibold text-sm">{stage.label}</h3>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {stageDeals(stage.key).length}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatCurrency(stageTotal(stage.key))}
                  </p>
                </div>

                {/* Cards container */}
                <div className="flex-1 border border-t-0 rounded-b-lg bg-muted/30 p-2 space-y-2 min-h-[200px]">
                  {stageDeals(stage.key).map(deal => (
                    <Card
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      className={`p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                        draggedDeal === deal.id ? 'opacity-40 scale-95' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="font-heading font-semibold text-sm leading-tight truncate">{deal.title}</p>
                          <p className="font-heading font-bold text-base text-primary">{formatCurrency(deal.value)}</p>
                          {deal.client_name && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <User className="h-2.5 w-2.5" />
                              <span className="truncate">{deal.client_name}</span>
                            </div>
                          )}
                          {deal.document_title && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <FileText className="h-2.5 w-2.5" />
                              <span className="truncate">{deal.document_title}</span>
                            </div>
                          )}
                          {deal.expected_close_date && (
                            <p className="text-[10px] text-muted-foreground">
                              Close: {new Date(deal.expected_close_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
                          onClick={() => handleDeleteDeal(deal.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </Card>
                  ))}

                  {stageDeals(stage.key).length === 0 && (
                    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground border border-dashed rounded-md">
                      Drop deals here
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDocuments } from '@/context/DocumentContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { QuoteDocument, LineItem, BusinessInfo, ClientInfo, generateId, nextQuoteNumber, calculateSubtotal, calculateTax } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Upload, Save, Users } from 'lucide-react';
import { toast } from 'sonner';

interface SavedClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  company: string;
}

const emptyBusiness: BusinessInfo = { logo: null, name: '', address: '', phone: '', email: '' };
const emptyClient: ClientInfo = { name: '', address: '', phone: '', email: '' };
const emptyItem = (): LineItem => ({ id: generateId(), description: '', quantity: 1, unitPrice: 0 });

function formatCurrency(n: number) {
  return `E${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuoteForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { documents, addDocument, updateDocument } = useDocuments();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existing = id ? documents.find(d => d.id === id) : undefined;

  const [business, setBusiness] = useState<BusinessInfo>(existing?.businessInfo ?? { ...emptyBusiness });
  const [client, setClient] = useState<ClientInfo>(existing?.clientInfo ?? { ...emptyClient });
  const [title, setTitle] = useState(existing?.title ?? '');
  const [items, setItems] = useState<LineItem[]>(existing?.items ?? [emptyItem()]);
  const [taxRate, setTaxRate] = useState(existing?.taxRate ?? 0);
  const [terms, setTerms] = useState(existing?.termsAndConditions ?? '');
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  // Fetch profile and saved clients
  useEffect(() => {
    if (!user) return;
    // Auto-fill business info from profile (for new docs)
    if (!existing) {
      supabase
        .from('profiles')
        .select('business_name, business_address, business_phone, business_email, business_logo')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data && (data.business_name || data.business_email || data.business_phone)) {
            setBusiness({
              name: data.business_name || '',
              address: data.business_address || '',
              phone: data.business_phone || '',
              email: data.business_email || '',
              logo: data.business_logo || null,
            });
          }
        });
    }
    // Fetch saved clients
    supabase.from('clients').select('*').order('name').then(({ data }) => {
      if (data) setSavedClients(data);
    });
  }, [existing, user]);

  const handleSelectClient = (clientId: string) => {
    const c = savedClients.find(sc => sc.id === clientId);
    if (c) {
      setClient({ name: c.name, address: c.address, phone: c.phone, email: c.email });
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setBusiness(b => ({ ...b, logo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const subtotal = calculateSubtotal(items);
  const tax = calculateTax(subtotal, taxRate);
  const grandTotal = subtotal + tax;

  const handleSave = () => {
    if (!client.name.trim()) {
      toast.error('Client name is required');
      return;
    }
    if (!title.trim()) {
      toast.error('Quote title is required');
      return;
    }
    if (items.length === 0 || items.every(i => !i.description.trim())) {
      toast.error('Add at least one item');
      return;
    }

    // No longer using localStorage — profile is the source of truth

    if (existing) {
      updateDocument({ ...existing, businessInfo: business, clientInfo: client, title, items, taxRate, termsAndConditions: terms });
      toast.success('Document updated');
    } else {
      const doc: QuoteDocument = {
        id: generateId(),
        type: 'quote',
        quoteNumber: nextQuoteNumber(),
        title,
        businessInfo: business,
        clientInfo: client,
        items,
        taxRate,
        termsAndConditions: terms,
        createdAt: new Date().toISOString(),
      };
      addDocument(doc);
      toast.success('Quote saved');
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center gap-4 py-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-heading font-bold">{existing ? 'Edit Document' : 'Create New Quote'}</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
        {/* Business Info */}
        <Card className="p-6 space-y-4 animate-fade-in">
          <h2 className="font-heading font-semibold text-lg">Business Information</h2>
          <div className="flex items-center gap-4">
            <div
              className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-accent transition-colors overflow-hidden bg-muted"
              onClick={() => fileInputRef.current?.click()}
            >
              {business.logo ? (
                <img src={business.logo} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <p className="text-sm text-muted-foreground">Upload your business logo</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Business Name</Label><Input value={business.name} onChange={e => setBusiness(b => ({ ...b, name: e.target.value }))} placeholder="Your Business Name" /></div>
            <div><Label>Phone</Label><Input value={business.phone} onChange={e => setBusiness(b => ({ ...b, phone: e.target.value }))} placeholder="+1234567890" /></div>
            <div><Label>Email</Label><Input value={business.email} onChange={e => setBusiness(b => ({ ...b, email: e.target.value }))} placeholder="email@business.com" /></div>
            <div><Label>Address</Label><Input value={business.address} onChange={e => setBusiness(b => ({ ...b, address: e.target.value }))} placeholder="123 Business St" /></div>
          </div>
        </Card>

        {/* Client Info */}
        <Card className="p-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-semibold text-lg">Client Information</h2>
            {savedClients.length > 0 && (
              <Select onValueChange={handleSelectClient}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Select saved client" />
                </SelectTrigger>
                <SelectContent>
                  {savedClients.map(sc => (
                    <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Client Name / Company</Label><Input value={client.name} onChange={e => setClient(c => ({ ...c, name: e.target.value }))} placeholder="Client Name" /></div>
            <div><Label>Phone</Label><Input value={client.phone} onChange={e => setClient(c => ({ ...c, phone: e.target.value }))} placeholder="+1234567890" /></div>
            <div><Label>Email</Label><Input value={client.email} onChange={e => setClient(c => ({ ...c, email: e.target.value }))} placeholder="client@email.com" /></div>
            <div><Label>Address</Label><Input value={client.address} onChange={e => setClient(c => ({ ...c, address: e.target.value }))} placeholder="Client Address" /></div>
          </div>
        </Card>

        {/* Quote Title */}
        <Card className="p-6 space-y-4 animate-fade-in">
          <h2 className="font-heading font-semibold text-lg">Quote Title</h2>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Security Installation Quote" className="text-lg" />
        </Card>

        {/* Items Table */}
        <Card className="p-6 space-y-4 animate-fade-in">
          <h2 className="font-heading font-semibold text-lg">Items</h2>
          <div className="space-y-3">
            <div className="hidden sm:grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              <span>Description</span><span>Qty</span><span>Unit Price</span><span>Total</span><span></span>
            </div>
            {items.map(item => (
              <div key={item.id} className="grid sm:grid-cols-[1fr_80px_100px_100px_40px] gap-2 items-center">
                <Input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Item description" />
                <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)} />
                <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} />
                <div className="text-sm font-medium px-2">{formatCurrency(item.quantity * item.unitPrice)}</div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={addItem} className="gap-2">
            <Plus className="h-4 w-4" /> Add Item
          </Button>

          {/* Totals */}
          <div className="border-t pt-4 space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-sm items-center gap-2">
              <span className="text-muted-foreground">Tax (%)</span>
              <Input type="number" min={0} max={100} value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="w-20 h-8 text-right" />
              <span className="w-24 text-right">{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between font-heading font-bold text-lg border-t pt-2">
              <span>Grand Total</span><span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </Card>

        {/* Terms */}
        <Card className="p-6 space-y-4 animate-fade-in">
          <h2 className="font-heading font-semibold text-lg">Terms and Conditions</h2>
          <Textarea
            value={terms}
            onChange={e => setTerms(e.target.value)}
            placeholder="Payment terms, project timelines, warranty information..."
            rows={5}
          />
        </Card>

        <div className="flex justify-end pb-8">
          <Button size="lg" onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            {existing ? 'Update Document' : 'Save Quote'}
          </Button>
        </div>
      </main>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Search, Users, Pencil, Trash2, Building2, Mail, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  company: string;
  created_at: string;
}

export default function Clients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', company: '' });

  const fetchClients = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setClients(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, [user]);

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', address: '', company: '' });
    setEditingClient(null);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (c: Client) => {
    setEditingClient(c);
    setForm({ name: c.name, email: c.email, phone: c.phone, address: c.address, company: c.company });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) { toast.error('Client name is required'); return; }

    if (editingClient) {
      const { error } = await supabase.from('clients').update({
        name: form.name, email: form.email, phone: form.phone, address: form.address, company: form.company,
      }).eq('id', editingClient.id);
      if (error) { toast.error('Failed to update client'); return; }
      toast.success('Client updated');
    } else {
      const { error } = await supabase.from('clients').insert({
        user_id: user.id, name: form.name, email: form.email, phone: form.phone, address: form.address, company: form.company,
      });
      if (error) { toast.error('Failed to add client'); return; }
      toast.success('Client added');
    }
    setDialogOpen(false);
    resetForm();
    fetchClients();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { toast.error('Failed to delete client'); return; }
    toast.success('Client deleted');
    fetchClients();
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between py-3 sm:py-5 px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">Clients</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{clients.length} total clients</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs sm:text-sm" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Add Client</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Client name" /></div>
                <div><Label>Company</Label><Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company name" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1234567890" /></div>
                </div>
                <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" /></div>
                <Button onClick={handleSave} className="w-full">{editingClient ? 'Update Client' : 'Add Client'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Search */}
        <div className="relative mb-4 sm:mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." className="pl-9" />
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading clients...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center animate-fade-in">
            <Users className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground/40 mb-3" />
            <h2 className="text-lg sm:text-xl font-heading font-semibold mb-2">
              {search ? 'No clients found' : 'No clients yet'}
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              {search ? 'Try a different search term' : 'Add your first client to get started'}
            </p>
            {!search && (
              <Button onClick={openAdd} className="gap-2">
                <Plus className="h-4 w-4" /> Add Client
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(client => (
              <Card
                key={client.id}
                className="p-4 sm:p-5 flex flex-col gap-3 animate-fade-in hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-base sm:text-lg truncate">{client.name}</h3>
                    {client.company && (
                      <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 truncate">
                        <Building2 className="h-3 w-3 flex-shrink-0" /> {client.company}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(client)} className="h-7 w-7 p-0">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(client.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 text-xs sm:text-sm text-muted-foreground">
                  {client.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 flex-shrink-0" /> {client.email}</p>}
                  {client.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 flex-shrink-0" /> {client.phone}</p>}
                  {client.address && <p className="flex items-center gap-1.5 truncate"><MapPin className="h-3 w-3 flex-shrink-0" /> {client.address}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

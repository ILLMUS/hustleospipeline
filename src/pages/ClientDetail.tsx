import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useDocuments } from '@/context/DocumentContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateGrandTotal } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, FileText, StickyNote, Plus, Calendar, Trash2, Building2, Mail, Phone, MapPin } from 'lucide-react';
import { format } from 'date-fns';
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

interface ClientNote {
  id: string;
  content: string;
  follow_up_date: string | null;
  is_completed: boolean;
  created_at: string;
}

function formatCurrency(n: number) {
  return `E${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { documents } = useDocuments();

  const [client, setClient] = useState<Client | null>(null);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);

  const clientDocs = documents.filter(d =>
    d.clientInfo.name.toLowerCase() === client?.name.toLowerCase() ||
    (d.clientInfo.email && d.clientInfo.email.toLowerCase() === client?.email.toLowerCase() && client?.email)
  );

  const fetchClient = async () => {
    if (!user || !id) return;
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
    if (error || !data) { navigate('/clients'); return; }
    setClient(data);
  };

  const fetchNotes = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('client_notes')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false });
    setNotes(data || []);
  };

  useEffect(() => {
    Promise.all([fetchClient(), fetchNotes()]).then(() => setLoading(false));
  }, [user, id]);

  const addNote = async () => {
    if (!user || !id || !newNote.trim()) { toast.error('Note content is required'); return; }
    const { error } = await supabase.from('client_notes').insert({
      client_id: id,
      user_id: user.id,
      content: newNote,
      follow_up_date: followUpDate || null,
    });
    if (error) { toast.error('Failed to add note'); return; }
    toast.success('Note added');
    setNewNote('');
    setFollowUpDate('');
    setShowNoteForm(false);
    fetchNotes();
  };

  const toggleNoteComplete = async (note: ClientNote) => {
    await supabase.from('client_notes').update({ is_completed: !note.is_completed }).eq('id', note.id);
    fetchNotes();
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from('client_notes').delete().eq('id', noteId);
    toast.success('Note deleted');
    fetchNotes();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!client) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Client not found</div>;

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
        <div className="container mx-auto flex items-center gap-2 sm:gap-4 py-3 sm:py-5 px-3 sm:px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight truncate">{client.name}</h1>
            {client.company && <p className="text-xs sm:text-sm text-muted-foreground truncate">{client.company}</p>}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
        {/* Client Info Card */}
        <Card className="p-4 sm:p-6 animate-fade-in">
          <h2 className="font-heading font-semibold text-base sm:text-lg mb-3">Contact Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
            {client.company && <p className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4 flex-shrink-0" /> {client.company}</p>}
            {client.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4 flex-shrink-0" /> {client.email}</p>}
            {client.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4 flex-shrink-0" /> {client.phone}</p>}
            {client.address && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 flex-shrink-0" /> {client.address}</p>}
          </div>
        </Card>

        {/* Notes & Follow-ups */}
        <Card className="p-4 sm:p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-base sm:text-lg flex items-center gap-2">
              <StickyNote className="h-4 w-4 sm:h-5 sm:w-5" /> Notes & Follow-ups
            </h2>
            <Button size="sm" variant="outline" onClick={() => setShowNoteForm(!showNoteForm)} className="gap-1.5 text-xs sm:text-sm">
              <Plus className="h-3.5 w-3.5" /> Add Note
            </Button>
          </div>

          {showNoteForm && (
            <div className="border rounded-lg p-3 sm:p-4 mb-4 space-y-3 bg-muted/50">
              <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note or follow-up reminder..." rows={3} />
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Follow-up date (optional)</Label>
                  <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="mt-1" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addNote}>Save Note</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNoteForm(false); setNewNote(''); setFollowUpDate(''); }}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No notes yet. Add your first note above.</p>
          ) : (
            <div className="space-y-3">
              {notes.map(note => (
                <div key={note.id} className={`flex gap-3 rounded-lg p-3 border ${note.is_completed ? 'bg-muted/30 opacity-70' : 'bg-card'}`}>
                  <Checkbox
                    checked={note.is_completed}
                    onCheckedChange={() => toggleNoteComplete(note)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm whitespace-pre-wrap ${note.is_completed ? 'line-through text-muted-foreground' : ''}`}>{note.content}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{format(new Date(note.created_at), 'dd MMM yyyy')}</span>
                      {note.follow_up_date && (
                        <span className="flex items-center gap-1 text-accent">
                          <Calendar className="h-3 w-3" /> Follow-up: {format(new Date(note.follow_up_date), 'dd MMM yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteNote(note.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive flex-shrink-0">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Linked Documents */}
        <Card className="p-4 sm:p-6 animate-fade-in">
          <h2 className="font-heading font-semibold text-base sm:text-lg flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" /> Linked Documents
          </h2>
          {clientDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No documents linked to this client yet.</p>
          ) : (
            <div className="space-y-2">
              {clientDocs.map(doc => {
                const total = calculateGrandTotal(doc.items, doc.taxRate);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/preview/${doc.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">{doc.quoteNumber} · {format(new Date(doc.createdAt), 'dd MMM yyyy')}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-heading font-bold">{formatCurrency(total)}</span>
                      <Badge variant="outline" className={`${typeBadge(doc.type)} text-[10px]`}>
                        {doc.type.charAt(0).toUpperCase() + doc.type.slice(1)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

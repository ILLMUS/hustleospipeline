import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Save, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  business_logo: string | null;
  avatar_url: string | null;
}

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    display_name: '',
    business_name: '',
    business_address: '',
    business_phone: '',
    business_email: '',
    business_logo: '',
  });

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setForm({
          display_name: data.display_name || '',
          business_name: data.business_name || '',
          business_address: data.business_address || '',
          business_phone: data.business_phone || '',
          business_email: data.business_email || '',
          business_logo: data.business_logo || '',
        });
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(prev => ({ ...prev, business_logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: form.display_name || null,
        business_name: form.business_name || null,
        business_address: form.business_address || null,
        business_phone: form.business_phone || null,
        business_email: form.business_email || null,
        business_logo: form.business_logo || null,
      })
      .eq('user_id', user.id);

    setSaving(false);
    if (error) {
      toast.error('Failed to save profile');
    } else {
      toast.success('Profile saved successfully');
    }
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between py-5 px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-heading font-bold tracking-tight">Profile Settings</h1>
              <p className="text-sm text-muted-foreground">Manage your business information</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="space-y-6">
          {/* Personal Info */}
          <Card className="p-6">
            <h2 className="font-heading font-semibold text-lg mb-4">Personal Info</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="display_name">Display Name</Label>
                <Input
                  id="display_name"
                  value={form.display_name}
                  onChange={e => update('display_name', e.target.value)}
                  placeholder="Your name"
                  className="mt-1.5"
                />
              </div>
            </div>
          </Card>

          {/* Business Info */}
          <Card className="p-6">
            <h2 className="font-heading font-semibold text-lg mb-4">Business Details</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="business_name">Business Name</Label>
                <Input
                  id="business_name"
                  value={form.business_name}
                  onChange={e => update('business_name', e.target.value)}
                  placeholder="Your business name"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="business_address">Address</Label>
                <Input
                  id="business_address"
                  value={form.business_address}
                  onChange={e => update('business_address', e.target.value)}
                  placeholder="Business address"
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="business_phone">Phone</Label>
                  <Input
                    id="business_phone"
                    value={form.business_phone}
                    onChange={e => update('business_phone', e.target.value)}
                    placeholder="+1234567890"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="business_email">Email</Label>
                  <Input
                    id="business_email"
                    value={form.business_email}
                    onChange={e => update('business_email', e.target.value)}
                    placeholder="business@email.com"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Logo */}
          <Card className="p-6">
            <h2 className="font-heading font-semibold text-lg mb-4">Business Logo</h2>
            <div className="space-y-4">
              {form.business_logo ? (
                <div className="flex items-start gap-4">
                  <div className="border rounded-lg p-3 bg-muted">
                    <img src={form.business_logo} alt="Business logo" className="h-20 w-auto object-contain" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => update('business_logo', '')}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Upload your business logo (max 2MB)</p>
                  <label>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    <Button variant="outline" size="sm" asChild>
                      <span>Choose File</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

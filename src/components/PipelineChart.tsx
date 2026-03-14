import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const STAGES = [
  { key: 'lead', label: 'Lead', color: 'hsl(220, 18%, 18%)' },
  { key: 'proposal', label: 'Proposal', color: 'hsl(40, 60%, 50%)' },
  { key: 'negotiation', label: 'Negotiation', color: 'hsl(30, 70%, 50%)' },
  { key: 'won', label: 'Won', color: 'hsl(142, 60%, 40%)' },
  { key: 'lost', label: 'Lost', color: 'hsl(0, 72%, 51%)' },
];

function formatCurrency(amount: number) {
  return `E${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function PipelineChart() {
  const { user } = useAuth();
  const [data, setData] = useState<{ stage: string; value: number; color: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: deals } = await supabase.from('deals').select('stage, value');
      if (!deals) return;
      const totals: Record<string, number> = {};
      deals.forEach(d => {
        totals[d.stage] = (totals[d.stage] || 0) + Number(d.value);
      });
      setData(STAGES.map(s => ({ stage: s.label, value: totals[s.key] || 0, color: s.color })));
    };
    fetch();
  }, [user]);

  const hasData = data.some(d => d.value > 0);

  if (!hasData) return null;

  return (
    <Card className="p-3 sm:p-4 mb-4 sm:mb-6">
      <h3 className="text-sm font-heading font-semibold mb-3 text-foreground">Pipeline by Stage</h3>
      <div className="h-48 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="stage" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} tickFormatter={formatCurrency} width={60} />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), 'Total Value']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

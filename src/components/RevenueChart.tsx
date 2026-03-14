import { useMemo } from 'react';
import { useDocuments } from '@/context/DocumentContext';
import { calculateGrandTotal } from '@/types/document';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, startOfMonth, subMonths } from 'date-fns';

function formatCurrency(amount: number) {
  return `E${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function RevenueChart() {
  const { documents } = useDocuments();

  const data = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(now, i));
      months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') });
    }

    const totals: Record<string, number> = {};
    documents
      .filter(d => d.type === 'invoice' || d.type === 'receipt')
      .forEach(doc => {
        const monthKey = format(new Date(doc.createdAt), 'yyyy-MM');
        totals[monthKey] = (totals[monthKey] || 0) + calculateGrandTotal(doc.items, doc.taxRate);
      });

    return months.map(m => ({ month: m.label, revenue: totals[m.key] || 0 }));
  }, [documents]);

  const hasData = data.some(d => d.revenue > 0);
  if (!hasData) return null;

  return (
    <Card className="p-3 sm:p-4 mb-4 sm:mb-6">
      <h3 className="text-sm font-heading font-semibold mb-3 text-foreground">Monthly Revenue</h3>
      <div className="h-48 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" axisLine={false} tickLine={false} tickFormatter={formatCurrency} width={60} />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), 'Revenue']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
            />
            <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

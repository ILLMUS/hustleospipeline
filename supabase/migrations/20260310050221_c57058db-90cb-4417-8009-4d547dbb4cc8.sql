
-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'quote',
  quote_number TEXT NOT NULL,
  invoice_number TEXT,
  receipt_number TEXT,
  title TEXT NOT NULL DEFAULT '',
  business_info JSONB NOT NULL DEFAULT '{}',
  client_info JSONB NOT NULL DEFAULT '{}',
  items JSONB NOT NULL DEFAULT '[]',
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  terms_and_conditions TEXT NOT NULL DEFAULT '',
  issue_date TEXT,
  due_date TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Allow all access (no auth for now)
CREATE POLICY "Allow all access to documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);

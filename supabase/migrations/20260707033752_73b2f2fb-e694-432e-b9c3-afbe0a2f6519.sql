
-- Allocation settings (one row per user)
CREATE TABLE public.allocation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  expenses_pct NUMERIC NOT NULL DEFAULT 40,
  reserve_pct  NUMERIC NOT NULL DEFAULT 20,
  taxes_pct    NUMERIC NOT NULL DEFAULT 25,
  debts_pct    NUMERIC NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT allocation_settings_pct_sum CHECK (expenses_pct + reserve_pct + taxes_pct + debts_pct = 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_settings TO authenticated;
GRANT ALL ON public.allocation_settings TO service_role;
ALTER TABLE public.allocation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings select" ON public.allocation_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own settings insert" ON public.allocation_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own settings update" ON public.allocation_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own settings delete" ON public.allocation_settings FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_allocation_settings_updated BEFORE UPDATE ON public.allocation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Money entries (snapshot of a receipt for tracking)
CREATE TABLE public.money_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_id UUID UNIQUE REFERENCES public.documents(id) ON DELETE SET NULL,
  receipt_number TEXT,
  client_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  amount NUMERIC NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.money_entries TO authenticated;
GRANT ALL ON public.money_entries TO service_role;
ALTER TABLE public.money_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own entries select" ON public.money_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own entries insert" ON public.money_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own entries update" ON public.money_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own entries delete" ON public.money_entries FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX money_entries_user_idx ON public.money_entries(user_id, entry_date DESC);
CREATE TRIGGER trg_money_entries_updated BEFORE UPDATE ON public.money_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allocations ledger
CREATE TABLE public.allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  money_entry_id UUID NOT NULL REFERENCES public.money_entries(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (bucket IN ('expenses','reserve','taxes','debts')),
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  is_auto BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alloc select" ON public.allocations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own alloc insert" ON public.allocations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own alloc update" ON public.allocations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own alloc delete" ON public.allocations FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX allocations_user_bucket_idx ON public.allocations(user_id, bucket);
CREATE INDEX allocations_entry_idx ON public.allocations(money_entry_id);

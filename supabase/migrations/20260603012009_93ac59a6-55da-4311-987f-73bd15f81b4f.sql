ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS footer_line_1 text,
  ADD COLUMN IF NOT EXISTS footer_line_2 text,
  ADD COLUMN IF NOT EXISTS footer_reference text,
  ADD COLUMN IF NOT EXISTS footer_page_format text;
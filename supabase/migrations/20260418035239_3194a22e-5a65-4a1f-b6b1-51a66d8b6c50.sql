CREATE TABLE public.bill_analyses (
  url TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT,
  introduced_date TIMESTAMPTZ,
  summary TEXT,
  sponsors JSONB NOT NULL DEFAULT '[]'::jsonb,
  impacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bill_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cached bill analyses"
ON public.bill_analyses FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert bill analyses"
ON public.bill_analyses FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update bill analyses"
ON public.bill_analyses FOR UPDATE
USING (true);

CREATE INDEX idx_bill_analyses_number ON public.bill_analyses(number);
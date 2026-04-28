-- Add fields for societal impacts, narrative brief, content hash (change detection), and last-checked timestamp
ALTER TABLE public.bill_analyses
  ADD COLUMN IF NOT EXISTS societal_impacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS narrative_brief text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz NOT NULL DEFAULT now();

-- Allow the cron-triggered refresh to update cached rows
DROP POLICY IF EXISTS "Service role can update bill analyses" ON public.bill_analyses;
CREATE POLICY "Service role can update bill analyses"
ON public.bill_analyses
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Enable required extensions for scheduled refresh
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
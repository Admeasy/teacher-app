
ALTER TABLE public.global_rag_sources
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_explanation text,
  ADD COLUMN IF NOT EXISTS error_suggestion text;

ALTER TABLE public.workspace_rag_sources
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_explanation text,
  ADD COLUMN IF NOT EXISTS error_suggestion text;

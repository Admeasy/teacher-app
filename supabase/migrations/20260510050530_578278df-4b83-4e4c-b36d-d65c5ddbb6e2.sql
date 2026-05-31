CREATE TABLE IF NOT EXISTS public.workspace_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fact',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memory_ws ON public.workspace_memory(workspace_id);

ALTER TABLE public.workspace_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read memory"
ON public.workspace_memory FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_memory.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "members insert memory"
ON public.workspace_memory FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_memory.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "members update memory"
ON public.workspace_memory FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_memory.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "members delete memory"
ON public.workspace_memory FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_memory.workspace_id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_workspace_memory_updated ON public.workspace_memory;
CREATE TRIGGER trg_workspace_memory_updated
BEFORE UPDATE ON public.workspace_memory
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.voice_command_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  transcript TEXT NOT NULL,
  response TEXT,
  page_context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_history_workspace_created_idx
  ON public.voice_command_history (workspace_id, created_at DESC);

ALTER TABLE public.voice_command_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read voice history"
  ON public.voice_command_history FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "members can insert voice history"
  ON public.voice_command_history FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "members can delete voice history"
  ON public.voice_command_history FOR DELETE
  USING (public.is_workspace_member(workspace_id));

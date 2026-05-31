-- AI Conversations + Messages for persistent terminal
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_workspace ON public.ai_conversations(workspace_id, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read conv" ON public.ai_conversations FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws insert conv" ON public.ai_conversations FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws update conv" ON public.ai_conversations FOR UPDATE USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws delete conv" ON public.ai_conversations FOR DELETE USING (public.is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON public.ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_msg_workspace ON public.ai_messages(workspace_id, created_at DESC);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read msg" ON public.ai_messages FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws insert msg" ON public.ai_messages FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws update msg" ON public.ai_messages FOR UPDATE USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws delete msg" ON public.ai_messages FOR DELETE USING (public.is_workspace_member(workspace_id));

-- Trigger to bump conversation updated_at
CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ai_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_conv ON public.ai_messages;
CREATE TRIGGER trg_bump_conv AFTER INSERT ON public.ai_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_conversations;
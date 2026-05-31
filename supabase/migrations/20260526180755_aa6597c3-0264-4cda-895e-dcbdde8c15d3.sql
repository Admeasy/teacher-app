
-- ai_tool_executions
CREATE TABLE public.ai_tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  conversation_id uuid,
  workflow_id uuid,
  tool text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  status text NOT NULL DEFAULT 'ok',
  error text,
  affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  undo jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_tool_executions TO authenticated;
GRANT ALL ON public.ai_tool_executions TO service_role;
ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read ai_tool_executions" ON public.ai_tool_executions FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert ai_tool_executions" ON public.ai_tool_executions FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update ai_tool_executions" ON public.ai_tool_executions FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete ai_tool_executions" ON public.ai_tool_executions FOR DELETE USING (is_workspace_member(workspace_id));
CREATE INDEX idx_ai_tool_exec_ws_created ON public.ai_tool_executions (workspace_id, created_at DESC);

-- ai_workflows
CREATE TABLE public.ai_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  conversation_id uuid,
  prompt text NOT NULL,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running',
  step_count integer NOT NULL DEFAULT 0,
  summary text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_workflows TO authenticated;
GRANT ALL ON public.ai_workflows TO service_role;
ALTER TABLE public.ai_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read ai_workflows" ON public.ai_workflows FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert ai_workflows" ON public.ai_workflows FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update ai_workflows" ON public.ai_workflows FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete ai_workflows" ON public.ai_workflows FOR DELETE USING (is_workspace_member(workspace_id));
CREATE INDEX idx_ai_workflows_ws_created ON public.ai_workflows (workspace_id, created_at DESC);

-- ai_activity_stream
CREATE TABLE public.ai_activity_stream (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  kind text NOT NULL,
  ref_id uuid,
  label text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_activity_stream TO authenticated;
GRANT ALL ON public.ai_activity_stream TO service_role;
ALTER TABLE public.ai_activity_stream ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read ai_activity_stream" ON public.ai_activity_stream FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert ai_activity_stream" ON public.ai_activity_stream FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws delete ai_activity_stream" ON public.ai_activity_stream FOR DELETE USING (is_workspace_member(workspace_id));
CREATE INDEX idx_ai_activity_ws_created ON public.ai_activity_stream (workspace_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_tool_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_workflows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_activity_stream;

CREATE TABLE public.call_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  student_name text,
  parent_name text,
  parent_phone text,
  call_type text,
  status text DEFAULT 'initiated',
  script text,
  exotel_call_id text,
  duration integer,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read" ON public.call_logs FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert" ON public.call_logs FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update" ON public.call_logs FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete" ON public.call_logs FOR DELETE USING (is_workspace_member(workspace_id));

CREATE TABLE public.extension_context (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  source_url text,
  page_title text,
  scraped_data jsonb DEFAULT '{}'::jsonb,
  snapshot_label text,
  saved_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.extension_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read" ON public.extension_context FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert" ON public.extension_context FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update" ON public.extension_context FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete" ON public.extension_context FOR DELETE USING (is_workspace_member(workspace_id));

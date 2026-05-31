
-- Per-school knowledge sources
CREATE TABLE IF NOT EXISTS public.workspace_rag_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  name text NOT NULL,
  board text,
  class text,
  subject text,
  chapter text,
  source_type text NOT NULL DEFAULT 'notes',
  source_kind text NOT NULL DEFAULT 'file',
  storage_path text,
  file_size bigint,
  page_count integer,
  chunk_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error text,
  uploaded_by uuid,
  parent_zip_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_rag_sources_ws_idx ON public.workspace_rag_sources(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_rag_sources_parent_idx ON public.workspace_rag_sources(parent_zip_id);

ALTER TABLE public.workspace_rag_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read rag sources"
  ON public.workspace_rag_sources FOR SELECT
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws insert rag sources"
  ON public.workspace_rag_sources FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws update rag sources"
  ON public.workspace_rag_sources FOR UPDATE
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws delete rag sources"
  ON public.workspace_rag_sources FOR DELETE
  USING (public.is_workspace_member(workspace_id));

CREATE TRIGGER workspace_rag_sources_set_updated_at
  BEFORE UPDATE ON public.workspace_rag_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend global sources + chunks with zip linkage / kind
ALTER TABLE public.global_rag_sources
  ADD COLUMN IF NOT EXISTS parent_zip_id uuid,
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'file';

ALTER TABLE public.workspace_rag_chunks
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS board text,
  ADD COLUMN IF NOT EXISTS class text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS chapter text,
  ADD COLUMN IF NOT EXISTS parent_zip_id uuid;

CREATE INDEX IF NOT EXISTS workspace_rag_chunks_ws_source_idx
  ON public.workspace_rag_chunks(workspace_id, source_id);

-- Private storage bucket for per-school knowledge files
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-knowledge', 'workspace-knowledge', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: members of {workspace_id} folder can read/write
CREATE POLICY "ws read workspace-knowledge"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'workspace-knowledge'
    AND public.is_workspace_member((storage.foldername(name))[1])
  );
CREATE POLICY "ws insert workspace-knowledge"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'workspace-knowledge'
    AND public.is_workspace_member((storage.foldername(name))[1])
  );
CREATE POLICY "ws update workspace-knowledge"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'workspace-knowledge'
    AND public.is_workspace_member((storage.foldername(name))[1])
  );
CREATE POLICY "ws delete workspace-knowledge"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'workspace-knowledge'
    AND public.is_workspace_member((storage.foldername(name))[1])
  );

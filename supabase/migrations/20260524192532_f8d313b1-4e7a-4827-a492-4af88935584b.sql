
-- 1. Tracking columns on students/teachers
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_students_ws_active ON public.students(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_teachers_ws_active ON public.teachers(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_students_batch_id ON public.students(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_teachers_batch_id ON public.teachers(import_batch_id);

-- 2. Import batches table
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  uploaded_by uuid,
  entity_type text NOT NULL,                 -- students | teachers | mixed
  file_name text,
  scope jsonb,                                -- e.g. { classes: ["6A","7B"] }
  total_rows integer NOT NULL DEFAULT 0,
  created_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  deactivated_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  errors jsonb,
  status text NOT NULL DEFAULT 'completed',  -- completed | failed | partial
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_ws_created ON public.import_batches(workspace_id, created_at DESC);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws read batches" ON public.import_batches;
DROP POLICY IF EXISTS "ws insert batches" ON public.import_batches;
DROP POLICY IF EXISTS "ws update batches" ON public.import_batches;

CREATE POLICY "ws read batches"   ON public.import_batches FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert batches" ON public.import_batches FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update batches" ON public.import_batches FOR UPDATE USING (is_workspace_member(workspace_id));

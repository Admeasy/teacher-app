ALTER TABLE public.timetable_settings
  ADD COLUMN IF NOT EXISTS school_level text NOT NULL DEFAULT 'All',
  ADD COLUMN IF NOT EXISTS library_config jsonb NOT NULL DEFAULT '{"enabled":true,"applies_to_classes":[6,7,8,9,10,11,12],"frequency":"weekly","preferred_day":null,"preferred_period":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS sports_config jsonb NOT NULL DEFAULT '{"enabled":true,"applies_to_classes":[6,7,8,9,10,11,12],"frequency":"twice_weekly","preferred_day":null,"preferred_period":null,"teacher_id":null}'::jsonb;

ALTER TABLE public.timetable
  ADD COLUMN IF NOT EXISTS slash_subject text,
  ADD COLUMN IF NOT EXISTS slash_teacher text,
  ADD COLUMN IF NOT EXISTS slash_teacher_id uuid;

CREATE TABLE IF NOT EXISTS public.class_subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id text NOT NULL,
  class text NOT NULL,
  stream text,
  subject text NOT NULL,
  kind text NOT NULL DEFAULT 'major',
  is_major boolean NOT NULL DEFAULT true,
  optional_group text,
  periods_per_week integer NOT NULL DEFAULT 5,
  teacher_id uuid,
  teacher_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, class, stream, subject)
);

CREATE INDEX IF NOT EXISTS idx_class_subjects_ws ON public.class_subjects(workspace_id, class);

ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws read class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "ws insert class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "ws update class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "ws delete class_subjects" ON public.class_subjects;

CREATE POLICY "ws read class_subjects"
ON public.class_subjects FOR SELECT
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "ws insert class_subjects"
ON public.class_subjects FOR INSERT
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "ws update class_subjects"
ON public.class_subjects FOR UPDATE
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "ws delete class_subjects"
ON public.class_subjects FOR DELETE
USING (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS class_subjects_set_updated_at ON public.class_subjects;
CREATE TRIGGER class_subjects_set_updated_at
  BEFORE UPDATE ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
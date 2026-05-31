
-- class_assignments: which teacher is assigned to a class/section in what role
CREATE TABLE IF NOT EXISTS public.class_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  class text NOT NULL,
  section text NOT NULL,
  role text NOT NULL DEFAULT 'class_teacher',
  teacher_id uuid,
  teacher_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, class, section, role)
);
CREATE INDEX IF NOT EXISTS idx_class_assignments_ws ON public.class_assignments(workspace_id, class, section);
ALTER TABLE public.class_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read class_assignments" ON public.class_assignments FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert class_assignments" ON public.class_assignments FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update class_assignments" ON public.class_assignments FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete class_assignments" ON public.class_assignments FOR DELETE USING (is_workspace_member(workspace_id));
CREATE TRIGGER class_assignments_set_updated_at BEFORE UPDATE ON public.class_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- timetable: weekly periods for a class/section
CREATE TABLE IF NOT EXISTS public.timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  class text NOT NULL,
  section text NOT NULL,
  day text NOT NULL,           -- Mon..Sat
  period int NOT NULL,         -- 1..8
  subject text,
  teacher_id uuid,
  teacher_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, class, section, day, period)
);
CREATE INDEX IF NOT EXISTS idx_timetable_ws ON public.timetable(workspace_id, class, section);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON public.timetable(workspace_id, teacher_id);
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read timetable" ON public.timetable FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert timetable" ON public.timetable FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update timetable" ON public.timetable FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete timetable" ON public.timetable FOR DELETE USING (is_workspace_member(workspace_id));
CREATE TRIGGER timetable_set_updated_at BEFORE UPDATE ON public.timetable FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- substitutions: who covered for whom on which day/period
CREATE TABLE IF NOT EXISTS public.substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  class text NOT NULL,
  section text NOT NULL,
  day text NOT NULL,
  period int NOT NULL,
  date date,
  original_teacher_id uuid,
  original_teacher_name text,
  substitute_teacher_id uuid,
  substitute_teacher_name text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_substitutions_ws ON public.substitutions(workspace_id, class, section, day, period);
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read substitutions" ON public.substitutions FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert substitutions" ON public.substitutions FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update substitutions" ON public.substitutions FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete substitutions" ON public.substitutions FOR DELETE USING (is_workspace_member(workspace_id));

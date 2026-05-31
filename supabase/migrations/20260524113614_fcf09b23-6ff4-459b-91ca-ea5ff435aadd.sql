
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS school_code text,
  ADD COLUMN IF NOT EXISTS principal_name text,
  ADD COLUMN IF NOT EXISTS principal_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS logo_url text;

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_uniq ON public.workspaces(slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_school_code_uniq ON public.workspaces(school_code) WHERE school_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS workspaces_name_trgm ON public.workspaces USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  class_name text NOT NULL,
  section text,
  academic_year text,
  class_teacher_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS classes_uniq ON public.classes(workspace_id, class_name, COALESCE(section,''), COALESCE(academic_year,''));
CREATE INDEX IF NOT EXISTS classes_ws_idx ON public.classes(workspace_id);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read classes"   ON public.classes FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert classes" ON public.classes FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update classes" ON public.classes FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete classes" ON public.classes FOR DELETE USING (is_workspace_member(workspace_id));

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_id uuid;
CREATE INDEX IF NOT EXISTS students_class_id_idx ON public.students(workspace_id, class_id);

CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  teacher_id uuid NOT NULL,
  class_id uuid NOT NULL,
  subject text,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ta_uniq ON public.teacher_assignments(workspace_id, teacher_id, class_id, COALESCE(subject,''));
CREATE INDEX IF NOT EXISTS ta_ws_teacher_idx ON public.teacher_assignments(workspace_id, teacher_id);
CREATE INDEX IF NOT EXISTS ta_ws_class_idx ON public.teacher_assignments(workspace_id, class_id);
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read ta"   ON public.teacher_assignments FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert ta" ON public.teacher_assignments FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update ta" ON public.teacher_assignments FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete ta" ON public.teacher_assignments FOR DELETE USING (is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  name text,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admins_ws_email_uniq ON public.admins(workspace_id, lower(email));
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all admins" ON public.admins FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  class_id uuid,
  student_id uuid NOT NULL,
  teacher_id uuid,
  status text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS att_ws_student_date_idx ON public.attendance_records(workspace_id, student_id, date DESC);
CREATE INDEX IF NOT EXISTS att_ws_class_date_idx ON public.attendance_records(workspace_id, class_id, date DESC);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read att"   ON public.attendance_records FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert att" ON public.attendance_records FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update att" ON public.attendance_records FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete att" ON public.attendance_records FOR DELETE USING (is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.fee_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  student_id uuid NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_amount numeric GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  due_date date,
  payment_status text DEFAULT 'pending',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fees_ws_student_idx ON public.fee_records(workspace_id, student_id);
ALTER TABLE public.fee_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read fees"   ON public.fee_records FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert fees" ON public.fee_records FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update fees" ON public.fee_records FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete fees" ON public.fee_records FOR DELETE USING (is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  class_id uuid,
  teacher_id uuid,
  subject text,
  title text NOT NULL,
  total_marks numeric NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tests_ws_class_idx ON public.tests(workspace_id, class_id);
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read tests"   ON public.tests FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert tests" ON public.tests FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update tests" ON public.tests FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete tests" ON public.tests FOR DELETE USING (is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  test_id uuid NOT NULL,
  student_id uuid NOT NULL,
  obtained_marks numeric NOT NULL DEFAULT 0,
  percentage numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tr_ws_test_idx ON public.test_results(workspace_id, test_id);
CREATE INDEX IF NOT EXISTS tr_ws_student_idx ON public.test_results(workspace_id, student_id);
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read tr"   ON public.test_results FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY "ws insert tr" ON public.test_results FOR INSERT WITH CHECK (is_workspace_member(workspace_id));
CREATE POLICY "ws update tr" ON public.test_results FOR UPDATE USING (is_workspace_member(workspace_id));
CREATE POLICY "ws delete tr" ON public.test_results FOR DELETE USING (is_workspace_member(workspace_id));

CREATE TABLE IF NOT EXISTS public.student_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  student_id uuid NOT NULL,
  prompt text,
  mode text,
  tokens_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sai_ws_student_idx ON public.student_ai_usage(workspace_id, student_id, created_at DESC);
ALTER TABLE public.student_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all sai" ON public.student_ai_usage FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.teacher_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  teacher_id uuid NOT NULL,
  prompt text,
  mode text,
  tokens_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tai_ws_teacher_idx ON public.teacher_ai_usage(workspace_id, teacher_id, created_at DESC);
ALTER TABLE public.teacher_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all tai" ON public.teacher_ai_usage FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

INSERT INTO public.classes (workspace_id, class_name, section)
SELECT DISTINCT workspace_id, class, COALESCE(section,'')
FROM public.students
WHERE class IS NOT NULL AND workspace_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.students s
SET class_id = c.id
FROM public.classes c
WHERE s.class_id IS NULL
  AND s.workspace_id = c.workspace_id
  AND s.class = c.class_name
  AND COALESCE(s.section,'') = COALESCE(c.section,'');

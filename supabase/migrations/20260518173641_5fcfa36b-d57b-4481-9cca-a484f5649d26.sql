
-- 1. timetable_settings (multiple profiles per workspace)
CREATE TABLE public.timetable_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Schedule',
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_time TEXT NOT NULL DEFAULT '08:00',
  period_duration INTEGER NOT NULL DEFAULT 45,
  periods_per_day INTEGER NOT NULL DEFAULT 8,
  short_break_after INTEGER NOT NULL DEFAULT 3,
  short_break_duration INTEGER NOT NULL DEFAULT 15,
  lunch_break_after INTEGER NOT NULL DEFAULT 5,
  lunch_break_duration INTEGER NOT NULL DEFAULT 30,
  working_days TEXT[] NOT NULL DEFAULT ARRAY['MON','TUE','WED','THU','FRI','SAT'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.timetable_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read tt_settings" ON public.timetable_settings FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws insert tt_settings" ON public.timetable_settings FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws update tt_settings" ON public.timetable_settings FOR UPDATE USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws delete tt_settings" ON public.timetable_settings FOR DELETE USING (public.is_workspace_member(workspace_id));
CREATE TRIGGER tt_settings_set_updated_at BEFORE UPDATE ON public.timetable_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. upload_logs
CREATE TABLE public.upload_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  upload_batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  upload_type TEXT NOT NULL DEFAULT 'students',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_user_id UUID,
  file_name TEXT,
  total_records INTEGER DEFAULT 0,
  classes_included TEXT[] DEFAULT ARRAY[]::TEXT[],
  version_label TEXT DEFAULT 'v1.0',
  previous_batch_id UUID,
  changes_summary JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
);
ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read upload_logs" ON public.upload_logs FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws insert upload_logs" ON public.upload_logs FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws update upload_logs" ON public.upload_logs FOR UPDATE USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws delete upload_logs" ON public.upload_logs FOR DELETE USING (public.is_workspace_member(workspace_id));

-- 3. non_teaching_staff
CREATE TABLE public.non_teaching_staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  staff_id TEXT,
  name TEXT NOT NULL,
  gender TEXT,
  phone TEXT,
  email TEXT,
  aadhar TEXT,
  department_tag TEXT,
  sub_role TEXT,
  shift TEXT,
  employee_type TEXT,
  salary NUMERIC,
  join_date DATE,
  reporting_to TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.non_teaching_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read staff" ON public.non_teaching_staff FOR SELECT USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws insert staff" ON public.non_teaching_staff FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "ws update staff" ON public.non_teaching_staff FOR UPDATE USING (public.is_workspace_member(workspace_id));
CREATE POLICY "ws delete staff" ON public.non_teaching_staff FOR DELETE USING (public.is_workspace_member(workspace_id));
CREATE TRIGGER staff_set_updated_at BEFORE UPDATE ON public.non_teaching_staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. students versioning columns
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS upload_batch_id UUID,
  ADD COLUMN IF NOT EXISTS version TEXT DEFAULT 'v1.0',
  ADD COLUMN IF NOT EXISTS upload_date TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS roll_number TEXT;
CREATE INDEX IF NOT EXISTS idx_students_batch ON public.students(workspace_id, upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_students_roll ON public.students(workspace_id, roll_number);

-- 5. stream columns on class_assignments + timetable
ALTER TABLE public.class_assignments ADD COLUMN IF NOT EXISTS stream TEXT;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS stream TEXT;

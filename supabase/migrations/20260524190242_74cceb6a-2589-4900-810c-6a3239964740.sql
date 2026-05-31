
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS reporting_teacher_id uuid,
  ADD COLUMN IF NOT EXISTS reporting_teacher_name_snapshot text,
  ADD COLUMN IF NOT EXISTS marked_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Normalise status values just in case
UPDATE public.attendance_records SET status = lower(status) WHERE status <> lower(status);

-- Unique: one attendance row per student per day
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_student_date_uidx
  ON public.attendance_records (student_id, date);

CREATE INDEX IF NOT EXISTS attendance_records_workspace_date_idx
  ON public.attendance_records (workspace_id, date);
CREATE INDEX IF NOT EXISTS attendance_records_class_date_idx
  ON public.attendance_records (class_id, date);
CREATE INDEX IF NOT EXISTS attendance_records_teacher_date_idx
  ON public.attendance_records (teacher_id, date);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_attendance_records_updated_at ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
